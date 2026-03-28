import { useMemo, useState, type FormEvent } from 'react'
import { STATUS_LABELS, STATUS_ORDER } from '../constants'
import type {
  Appeal,
  AppealCriticality,
  AppealStatus,
  ClientCompany,
  Employee,
  FileAttachment,
  ProductCatalogItem,
  Site,
  UserProfile,
} from '../types'
import { formatBytes, formatDateTime, truncate } from '../utils/format'
import {
  canAssignResponsible,
  canChangeStatus,
  canCreateAppealType,
  canEditAppeal,
  canLinkAppeals,
  canViewAppeal,
} from '../utils/permissions'
import { CustomSelect } from '../components/CustomSelect'

interface AppealsModuleProps {
  user: UserProfile
  appeals: Appeal[]
  employees: Employee[]
  clients: ClientCompany[]
  sites: Site[]
  products: ProductCatalogItem[]
  selectedAppealId: string | null
  onSelectAppeal: (appealId: string | null) => void
  onCreateAppeal: (draft: Omit<Appeal, 'id'>) => Promise<void>
  onUpdateAppeal: (appealId: string, patch: Partial<Appeal>) => Promise<void>
  onAddComment: (appealId: string, text: string, files: FileAttachment[]) => Promise<void>
  onLinkAppeal: (appealId: string, linkedAppealId: string) => Promise<void>
  onUnlinkAppeal: (appealId: string, linkedAppealId: string) => Promise<void>
  onOpenSite: (siteId: string) => void
  onOpenCustomer: (clientId: string) => void
}

type CreateFormState = {
  typeId: Appeal['typeId']
  description: string
  criticalityId: AppealCriticality
  productId: string
  clientId: string
  siteId: string
}

const criticalityOptions: Array<{ value: AppealCriticality; label: string }> = [
  { value: 'Basic', label: 'Базовая' },
  { value: 'Important', label: 'Важная' },
  { value: 'Critical', label: 'Критичная' },
]

function nextAppealTitle(typeId: Appeal['typeId'], appeals: Appeal[]): string {
  const prefix = typeId === 'KTP' ? 'CRM' : 'Наряд'

  const number =
    appeals
      .map((appeal) => {
        if (!appeal.title.startsWith(prefix)) {
          return 0
        }

        const safeNumber = Number(appeal.title.split('-')[1])
        return Number.isFinite(safeNumber) ? safeNumber : 0
      })
      .reduce((max, current) => Math.max(max, current), 0) + 1

  return `${prefix}-${number}`
}

function defaultCreateState(
  user: UserProfile,
  clients: ClientCompany[],
  sites: Site[],
  products: ProductCatalogItem[],
): CreateFormState {
  const firstClientId = user.clientId ?? clients[0]?.id ?? ''
  const firstClientSites = sites.filter((site) => site.clientId === firstClientId)
  const firstSite = firstClientSites[0]

  return {
    typeId: user.role === 'wfm' ? 'WFM' : 'KTP',
    description: '',
    criticalityId: 'Basic',
    productId: firstSite?.productIds[0] ?? products[0]?.id ?? '',
    clientId: firstClientId,
    siteId: firstSite?.id ?? '',
  }
}

function getResponsibleCandidates(
  user: UserProfile,
  employees: Employee[],
  selectedAppeal: Appeal,
): Employee[] {
  if (user.role === 'admin') {
    return employees
  }

  if (user.role === 'ktp') {
    return employees.filter((employee) => employee.role === 'wfm')
  }

  if (user.role === 'wfm') {
    return employees.filter((employee) => employee.role === 'ktp')
  }

  return selectedAppeal.responsibleId
    ? employees.filter((employee) => employee.accountId === selectedAppeal.responsibleId)
    : []
}

