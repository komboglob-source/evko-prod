import { useRef, useState, type FormEvent } from 'react'
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
import { renderMarkdown } from '../utils/markdown'
import {
  canAccessClosedComments,
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
  archiveMode?: boolean
  selectedAppealId: string | null
  onSelectAppeal: (appealId: string | null) => void
  onOpenAppeal?: (appealId: string, archived: boolean) => void
  onCreateAppeal: (draft: Omit<Appeal, 'id'>) => Promise<void>
  onUpdateAppeal: (appealId: string, patch: Partial<Appeal>) => Promise<void>
  onAddComment: (
    appealId: string,
    text: string,
    isClosedComment: boolean,
    files: FileAttachment[],
  ) => Promise<void>
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
  description: string
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
    description: appeal.description,
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
  archiveMode = false,
  selectedAppealId,
  onSelectAppeal,
  onOpenAppeal,
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
  const [isClosedComment, setIsClosedComment] = useState(false)
  const [isCommentPreviewOpen, setIsCommentPreviewOpen] = useState(false)
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
  const [isCreating, setIsCreating] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isTakingInWork, setIsTakingInWork] = useState(false)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const isCreatingRef = useRef(false)
  const isSavingEditRef = useRef(false)
  const canUseClosedComments = canAccessClosedComments(user)

  const viewableAppeals = appeals.filter((appeal) => canViewAppeal(user, appeal))

  const scopedAppeals = viewableAppeals.filter((appeal) =>
    archiveMode ? appeal.statusId === 'Verified' : appeal.statusId !== 'Verified',
  )

  const visibleAppeals = scopedAppeals.filter((appeal) => {
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

  const selectedAppeal = scopedAppeals.find((appeal) => appeal.id === selectedAppealId) ?? null
  const selectedAppealLinks = selectedAppeal ? getAppealLinks(selectedAppeal) : []
  const selectedClientSites = sites.filter((site) => site.clientId === createState.clientId)
  const selectedCreateProducts = getAvailableProducts(products, sites, createState.siteId)
  const editClientSites = editState ? sites.filter((site) => site.clientId === editState.clientId) : []
  const editProducts = editState ? getAvailableProducts(products, sites, editState.siteId) : products

  const availableLinkTargets = selectedAppeal
    ? viewableAppeals.filter(
        (appeal) =>
          appeal.id !== selectedAppeal.id &&
          !selectedAppealLinks.some((link) => link.linkedAppealId === appeal.id),
      )
    : []

  function selectAppeal(appealId: string | null): void {
    setEditState(null)
    onSelectAppeal(appealId)
  }

  function openAppeal(appeal: Appeal): void {
    const isArchivedAppeal = appeal.statusId === 'Verified'
    if (isArchivedAppeal === archiveMode || !onOpenAppeal) {
      selectAppeal(appeal.id)
      return
    }

    onOpenAppeal(appeal.id, isArchivedAppeal)
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

    if (!canCreateAppealType(user, createState.typeId) || isCreatingRef.current) {
      return
    }

    isCreatingRef.current = true
    setIsCreating(true)

    try {
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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось создать обращение.')
    } finally {
      isCreatingRef.current = false
      setIsCreating(false)
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedAppeal || !editState || isSavingEditRef.current) {
      return
    }

    isSavingEditRef.current = true
    setIsSavingEdit(true)

    const nextStatus = editState.statusId
    try {
      await onUpdateAppeal(selectedAppeal.id, {
        description: editState.description,
        statusId: editState.statusId,
        criticalityId: editState.criticalityId,
        clientId: editState.clientId,
        siteId: editState.siteId || undefined,
        productId: editState.productId || undefined,
        responsibleId: editState.responsibleId || undefined,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      })

      if (!archiveMode && nextStatus === 'Verified') {
        selectAppeal(null)
        return
      }

      setEditState(null)
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ РѕР±СЂР°С‰РµРЅРёСЏ.',
      )
    } finally {
      isSavingEditRef.current = false
      setIsSavingEdit(false)
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (
      !selectedAppeal ||
      selectedAppeal.statusId === 'Verified' ||
      !commentText.trim() ||
      isSubmittingComment
    ) {
      return
    }

    setIsSubmittingComment(true)
    try {
      await onAddComment(selectedAppeal.id, commentText.trim(), isClosedComment, [])
      setCommentText('')
      setIsClosedComment(false)
      setIsCommentPreviewOpen(false)
    } finally {
      setIsSubmittingComment(false)
    }
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

  async function handleTakeAppealInWork(): Promise<void> {
    if (!selectedAppeal) {
      return
    }

    setIsTakingInWork(true)
    try {
      await onUpdateAppeal(selectedAppeal.id, {
        statusId: 'Opened',
        responsibleId: user.id,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось взять заявку в работу.')
    } finally {
      setIsTakingInWork(false)
    }
  }

  if (selectedAppeal) {
    const isVerified = selectedAppeal.statusId === 'Verified'
    const canEdit = canEditAppeal(user, selectedAppeal)
    const canLink = canLinkAppeals(user)
    const canManageLinks = canLink && !isVerified
    const canComment = !isVerified
    const visibleComments = canUseClosedComments
      ? selectedAppeal.comments
      : selectedAppeal.comments.filter((comment) => !comment.isClosedComment)
    const canTakeInWork =
      selectedAppeal.statusId === 'Created' &&
      user.role !== 'client' &&
      canChangeStatus(user, selectedAppeal, 'Opened')
    const linkedAppeals = selectedAppealLinks
      .map((link) => ({
        link,
        appeal: viewableAppeals.find((item) => item.id === link.linkedAppealId) ?? null,
      }))
      .filter((item): item is { link: NonNullable<typeof item.link>; appeal: Appeal } => Boolean(item.appeal))
    const hasIncompleteSubtasks = linkedAppeals.some(
      ({ link, appeal }) =>
        link.relationType === 'parent_for' &&
        appeal.statusId !== 'Done' &&
        appeal.statusId !== 'Verified',
    )
    const responsibleCandidates = getResponsibleCandidates(
      employees,
      selectedAppeal.typeId,
      editState?.responsibleId || selectedAppeal.responsibleId,
    )

    return (
      <section className="module-wrap">
        <div className="module-title-row">
          <button type="button" className="ghost-button button-sm" onClick={() => selectAppeal(null)}>
            {archiveMode ? 'К архиву' : 'К списку'}
          </button>
          <h1>{selectedAppeal.title}</h1>
        </div>

        <div className="appeal-detail-grid">
          <article className="detail-main">
            <p className="meta appeal-detail-type">
              {selectedAppeal.typeId === 'KTP' ? 'Тикет КТП' : 'Наряд WFM'}
            </p>
            <h2 className="appeal-detail-title">{selectedAppeal.title}</h2>
            <p className="description-full">{selectedAppeal.description}</p>

            {isVerified ? (
              <div className="readonly-banner">
                Задача проверена. Редактирование, комментарии и изменение связей заблокированы.
              </div>
            ) : null}

            <div className="linked-block">
              <div className="section-head-row">
                <h3>Связанные обращения</h3>
                {canManageLinks ? (
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
                          onClick={() => openAppeal(appeal)}
                        >
                          Открыть
                        </button>
                        {canManageLinks ? (
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

              {canComment ? (
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

                  <div className="comment-form-actions">
                    <button
                      type="button"
                      className="ghost-button button-sm comment-preview-toggle"
                      onClick={() => setIsCommentPreviewOpen(true)}
                    >
                      <span className="eye-icon" aria-hidden="true">
                        <span className="eye-icon-pupil" />
                      </span>
                      Предосмотр комментария
                    </button>

                    {canUseClosedComments ? (
                      <label className="comment-visibility-toggle">
                        <input
                          type="checkbox"
                          checked={isClosedComment}
                          onChange={(event) => setIsClosedComment(event.target.checked)}
                        />
                        <span>Закрытый комментарий</span>
                      </label>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    className="primary-button button-sm"
                    disabled={isSubmittingComment}
                  >
                    {isSubmittingComment ? 'Отправляем...' : 'Отправить комментарий'}
                  </button>
                </form>
              ) : (
                <p className="empty-inline">Комментарии для проверенной задачи заблокированы.</p>
              )}

              <div className="comment-list">
                {visibleComments.length > 0 ? (
                  visibleComments
                    .slice()
                    .sort(
                      (left, right) =>
                        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
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
                          {canUseClosedComments ? (
                            <span
                              className={`status-pill comment-visibility-pill ${
                                comment.isClosedComment ? 'is-closed' : 'is-open'
                              }`}
                            >
                              {comment.isClosedComment ? 'Закрытый' : 'Открытый'}
                            </span>
                          ) : null}
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <div className="markdown-content">{renderMarkdown(comment.contents)}</div>
                      </div>
                    ))
                ) : (
                  <p className="empty-inline">Комментариев пока нет.</p>
                )}
              </div>
            </div>
          </article>

          <aside className="detail-side">
            {editState ? (
              <form className="inline-form compact" onSubmit={handleSaveEdit}>
                <h3>Редактирование обращения</h3>

                <div className="form-grid">
                  <label>
                    Статус
                    <CustomSelect
                      value={editState.statusId}
                      disabled={isSavingEdit}
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
                          (!canChangeStatus(user, selectedAppeal, status) ||
                            ((status === 'Done' || status === 'Verified') && hasIncompleteSubtasks)),
                      }))}
                      placeholder={null}
                      showPlaceholder={false}
                    />
                  </label>

                  <label>
                    Критичность
                    <CustomSelect
                      value={editState.criticalityId}
                      disabled={isSavingEdit}
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
                        disabled={isSavingEdit}
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
                      disabled={isSavingEdit}
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
                      disabled={isSavingEdit}
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
                      disabled={isSavingEdit}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                responsibleId: event.target.value,
                                statusId:
                                  previous.statusId === 'Created' && event.target.value
                                    ? 'Opened'
                                    : previous.statusId,
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
                    disabled={isSavingEdit}
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

                {hasIncompleteSubtasks ? (
                  <p className="empty-inline">
                    Родительскую задачу нельзя перевести в статусы «Выполнено» или «Проверено»,
                    пока есть незавершенные подзадачи.
                  </p>
                ) : null}

                <div className="section-head-row">
                  <button type="submit" className="primary-button button-sm" disabled={isSavingEdit}>
                    {isSavingEdit ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button button-sm"
                    disabled={isSavingEdit}
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

                {canTakeInWork ? (
                  <div className="section-head-row">
                    <button
                      type="button"
                      className="primary-button button-sm"
                      onClick={() => {
                        void handleTakeAppealInWork()
                      }}
                      disabled={isTakingInWork}
                    >
                      {isTakingInWork ? 'Берем в работу...' : 'Взять в работу'}
                    </button>
                  </div>
                ) : null}

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
        <h1>{archiveMode ? 'Архив задач' : 'Обращения'}</h1>
        {!archiveMode ? (
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              setCreateState(defaultCreateState(user, clients, sites, products))
              setIsCreateOpen(true)
            }}
          >
            Создать обращение
          </button>
        ) : null}
      </div>

      {!archiveMode && isCreateOpen ? (
        <div
          className="modal-overlay"
          onClick={(event) =>
            !isCreating && event.target === event.currentTarget && setIsCreateOpen(false)
          }
        >
          <div className="modal-card">
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsCreateOpen(false)}
              aria-label="Закрыть"
              disabled={isCreating}
            >
              x
            </button>

            <form className="inline-form modal-form" onSubmit={handleCreate}>
              <h3 className="modal-title">Новое обращение</h3>

              <div className="form-grid">
                <label>
                  <span className="field-label">
                    Тип <span className="required">*</span>
                  </span>
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
                  <span className="field-label">
                    Критичность <span className="required">*</span>
                  </span>
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
                    <span className="field-label">
                      Клиент <span className="required">*</span>
                    </span>
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
                  <span className="field-label">Площадка</span>
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
                  <span className="field-label">Продукт</span>
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

              <label className="full-width">
                <span className="field-label">
                  Описание <span className="required">*</span>
                </span>
                <textarea
                  className="text-input text-area"
                  rows={5}
                  value={createState.description}
                  onChange={(event) =>
                    setCreateState((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  required
                  placeholder="Опишите проблему, контекст и ожидаемый результат"
                />
              </label>

              <div className="section-head-row modal-actions">
                <button
                  type="button"
                  className="ghost-button button-sm"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isCreating}
                >
                  Отмена
                </button>
                <button className="primary-button button-sm" type="submit" disabled={isCreating}>
                  {isCreating ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCommentPreviewOpen ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsCommentPreviewOpen(false)
            }
          }}
        >
          <div className="modal-card">
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsCommentPreviewOpen(false)}
              aria-label="Закрыть"
            >
              x
            </button>

            <div className="inline-form modal-form">
              <h3 className="modal-title">Предосмотр комментария</h3>
              {commentText.trim() ? (
                <div className="preview-box markdown-content">{renderMarkdown(commentText)}</div>
              ) : (
                <p className="empty-inline">Комментарий пока пуст.</p>
              )}
            </div>
          </div>
        </div>
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

        {!archiveMode ? (
          <label>
            Статус
            <CustomSelect
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AppealStatus | '')}
              options={[
                { value: '', label: 'Все статусы' },
                ...STATUS_ORDER.filter((status) => status !== 'Verified').map((status) => ({
                  value: status,
                  label: STATUS_LABELS[status],
                })),
              ]}
              placeholder={null}
              showPlaceholder={false}
            />
          </label>
        ) : null}

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
        <p className="empty-state">
          {archiveMode
            ? 'По текущим фильтрам архивные задачи не найдены.'
            : 'По текущим фильтрам обращения не найдены.'}
        </p>
      ) : (
        <div className="cards-column">
          {visibleAppeals.map((appeal) => (
            <button
              type="button"
              key={appeal.id}
              className="appeal-card"
              onClick={() => openAppeal(appeal)}
            >
              <div className="card-row">
                <strong className="appeal-card-title">{appeal.title}</strong>
                <span>{STATUS_LABELS[appeal.statusId]}</span>
              </div>
              <p className="appeal-card-type">{appeal.typeId === 'KTP' ? 'КТП' : 'WFM'}</p>
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
