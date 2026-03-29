import { useState, type FormEvent } from 'react'
import {
  APPEAL_LINK_TYPE_LABELS,
  CRITICALITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../constants'
import type {
  Appeal,
  AppealComment,
  AppealCriticality,
  AppealLinkType,
  AppealStatus,
  ClientCompany,
  Employee,
  FileAttachment,
  ProductCatalogItem,
  Site,
  UserProfile,
} from '../types'
import { formatDateTime, truncate } from '../utils/format'
import {
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
  onLinkAppeal: (
    appealId: string,
    linkedAppealId: string,
    relationType: AppealLinkType,
  ) => Promise<void>
  onUnlinkAppeal: (appealId: string, linkedAppealId: string) => Promise<void>
  onOpenSite: (siteId: string) => void
  onOpenCustomer: (clientId: string) => void
  onOpenPerson: (accountId: string) => void
}

type CreateFormState = {
  typeId: Appeal['typeId']
  description: string
  criticalityId: AppealCriticality
  productId: string
  clientId: string
  siteId: string
}

type EditFormState = {
  title: string
  description: string
  typeId: Appeal['typeId']
  statusId: AppealStatus
  criticalityId: AppealCriticality
  clientId: string
  siteId: string
  productId: string
  responsibleId: string
}

const criticalityOptions: Array<{ value: AppealCriticality; label: string }> = [
  { value: 'Basic', label: CRITICALITY_LABELS.Basic },
  { value: 'Important', label: CRITICALITY_LABELS.Important },
  { value: 'Critical', label: CRITICALITY_LABELS.Critical },
]

const linkTypeOptions: Array<{ value: AppealLinkType; label: string }> = [
  { value: 'related', label: APPEAL_LINK_TYPE_LABELS.related },
  { value: 'subtask', label: APPEAL_LINK_TYPE_LABELS.subtask },
]

function nextAppealTitle(typeId: Appeal['typeId'], appeals: Appeal[]): string {
  const prefix = typeId === 'KTP' ? 'CRM' : 'WFM'

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

function buildEditState(appeal: Appeal): EditFormState {
  return {
    title: appeal.title,
    description: appeal.description,
    typeId: appeal.typeId,
    statusId: appeal.statusId,
    criticalityId: appeal.criticalityId,
    clientId: appeal.clientId,
    siteId: appeal.siteId ?? '',
    productId: appeal.productId ?? '',
    responsibleId: appeal.responsibleId ?? '',
  }
}

function resolveResponsibleRole(typeId: Appeal['typeId']): Employee['role'] {
  return typeId === 'WFM' ? 'wfm' : 'ktp'
}

function findRepresentative(
  clients: ClientCompany[],
  accountId?: string,
): { client: ClientCompany; representative: ClientCompany['representatives'][number] } | null {
  if (!accountId) {
    return null
  }

  for (const client of clients) {
    const representative = client.representatives.find((item) => item.accountId === accountId)
    if (representative) {
      return { client, representative }
    }
  }

  return null
}

function getResponsibleCandidates(
  employees: Employee[],
  typeId: Appeal['typeId'],
  currentResponsibleId?: string,
): Employee[] {
  const preferredRole = resolveResponsibleRole(typeId)
  const baseCandidates = employees.filter((employee) => employee.role === preferredRole)

  if (!currentResponsibleId || baseCandidates.some((employee) => employee.accountId === currentResponsibleId)) {
    return baseCandidates
  }

  const currentResponsible = employees.find((employee) => employee.accountId === currentResponsibleId)
  return currentResponsible ? [currentResponsible, ...baseCandidates] : baseCandidates
}

function getAvailableProducts(
  products: ProductCatalogItem[],
  sites: Site[],
  siteId: string,
): ProductCatalogItem[] {
  const site = sites.find((item) => item.id === siteId)
  if (!site || site.productIds.length === 0) {
    return products
  }

  return products.filter((product) => site.productIds.includes(product.id))
}

function getAppealLinks(appeal: Appeal): NonNullable<Appeal['links']> {
  if (appeal.links && appeal.links.length > 0) {
    return appeal.links
  }

  return appeal.linkedTicketIds.map((linkedAppealId) => ({
    linkedAppealId,
    relationType: 'related' as const,
  }))
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
  onOpenPerson,
}: AppealsModuleProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createState, setCreateState] = useState<CreateFormState>(() =>
    defaultCreateState(user, clients, sites, products),
  )
  const [commentText, setCommentText] = useState('')
  const [linkedAppealCandidate, setLinkedAppealCandidate] = useState('')
  const [linkedAppealType, setLinkedAppealType] = useState<AppealLinkType>('related')
  const [editState, setEditState] = useState<EditFormState | null>(null)
  const [appealQuery, setAppealQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<Appeal['typeId'] | ''>('')
  const [statusFilter, setStatusFilter] = useState<AppealStatus | ''>('')
  const [criticalityFilter, setCriticalityFilter] = useState<AppealCriticality | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')

  const visibleAppeals = appeals
    .filter((appeal) => canViewAppeal(user, appeal))
    .filter((appeal) => {
      const normalizedQuery = appealQuery.trim().toLowerCase()
      const matchesQuery =
        !normalizedQuery ||
        [
          appeal.title,
          appeal.description,
          resolveClientName(appeal.clientId),
          resolveSiteName(appeal.siteId),
          resolveProductName(appeal.productId),
          resolveEmployeeName(appeal.responsibleId),
          resolvePersonName(appeal.createdBy),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)

      const matchesType = !typeFilter || appeal.typeId === typeFilter
      const matchesStatus = !statusFilter || appeal.statusId === statusFilter
      const matchesCriticality = !criticalityFilter || appeal.criticalityId === criticalityFilter
      const matchesClient = !clientFilter || appeal.clientId === clientFilter
      const matchesSite = !siteFilter || appeal.siteId === siteFilter
      const matchesProduct = !productFilter || appeal.productId === productFilter
      const matchesResponsible = !responsibleFilter || appeal.responsibleId === responsibleFilter
      const matchesCreatedBy = !createdByFilter || appeal.createdBy === createdByFilter

      return (
        matchesQuery &&
        matchesType &&
        matchesStatus &&
        matchesCriticality &&
        matchesClient &&
        matchesSite &&
        matchesProduct &&
        matchesResponsible &&
        matchesCreatedBy
      )
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

  const selectedAppeal = visibleAppeals.find((appeal) => appeal.id === selectedAppealId) ?? null
  const selectedAppealLinks = selectedAppeal ? getAppealLinks(selectedAppeal) : []
  const selectedClientSites = sites.filter((site) => site.clientId === createState.clientId)
  const selectedCreateProducts = getAvailableProducts(products, sites, createState.siteId)
  const editClientSites = editState ? sites.filter((site) => site.clientId === editState.clientId) : []
  const editProducts = editState ? getAvailableProducts(products, sites, editState.siteId) : products

  const availableLinkTargets = selectedAppeal
    ? visibleAppeals.filter(
        (appeal) =>
          appeal.id !== selectedAppeal.id &&
          !selectedAppealLinks.some((link) => link.linkedAppealId === appeal.id),
      )
    : []

  function selectAppeal(appealId: string | null): void {
    setEditState(null)
    onSelectAppeal(appealId)
  }

  function resolveEmployeeName(employeeId?: string): string {
    if (!employeeId) {
      return 'Не назначен'
    }

    return employees.find((employee) => employee.accountId === employeeId)?.fullName ?? 'Не назначен'
  }

  function resolvePersonName(accountId?: string): string {
    if (!accountId) {
      return 'Не задан'
    }

    const employee = employees.find((item) => item.accountId === accountId)
    if (employee) {
      return employee.fullName
    }

    const representativeMatch = findRepresentative(clients, accountId)
    return representativeMatch?.representative.fullName ?? 'Не найден'
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

  function resolveCommentAuthor(comment: AppealComment): string {
    return comment.authorName || resolvePersonName(comment.createdBy)
  }

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
      links: [],
      comments: [],
    }

    await onCreateAppeal(draft)
    setCreateState(defaultCreateState(user, clients, sites, products))
    setIsCreateOpen(false)
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedAppeal || !editState) {
      return
    }

    await onUpdateAppeal(selectedAppeal.id, {
      title: editState.title,
      description: editState.description,
      typeId: editState.typeId,
      statusId: editState.statusId,
      criticalityId: editState.criticalityId,
      clientId: editState.clientId,
      siteId: editState.siteId || undefined,
      productId: editState.productId || undefined,
      responsibleId: editState.responsibleId || undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    })

    setEditState(null)
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedAppeal || !commentText.trim()) {
      return
    }

    await onAddComment(selectedAppeal.id, commentText.trim(), [])
    setCommentText('')
  }

  async function handleLinkAppeal(): Promise<void> {
    if (!selectedAppeal || !linkedAppealCandidate) {
      return
    }

    await onLinkAppeal(selectedAppeal.id, linkedAppealCandidate, linkedAppealType)
    setLinkedAppealCandidate('')
    setLinkedAppealType('related')
  }

  async function handleUnlinkAppeal(linkedId: string): Promise<void> {
    if (!selectedAppeal) {
      return
    }

    await onUnlinkAppeal(selectedAppeal.id, linkedId)
  }

  if (selectedAppeal) {
    const canEdit = canEditAppeal(user, selectedAppeal)
    const canLink = canLinkAppeals(user)
    const linkedAppeals = selectedAppealLinks
      .map((link) => ({
        link,
        appeal: visibleAppeals.find((item) => item.id === link.linkedAppealId) ?? null,
      }))
      .filter((item): item is { link: NonNullable<typeof item.link>; appeal: Appeal } => Boolean(item.appeal))
    const responsibleCandidates = getResponsibleCandidates(
      employees,
      editState?.typeId ?? selectedAppeal.typeId,
      editState?.responsibleId || selectedAppeal.responsibleId,
    )

    return (
      <section className="module-wrap">
        <div className="module-title-row">
          <button type="button" className="ghost-button button-sm" onClick={() => selectAppeal(null)}>
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
                      value={linkedAppealType}
                      onChange={(event) => setLinkedAppealType(event.target.value as AppealLinkType)}
                      options={linkTypeOptions}
                      placeholder={null}
                      showPlaceholder={false}
                    />
                    <CustomSelect
                      value={linkedAppealCandidate}
                      onChange={(event) => setLinkedAppealCandidate(event.target.value)}
                      options={[
                        { value: '', label: 'Выбрать обращение' },
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
                  {linkedAppeals.map(({ link, appeal }) => (
                    <article key={`${selectedAppeal.id}-${appeal.id}`} className="linked-appeal-card">
                      <div className="card-row">
                        <strong>{appeal.title}</strong>
                        <span className="status-pill">{STATUS_LABELS[appeal.statusId]}</span>
                      </div>
                      <p>
                        Тип связи: <strong>{APPEAL_LINK_TYPE_LABELS[link.relationType]}</strong>
                      </p>
                      <p>
                        Тип: {appeal.typeId} | Критичность: {CRITICALITY_LABELS[appeal.criticalityId]}
                      </p>
                      <p>Обновлено: {formatDateTime(appeal.updatedAt)}</p>
                      <div className="section-head-row">
                        <button
                          type="button"
                          className="ghost-button button-sm"
                          onClick={() => selectAppeal(appeal.id)}
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
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => onOpenPerson(comment.createdBy)}
                          >
                            {resolveCommentAuthor(comment)}
                          </button>
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p>{comment.contents}</p>
                      </div>
                    ))
                ) : (
                  <p className="empty-inline">Комментариев пока нет.</p>
                )}
              </div>

              <form className="comment-form" onSubmit={handleCommentSubmit}>
                <h4>Новый комментарий</h4>
                <textarea
                  className="text-input text-area"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Поддерживается Markdown-разметка"
                  rows={5}
                  required
                />
                <button type="submit" className="primary-button button-sm">
                  Отправить комментарий
                </button>
              </form>
            </div>
          </article>

          <aside className="detail-side">
            {editState ? (
              <form className="inline-form compact" onSubmit={handleSaveEdit}>
                <h3>Редактирование обращения</h3>

                <div className="form-grid">
                  <label>
                    Заголовок
                    <input
                      className="text-input"
                      value={editState.title}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                title: event.target.value,
                              }
                            : previous,
                        )
                      }
                      required
                    />
                  </label>

                  <label>
                    Тип
                    <CustomSelect
                      value={editState.typeId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                typeId: event.target.value as Appeal['typeId'],
                                responsibleId: '',
                              }
                            : previous,
                        )
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
                    Статус
                    <CustomSelect
                      value={editState.statusId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                statusId: event.target.value as AppealStatus,
                              }
                            : previous,
                        )
                      }
                      options={STATUS_ORDER.map((status) => ({
                        value: status,
                        label: STATUS_LABELS[status],
                        disabled:
                          status !== selectedAppeal.statusId &&
                          !canChangeStatus(user, selectedAppeal, status),
                      }))}
                      placeholder={null}
                      showPlaceholder={false}
                    />
                  </label>

                  <label>
                    Критичность
                    <CustomSelect
                      value={editState.criticalityId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                criticalityId: event.target.value as AppealCriticality,
                              }
                            : previous,
                        )
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
                        value={editState.clientId}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  clientId: event.target.value,
                                  siteId: '',
                                  productId: '',
                                }
                              : previous,
                          )
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
                      value={editState.siteId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                siteId: event.target.value,
                                productId: '',
                              }
                            : previous,
                        )
                      }
                      options={[
                        { value: '', label: 'Не выбрана' },
                        ...editClientSites.map((site) => ({
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
                      value={editState.productId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                productId: event.target.value,
                              }
                            : previous,
                        )
                      }
                      options={[
                        { value: '', label: 'Не выбран' },
                        ...editProducts.map((product) => ({
                          value: product.id,
                          label: product.name,
                        })),
                      ]}
                      placeholder={null}
                      showPlaceholder={false}
                    />
                  </label>

                  <label>
                    Ответственный
                    <CustomSelect
                      value={editState.responsibleId}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                responsibleId: event.target.value,
                              }
                            : previous,
                        )
                      }
                      options={[
                        { value: '', label: 'Не назначен' },
                        ...responsibleCandidates.map((employee) => ({
                          value: employee.accountId,
                          label: employee.fullName,
                        })),
                      ]}
                      placeholder={null}
                      showPlaceholder={false}
                    />
                  </label>
                </div>

                <label>
                  Описание
                  <textarea
                    className="text-input text-area"
                    rows={6}
                    value={editState.description}
                    onChange={(event) =>
                      setEditState((previous) =>
                        previous
                          ? {
                              ...previous,
                              description: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                  />
                </label>

                <div className="section-head-row">
                  <button type="submit" className="primary-button button-sm">
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="ghost-button button-sm"
                    onClick={() => setEditState(null)}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h3>Характеристики</h3>

                <div className="side-row">
                  <span>Статус</span>
                  <strong>{STATUS_LABELS[selectedAppeal.statusId]}</strong>
                </div>

                <div className="side-row">
                  <span>Критичность</span>
                  <strong>{CRITICALITY_LABELS[selectedAppeal.criticalityId]}</strong>
                </div>

                <div className="side-row">
                  <span>Тип</span>
                  <strong>{selectedAppeal.typeId === 'KTP' ? 'КТП' : 'WFM'}</strong>
                </div>

                <div className="side-row">
                  <span>Продукт</span>
                  <strong>{resolveProductName(selectedAppeal.productId)}</strong>
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
                  <span>Площадка</span>
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
                  <span>Создал</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpenPerson(selectedAppeal.createdBy)}
                  >
                    {resolvePersonName(selectedAppeal.createdBy)}
                  </button>
                </div>

                <div className="side-row">
                  <span>Ответственный</span>
                  {selectedAppeal.responsibleId ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onOpenPerson(selectedAppeal.responsibleId as string)}
                    >
                      {resolveEmployeeName(selectedAppeal.responsibleId)}
                    </button>
                  ) : (
                    <strong>Не назначен</strong>
                  )}
                </div>

                <div className="side-row">
                  <span>Создано</span>
                  <strong>{formatDateTime(selectedAppeal.createdAt)}</strong>
                </div>

                <div className="side-row">
                  <span>Обновлено</span>
                  <strong>{formatDateTime(selectedAppeal.updatedAt)}</strong>
                </div>

                {canEdit ? (
                  <div className="section-head-row">
                    <button
                      type="button"
                      className="primary-button button-sm"
                      onClick={() => setEditState(buildEditState(selectedAppeal))}
                    >
                      Редактировать
                    </button>
                  </div>
                ) : null}
              </>
            )}
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
                      productId: '',
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
                      productId: nextSite?.productIds[0] ?? '',
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
                options={[
                  { value: '', label: 'Не выбран' },
                  ...selectedCreateProducts.map((product) => ({
                    value: product.id,
                    label: product.name,
                  })),
                ]}
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

      <div className="form-grid">
        <label>
          Общий поиск
          <input
            className="text-input"
            value={appealQuery}
            onChange={(event) => setAppealQuery(event.target.value)}
            placeholder="По заголовку, описанию, автору, ответственному, заказчику, площадке или продукту"
          />
        </label>

        <label>
          Тип
          <CustomSelect
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as Appeal['typeId'] | '')}
            options={[
              { value: '', label: 'Все типы' },
              { value: 'KTP', label: 'КТП' },
              { value: 'WFM', label: 'WFM' },
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Статус
          <CustomSelect
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AppealStatus | '')}
            options={[
              { value: '', label: 'Все статусы' },
              ...STATUS_ORDER.map((status) => ({
                value: status,
                label: STATUS_LABELS[status],
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Критичность
          <CustomSelect
            value={criticalityFilter}
            onChange={(event) =>
              setCriticalityFilter(event.target.value as AppealCriticality | '')
            }
            options={[
              { value: '', label: 'Любая критичность' },
              ...criticalityOptions.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Заказчик
          <CustomSelect
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            options={[
              { value: '', label: 'Все заказчики' },
              ...clients.map((client) => ({
                value: client.id,
                label: client.name,
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Площадка
          <CustomSelect
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            options={[
              { value: '', label: 'Все площадки' },
              ...sites
                .filter((site) => !clientFilter || site.clientId === clientFilter)
                .map((site) => ({
                  value: site.id,
                  label: site.name,
                })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Продукт
          <CustomSelect
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            options={[
              { value: '', label: 'Все продукты' },
              ...products.map((product) => ({
                value: product.id,
                label: product.name,
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Ответственный
          <CustomSelect
            value={responsibleFilter}
            onChange={(event) => setResponsibleFilter(event.target.value)}
            options={[
              { value: '', label: 'Все ответственные' },
              ...employees.map((employee) => ({
                value: employee.accountId,
                label: employee.fullName,
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>

        <label>
          Автор
          <CustomSelect
            value={createdByFilter}
            onChange={(event) => setCreatedByFilter(event.target.value)}
            options={[
              { value: '', label: 'Все авторы' },
              ...Array.from(
                new Map(
                  [
                    ...employees.map((employee) => ({
                      id: employee.accountId,
                      name: employee.fullName,
                    })),
                    ...clients.flatMap((client) =>
                      client.representatives.map((representative) => ({
                        id: representative.accountId,
                        name: representative.fullName,
                      })),
                    ),
                  ].map((item) => [item.id, item]),
                ).values(),
              ).map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
            placeholder={null}
            showPlaceholder={false}
          />
        </label>
      </div>

      {visibleAppeals.length === 0 ? (
        <p className="empty-state">По текущим фильтрам обращения не найдены.</p>
      ) : (
        <div className="cards-column">
          {visibleAppeals.map((appeal) => (
            <button
              type="button"
              key={appeal.id}
              className="appeal-card"
              onClick={() => selectAppeal(appeal.id)}
            >
              <div className="card-row">
                <strong>{appeal.title}</strong>
                <span>{STATUS_LABELS[appeal.statusId]}</span>
              </div>
              <h3>{appeal.typeId === 'KTP' ? 'КТП' : 'WFM'}</h3>
              <p>{truncate(appeal.description, 100)}</p>
              <div className="card-row muted">
                <span>Ответственный: {resolveEmployeeName(appeal.responsibleId)}</span>
                <span>Создал: {resolvePersonName(appeal.createdBy)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