export function AppealsModule({
  user,
  appeals,
  employees,
  clients,
  sites,
  products,
  selectedAppealId,
  onSelectAppeal,
  onCreateAppeal,
  onUpdateAppeal,
  onAddComment,
  onLinkAppeal,
  onUnlinkAppeal,
  onOpenSite,
  onOpenCustomer,
}: AppealsModuleProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createState, setCreateState] = useState<CreateFormState>(() =>
    defaultCreateState(user, clients, sites, products),
  )
  const [isCommentPreview, setIsCommentPreview] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const [linkedAppealCandidate, setLinkedAppealCandidate] = useState('')
  const [statusDrafts, setStatusDrafts] = useState<Record<string, AppealStatus>>({})

  const visibleAppeals = useMemo(
    () =>
      appeals
        .filter((appeal) => canViewAppeal(user, appeal))
        .sort((left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        ),
    [appeals, user],
  )

  const selectedAppeal = visibleAppeals.find((appeal) => appeal.id === selectedAppealId) ?? null
  const statusDraft = selectedAppeal
    ? statusDrafts[selectedAppeal.id] ?? selectedAppeal.statusId
    : 'Created'

  const selectedClientSites = sites.filter((site) => site.clientId === createState.clientId)

  const availableLinkTargets = selectedAppeal
    ? visibleAppeals.filter(
        (appeal) =>
          appeal.id !== selectedAppeal.id && !selectedAppeal.linkedTicketIds.includes(appeal.id),
      )
    : []

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!canCreateAppealType(user, createState.typeId)) {
      return
    }

    const now = new Date().toISOString()
    const clientId = user.role === 'client' ? user.clientId ?? createState.clientId : createState.clientId
    const selectedSite =
      sites.find((site) => site.id === createState.siteId && site.clientId === clientId) ?? null

    const draft: Omit<Appeal, 'id'> = {
      title: nextAppealTitle(createState.typeId, appeals),
      description: createState.description,
      typeId: createState.typeId,
      statusId: 'Created',
      criticalityId: createState.criticalityId,
      productId: createState.productId || selectedSite?.productIds[0],
      clientId,
      siteId: createState.siteId || undefined,
      responsibleId: undefined,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
      linkedTicketIds: [],
      comments: [],
    }

    await onCreateAppeal(draft)
    setCreateState(defaultCreateState(user, clients, sites, products))
    setIsCreateOpen(false)
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedAppeal || !commentText.trim()) {
      return
    }

    const files: FileAttachment[] = commentFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
    }))

    await onAddComment(selectedAppeal.id, commentText.trim(), files)
    setCommentText('')
    setCommentFiles([])
    setIsCommentPreview(false)
  }

  async function handleLinkAppeal(): Promise<void> {
    if (!selectedAppeal || !linkedAppealCandidate) {
      return
    }

    await onLinkAppeal(selectedAppeal.id, linkedAppealCandidate)
    setLinkedAppealCandidate('')
  }

  async function handleUnlinkAppeal(linkedId: string): Promise<void> {
    if (!selectedAppeal) {
      return
    }

    await onUnlinkAppeal(selectedAppeal.id, linkedId)
  }

  function resolveEmployeeName(employeeId?: string): string {
    if (!employeeId) {
      return 'Не назначен'
    }

    return (
      employees.find((employee) => employee.accountId === employeeId)?.fullName ??
      'Не назначен'
    )
  }

  function resolveClientName(clientId: string): string {
    return clients.find((client) => client.id === clientId)?.name ?? 'Клиент не найден'
  }

  function resolveSiteName(siteId?: string): string {
    if (!siteId) {
      return 'Не выбрана'
    }

    return sites.find((site) => site.id === siteId)?.name ?? 'Площадка не найдена'
  }

  function resolveProductName(productId?: string): string {
    if (!productId) {
      return 'Не выбран'
    }

    return products.find((product) => product.id === productId)?.name ?? productId
  }

  function applyStatusUpdate(nextStatus: AppealStatus): void {
    if (!selectedAppeal || !canChangeStatus(user, selectedAppeal, nextStatus)) {
      return
    }

    setStatusDrafts((previous) => ({
      ...previous,
      [selectedAppeal.id]: nextStatus,
    }))

    void onUpdateAppeal(selectedAppeal.id, {
      statusId: nextStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    })
  }

  function updateCriticality(nextCriticality: AppealCriticality): void {
    if (!selectedAppeal) {
      return
    }

    void onUpdateAppeal(selectedAppeal.id, {
      criticalityId: nextCriticality,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    })
  }

  function updateResponsible(nextResponsibleId: string): void {
    if (!selectedAppeal) {
      return
    }

    const newStatus = nextResponsibleId && !selectedAppeal.responsibleId ? 'Opened' : selectedAppeal.statusId

    void onUpdateAppeal(selectedAppeal.id, {
      responsibleId: nextResponsibleId || undefined,
      statusId: newStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    })
  }

  if (visibleAppeals.length === 0) {
    return (
      <section className="module-wrap">
        <div className="module-title-row">
          <h1>Обращения</h1>
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              setCreateState(defaultCreateState(user, clients, sites, products))
              setIsCreateOpen((value) => !value)
            }}
          >
            {isCreateOpen ? 'Скрыть форму' : 'Создать обращение'}
          </button>
        </div>

        <p className="empty-state">У вас пока нет доступных обращений.</p>
      </section>
    )
  }

  if (selectedAppeal) {
    const canEdit = canEditAppeal(user, selectedAppeal)
    const canLink = canLinkAppeals(user)
    const canAssign = canAssignResponsible(user, selectedAppeal)
    const baseCandidates = getResponsibleCandidates(user, employees, selectedAppeal)
    const linkedAppeals = selectedAppeal.linkedTicketIds
      .map((appealId) => visibleAppeals.find((item) => item.id === appealId))
      .filter((appeal): appeal is Appeal => Boolean(appeal))
    const canApplyDraftStatus =
      canChangeStatus(user, selectedAppeal, statusDraft) && statusDraft !== selectedAppeal.statusId
    const canClientConfirm =
      user.role === 'client' &&
      selectedAppeal.statusId === 'Done' &&
      canChangeStatus(user, selectedAppeal, 'Verified')

    return (
      <section className="module-wrap">
        <div className="module-title-row">
          <button type="button" className="ghost-button button-sm" onClick={() => onSelectAppeal(null)}>
            К списку
          </button>
          <h1>{selectedAppeal.title}</h1>
        </div>

        <div className="appeal-detail-grid">
          <article className="detail-main">
            <p className="meta">{selectedAppeal.typeId === 'KTP' ? 'Тикет КТП' : 'Наряд WFM'}</p>
            <h2>{selectedAppeal.title}</h2>
            <p className="description-full">{selectedAppeal.description}</p>

            <div className="linked-block">
              <div className="section-head-row">
                <h3>Связанные обращения</h3>
                {canLink ? (
                  <div className="link-control-row compact">
                    <CustomSelect
                      value={linkedAppealCandidate}
                      onChange={(event) => setLinkedAppealCandidate(event.target.value)}
                      options={[
                        { value: '', label: 'Выбрать' },
                        ...availableLinkTargets.map((appeal) => ({
                          value: appeal.id,
                          label: appeal.title,
                        })),
                      ]}
                      placeholder="Выберите обращение"
                    />
                    <button
                      type="button"
                      className="primary-button button-sm"
                      disabled={!linkedAppealCandidate}
                      onClick={() => {
                        void handleLinkAppeal()
                      }}
                    >
                      Добавить
                    </button>
                  </div>
                ) : null}
              </div>

              {linkedAppeals.length > 0 ? (
                <div className="linked-appeals-grid">
                  {linkedAppeals.map((appeal) => (
                    <article key={appeal.id} className="linked-appeal-card">
                      <div className="card-row">
                        <strong>{appeal.title}</strong>
                        <span className="status-pill">{STATUS_LABELS[appeal.statusId]}</span>
                      </div>
                      <p>
                        Тип: {appeal.typeId} | Критичность: {appeal.criticalityId}
                      </p>
                      <p>Обновлено: {formatDateTime(appeal.updatedAt)}</p>
                      <div className="section-head-row">
                        <button
                          type="button"
                          className="ghost-button button-sm"
                          onClick={() => onSelectAppeal(appeal.id)}
                        >
                          Открыть
                        </button>
                        {canLink ? (
                          <button
                            type="button"
                            className="danger-button button-sm"
                            onClick={() => {
                              void handleUnlinkAppeal(appeal.id)
                            }}
                          >
                            Удалить связь
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">Связанных обращений пока нет.</p>
              )}
            </div>

            <div className="comments-block">
              <h3>Комментарии</h3>

              <div className="comment-list">
                {selectedAppeal.comments.length > 0 ? (
                  selectedAppeal.comments
                    .slice()
                    .sort(
                      (left, right) =>
                        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
                    )
                    .map((comment) => (
                      <div key={comment.id} className="comment-card">
                        <div className="comment-meta">
                          <strong>{comment.authorName}</strong>
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p>{comment.contents}</p>
                        {comment.files.length > 0 ? (
                          <ul className="file-list">
                            {comment.files.map((file) => (
                              <li key={file.id}>
                                {file.name} ({formatBytes(file.size)})
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))
                ) : (
                  <p className="empty-inline">Комментариев пока нет.</p>
                )}
              </div>

              <form className="comment-form" onSubmit={handleCommentSubmit}>
                <div className="section-head-row">
                  <h4>Новый комментарий</h4>
                  <button
                    type="button"
                    className="ghost-button button-sm"
                    onClick={() => setIsCommentPreview((value) => !value)}
                  >
                    {isCommentPreview ? 'Редактировать' : 'Предпросмотр'}
                  </button>
                </div>

                {isCommentPreview ? (
                  <pre className="preview-box">{commentText || 'Пустой комментарий'}</pre>
                ) : (
                  <textarea
                    className="text-input text-area"
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Поддерживается Markdown-разметка"
                    rows={5}
                    required
                  />
                )}

                <input
                  className="text-input"
                  type="file"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : []
                    setCommentFiles(files)
                  }}
                />

                {commentFiles.length > 0 ? (
                  <ul className="file-list compact">
                    {commentFiles.map((file) => (
                      <li key={`${file.name}-${file.lastModified}`}>
                        {file.name} ({formatBytes(file.size)})
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button type="submit" className="primary-button button-sm">
                  Отправить комментарий
                </button>
              </form>
            </div>
          </article>

          <aside className="detail-side">
            <h3>Характеристики</h3>

            <div className="side-row">
              <span>Статус</span>
              <CustomSelect
                value={statusDraft}
                onChange={(event) => {
                  if (!selectedAppeal) {
                    return
                  }

                  setStatusDrafts((previous) => ({
                    ...previous,
                    [selectedAppeal.id]: event.target.value as AppealStatus,
                  }))
                }}
                options={STATUS_ORDER.map((status) => ({
                  value: status,
                  label: STATUS_LABELS[status],
                  disabled: !canChangeStatus(user, selectedAppeal, status),
                }))}
                placeholder="Выберите статус"
                disabled={!canEdit}
              />
            </div>

            <div className="side-row">
              <span>Обновление состояния</span>
              <div className="section-head-row compact-actions">
                <button
                  type="button"
                  className="primary-button button-sm"
                  onClick={() => applyStatusUpdate(statusDraft)}
                  disabled={!canApplyDraftStatus}
                >
                  Обновить статус
                </button>
                {canClientConfirm ? (
                  <button
                    type="button"
                    className="primary-button button-sm"
                    onClick={() => applyStatusUpdate('Verified')}
                  >
                    Подтвердить выполнение
                  </button>
                ) : null}
              </div>
            </div>

            <div className="side-row">
              <span>Критичность</span>
              <CustomSelect
                value={selectedAppeal.criticalityId}
                onChange={(event) => updateCriticality(event.target.value as AppealCriticality)}
                options={criticalityOptions}
                placeholder="Выберите критичность"
                disabled={!canEdit}
              />
            </div>

            <div className="side-row">
              <span>Продукт</span>
              <strong>{resolveProductName(selectedAppeal.productId)}</strong>
            </div>

            <div className="side-row">
              <span>Ответственный</span>
              <CustomSelect
                value={selectedAppeal.responsibleId ?? ''}
                onChange={(event) => updateResponsible(event.target.value)}
                options={[
                  { value: '', label: 'Не назначен' },
                  ...baseCandidates.map((employee) => ({
                    value: employee.accountId,
                    label: employee.fullName,
                  })),
                ]}
                placeholder="Выберите ответственного"
                disabled={!canAssign}
              />
            </div>

            <div className="side-row">
              <span>Площадка заказчика</span>
              {selectedAppeal.siteId ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onOpenSite(selectedAppeal.siteId as string)}
                >
                  {resolveSiteName(selectedAppeal.siteId)}
                </button>
              ) : (
                <strong>Не выбрана</strong>
              )}
            </div>

            <div className="side-row">
              <span>Клиент</span>
              <button
                type="button"
                className="link-button"
                onClick={() => onOpenCustomer(selectedAppeal.clientId)}
              >
                {resolveClientName(selectedAppeal.clientId)}
              </button>
            </div>

            <div className="side-row">
              <span>Обновлено</span>
              <strong>{formatDateTime(selectedAppeal.updatedAt)}</strong>
            </div>

            <div className="side-row">
              <span>Ответственный (ФИО)</span>
              <strong>{resolveEmployeeName(selectedAppeal.responsibleId)}</strong>
            </div>
          </aside>
        </div>
      </section>
    )
  }

  return (
    <section className="module-wrap">
      <div className="module-title-row">
        <h1>Обращения</h1>
        <button
          type="button"
          className="primary-button button-sm"
          onClick={() => {
            setCreateState(defaultCreateState(user, clients, sites, products))
            setIsCreateOpen((value) => !value)
          }}
        >
          {isCreateOpen ? 'Скрыть форму' : 'Создать обращение'}
        </button>
      </div>

      {isCreateOpen ? (
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="form-grid">
            <label>
              Тип
              <CustomSelect
                value={createState.typeId}
                onChange={(event) =>
                  setCreateState((previous) => ({
                    ...previous,
                    typeId: event.target.value as Appeal['typeId'],
                  }))
                }
                options={[
                  { value: 'KTP', label: 'КТП', disabled: !canCreateAppealType(user, 'KTP') },
                  { value: 'WFM', label: 'WFM', disabled: !canCreateAppealType(user, 'WFM') },
                ]}
                placeholder={null}
                showPlaceholder={false}
              />
            </label>

            <label>
              Критичность
              <CustomSelect
                value={createState.criticalityId}
                onChange={(event) =>
                  setCreateState((previous) => ({
                    ...previous,
                    criticalityId: event.target.value as AppealCriticality,
                  }))
                }
                options={criticalityOptions}
                placeholder={null}
                showPlaceholder={false}
              />
            </label>

            {user.role !== 'client' ? (
              <label>
                Клиент
                <CustomSelect
                  value={createState.clientId}
                  onChange={(event) =>
                    setCreateState((previous) => ({
                      ...previous,
                      clientId: event.target.value,
                      siteId: '',
                    }))
                  }
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                  placeholder={null}
                  showPlaceholder={false}
                />
              </label>
            ) : null}

            <label>
              Площадка
              <CustomSelect
                value={createState.siteId}
                onChange={(event) =>
                  setCreateState((previous) => {
                    const nextSiteId = event.target.value
                    const nextSite = selectedClientSites.find((site) => site.id === nextSiteId)
                    return {
                      ...previous,
                      siteId: nextSiteId,
                      productId: nextSite?.productIds[0] ?? previous.productId,
                    }
                  })
                }
                options={[
                  { value: '', label: 'Не выбрана' },
                  ...selectedClientSites.map((site) => ({
                    value: site.id,
                    label: `${site.name} (${site.address})`,
                  })),
                ]}
                placeholder={null}
                showPlaceholder={false}
              />
            </label>

            <label>
              Продукт
              <CustomSelect
                value={createState.productId}
                onChange={(event) =>
                  setCreateState((previous) => ({
                    ...previous,
                    productId: event.target.value,
                  }))
                }
                options={products.map((product) => ({
                  value: product.id,
                  label: product.name,
                }))}
                placeholder={null}
                showPlaceholder={false}
              />
            </label>
          </div>

          <label>
            Описание
            <textarea
              className="text-input text-area"
              rows={4}
              value={createState.description}
              onChange={(event) =>
                setCreateState((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              required
            />
          </label>

          <button className="primary-button button-sm" type="submit">
            Сохранить
          </button>
        </form>
      ) : null}

      <div className="cards-column">
        {visibleAppeals.map((appeal) => (
          <button
            type="button"
            key={appeal.id}
            className="appeal-card"
            onClick={() => onSelectAppeal(appeal.id)}
          >
            <div className="card-row">
              <strong>{appeal.title}</strong>
              <span>{STATUS_LABELS[appeal.statusId]}</span>
            </div>
            <h3>{appeal.typeId}</h3>
            <p>{truncate(appeal.description, 100)}</p>
            <div className="card-row muted">
              <span>Ответственный: {resolveEmployeeName(appeal.responsibleId)}</span>
              <span>Обновлено: {formatDateTime(appeal.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
