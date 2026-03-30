import { PRIORITY_DEADLINE_DAYS, normalizeAppealStatus } from '../constants'
import { getMockBootstrapData } from '../mockData'
import type {
  Appeal,
  AppealComment,
  AppealCriticality,
  AppealLinkType,
  AppealStatus,
  AppealType,
  AuthTokens,
  ClientCompany,
  ClientRepresentative,
  CrmBootstrapData,
  Employee,
  EquipmentType,
  EquipmentUnit,
  ProductCatalogItem,
  Reaction,
  Site,
  TicketCriticality,
  TicketStatus,
  TicketType,
} from '../types'
import { formatPhoneNumber } from '../utils/phone'
import { createRandomId } from '../utils/random'
import { API_BASE_URL, MOCK_NETWORK_DELAY_MS, USE_MOCK_DATA, wait } from './config'

const NANOSECONDS_PER_DAY = 24 * 60 * 60 * 1_000_000_000

interface DictionaryMaps {
  typeById: Map<string, AppealType>
  statusById: Map<string, AppealStatus>
  criticalityById: Map<string, AppealCriticality>
  typeIdByName: Map<AppealType, string>
  statusIdByName: Map<AppealStatus, string>
  criticalityIdByName: Map<AppealCriticality, string>
}

function authHeaders(tokens: AuthTokens): HeadersInit {
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function checkResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }

  return (await response.json()) as unknown
}

function readStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return fallback
}

function readOptionalStringValue(value: unknown): string | undefined {
  const stringValue = readStringValue(value)
  return stringValue ? stringValue : undefined
}

function readNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function normalizeAppealType(value: unknown): AppealType {
  return readStringValue(value).toUpperCase() === 'WFM' ? 'WFM' : 'KTP'
}

function normalizeAppealLinkType(value: unknown): AppealLinkType {
  switch (readStringValue(value).toLowerCase()) {
    case 'parent_for':
      return 'parent_for'
    case 'subtask_for':
      return 'subtask_for'
    case 'subtask':
      return 'subtask'
    default:
      return 'related'
  }
}

function normalizeCriticality(value: unknown): AppealCriticality {
  const normalized = readStringValue(value)
  switch (normalized) {
    case 'Critical':
      return 'Critical'
    case 'Important':
      return 'Important'
    default:
      return 'Basic'
  }
}

function normalizeDeadlineDays(value: unknown, criticalityName: AppealCriticality): number {
  const numericValue = readNumberValue(value, 0)
  if (numericValue <= 0) {
    return PRIORITY_DEADLINE_DAYS[criticalityName]
  }

  if (numericValue > NANOSECONDS_PER_DAY) {
    return Math.max(1, Math.round(numericValue / NANOSECONDS_PER_DAY))
  }

  return Math.max(1, Math.round(numericValue))
}

function fetchJSON(tokens: AuthTokens, path: string): Promise<unknown> {
  return fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: 'GET',
    headers: authHeaders(tokens),
  }).then(checkResponse)
}

async function safeFetchJSON<T>(tokens: AuthTokens, path: string, fallback: T): Promise<T | unknown> {
  try {
    return await fetchJSON(tokens, path)
  } catch (error) {
    console.error(`Failed to fetch ${path}`, error)
    return fallback
  }
}

function normalizeProduct(rawProduct: unknown): ProductCatalogItem {
  const safeProduct = (rawProduct && typeof rawProduct === 'object' ? rawProduct : {}) as Record<
    string,
    unknown
  >

  return {
    id: readStringValue(safeProduct.id, createRandomId()),
    name: readStringValue(safeProduct.name),
    description: readStringValue(safeProduct.description),
  }
}

function normalizeEquipmentType(rawType: unknown): EquipmentType {
  const safeType = (rawType && typeof rawType === 'object' ? rawType : {}) as Record<string, unknown>

  return {
    id: readStringValue(safeType.id, createRandomId()),
    name: readStringValue(safeType.name),
    description: readStringValue(safeType.description),
  }
}

function normalizeTicketType(rawType: unknown): TicketType {
  const safeType = (rawType && typeof rawType === 'object' ? rawType : {}) as Record<string, unknown>

  return {
    id: readStringValue(safeType.id, createRandomId()),
    name: normalizeAppealType(safeType.name),
  }
}

function normalizeTicketStatus(rawStatus: unknown): TicketStatus {
  const safeStatus = (rawStatus && typeof rawStatus === 'object' ? rawStatus : {}) as Record<
    string,
    unknown
  >
  const name = normalizeAppealStatus(readStringValue(safeStatus.name))

  return {
    id: readStringValue(safeStatus.id, createRandomId()),
    name,
  }
}

function normalizeTicketCriticality(rawCriticality: unknown): TicketCriticality {
  const safeCriticality = (
    rawCriticality && typeof rawCriticality === 'object' ? rawCriticality : {}
  ) as Record<string, unknown>
  const name = normalizeCriticality(safeCriticality.name)

  return {
    id: readStringValue(safeCriticality.id, createRandomId()),
    name,
    deadlineDays: normalizeDeadlineDays(
      safeCriticality.deadlineDays ?? safeCriticality.deadline_days ?? safeCriticality.deadline,
      name,
    ),
  }
}

function normalizeReaction(rawReaction: unknown): Reaction {
  const safeReaction = (
    rawReaction && typeof rawReaction === 'object' ? rawReaction : {}
  ) as Record<string, unknown>

  return {
    id: readStringValue(safeReaction.id, createRandomId()),
    name: readStringValue(safeReaction.name),
    picture: readStringValue(safeReaction.picture),
  }
}

function normalizeRepresentative(rawRepresentative: unknown): ClientRepresentative {
  const safeRepresentative = (
    rawRepresentative && typeof rawRepresentative === 'object' ? rawRepresentative : {}
  ) as Record<string, unknown>

  return {
    accountId:
      readOptionalStringValue(safeRepresentative.accountId) ??
      readStringValue(safeRepresentative.account_id, createRandomId()),
    clientId:
      readOptionalStringValue(safeRepresentative.clientId) ??
      readStringValue(safeRepresentative.client_id, ''),
    fullName:
      readOptionalStringValue(safeRepresentative.fullName) ??
      readStringValue(safeRepresentative.full_name, 'Представитель клиента'),
    image: readStringValue(safeRepresentative.image),
    birthDate:
      readOptionalStringValue(safeRepresentative.birthDate) ??
      readStringValue(safeRepresentative.birth_date, ''),
    position:
      readOptionalStringValue(safeRepresentative.position) ??
      readStringValue(safeRepresentative.position, ''),
    phoneNumber: formatPhoneNumber(
      readOptionalStringValue(safeRepresentative.phoneNumber) ??
        readStringValue(safeRepresentative.phone_number, ''),
    ),
    email: readStringValue(safeRepresentative.email),
    login: readStringValue(safeRepresentative.login),
    passwordHash: readStringValue(safeRepresentative.passwordHash ?? safeRepresentative.password_hash),
    role: 'client',
  }
}

function normalizeClient(rawClient: unknown): ClientCompany {
  const safeClient = (rawClient && typeof rawClient === 'object' ? rawClient : {}) as Record<
    string,
    unknown
  >

  return {
    id: readStringValue(safeClient.id, createRandomId()),
    name: readStringValue(safeClient.name),
    address: readStringValue(safeClient.address),
    ceoId: readOptionalStringValue(safeClient.ceoId ?? safeClient.ceo_id),
    representatives: Array.isArray(safeClient.representatives)
      ? safeClient.representatives.map((representative) => normalizeRepresentative(representative))
      : [],
  }
}

function normalizeSite(rawSite: unknown): Site {
  const safeSite = (rawSite && typeof rawSite === 'object' ? rawSite : {}) as Record<string, unknown>

  const productIDs = Array.isArray(safeSite.productIds)
    ? safeSite.productIds
    : Array.isArray(safeSite.product_ids)
      ? safeSite.product_ids
      : []

  return {
    id: readStringValue(safeSite.id, createRandomId()),
    name: readStringValue(safeSite.name),
    address: readStringValue(safeSite.address),
    responsibleId:
      readOptionalStringValue(safeSite.responsibleId) ?? readStringValue(safeSite.responsible_id, ''),
    clientId: readOptionalStringValue(safeSite.clientId) ?? readStringValue(safeSite.client_id, ''),
    productIds: productIDs
      .map((productID) => readStringValue(productID))
      .filter((productID) => productID.length > 0),
  }
}

function normalizeEquipment(rawEquipment: unknown): EquipmentUnit {
  const safeEquipment = (
    rawEquipment && typeof rawEquipment === 'object' ? rawEquipment : {}
  ) as Record<string, unknown>

  return {
    id: readStringValue(safeEquipment.id, createRandomId()),
    typeId: readOptionalStringValue(safeEquipment.typeId) ?? readStringValue(safeEquipment.type_id, ''),
    siteId: readOptionalStringValue(safeEquipment.siteId ?? safeEquipment.site_id),
    serialNumber:
      readOptionalStringValue(safeEquipment.serialNumber) ?? readStringValue(safeEquipment.serial_number, ''),
    name: readStringValue(safeEquipment.name),
    weight: readNumberValue(safeEquipment.weight, 0),
    description: readStringValue(safeEquipment.description),
  }
}

function normalizeEmployee(rawEmployee: unknown): Employee {
  const safeEmployee = (
    rawEmployee && typeof rawEmployee === 'object' ? rawEmployee : {}
  ) as Record<string, unknown>

  return {
    accountId:
      readOptionalStringValue(safeEmployee.accountId) ??
      readStringValue(safeEmployee.account_id, createRandomId()),
    fullName:
      readOptionalStringValue(safeEmployee.fullName) ??
      readStringValue(safeEmployee.full_name, 'Сотрудник CRM'),
    image: readStringValue(safeEmployee.image),
    birthDate:
      readOptionalStringValue(safeEmployee.birthDate) ?? readStringValue(safeEmployee.birth_date, ''),
    position: readStringValue(safeEmployee.position),
    phoneNumber: formatPhoneNumber(
      readOptionalStringValue(safeEmployee.phoneNumber) ??
        readStringValue(safeEmployee.phone_number, ''),
    ),
    email: readStringValue(safeEmployee.email),
    role: (readOptionalStringValue(safeEmployee.role) as Employee['role'] | undefined) ?? 'client',
    login: readStringValue(safeEmployee.login),
    passwordHash: readStringValue(safeEmployee.passwordHash ?? safeEmployee.password_hash),
    hireDate: readOptionalStringValue(safeEmployee.hireDate) ?? readStringValue(safeEmployee.hire_date, ''),
  }
}

function buildDictionaryMaps(data: Pick<CrmBootstrapData, 'ticketTypes' | 'ticketStatuses' | 'ticketCriticalities'>): DictionaryMaps {
  return {
    typeById: new Map(data.ticketTypes.map((item) => [item.id, item.name])),
    statusById: new Map(data.ticketStatuses.map((item) => [item.id, item.name])),
    criticalityById: new Map(data.ticketCriticalities.map((item) => [item.id, item.name])),
    typeIdByName: new Map(data.ticketTypes.map((item) => [item.name, item.id])),
    statusIdByName: new Map(data.ticketStatuses.map((item) => [item.name, item.id])),
    criticalityIdByName: new Map(data.ticketCriticalities.map((item) => [item.name, item.id])),
  }
}

function normalizeComment(rawComment: unknown, fallbackTicketId: string): AppealComment {
  const safeComment = (rawComment && typeof rawComment === 'object' ? rawComment : {}) as Record<
    string,
    unknown
  >

  const createdAt =
    readOptionalStringValue(safeComment.createdAt) ??
    readStringValue(safeComment.created_at) ??
    new Date().toISOString()

  return {
    id: readStringValue(safeComment.id, createRandomId()),
    ticketId:
      readOptionalStringValue(safeComment.ticketId) ??
      readStringValue(safeComment.ticket_id) ??
      fallbackTicketId,
    isClosedComment:
      (safeComment.isClosedComment as boolean | undefined) ??
      (safeComment.is_closed_comment as boolean | undefined) ??
      false,
    createdBy:
      readOptionalStringValue(safeComment.createdBy) ??
      readStringValue(safeComment.created_by, 'system'),
    authorName:
      readOptionalStringValue(safeComment.authorName) ??
      readStringValue(safeComment.author_name) ??
      'Пользователь',
    contents: readOptionalStringValue(safeComment.contents) ?? readStringValue(safeComment.text, ''),
    createdAt,
    updatedAt:
      readOptionalStringValue(safeComment.updatedAt) ??
      readStringValue(safeComment.updated_at) ??
      createdAt,
    files: (safeComment.files as AppealComment['files'] | undefined) ?? [],
  }
}

function normalizeAppeal(rawAppeal: unknown, dictionaries: DictionaryMaps): Appeal {
  const safeAppeal = (rawAppeal && typeof rawAppeal === 'object' ? rawAppeal : {}) as Record<
    string,
    unknown
  >

  const id = readStringValue(safeAppeal.id, `appeal-${Date.now()}`)
  const typeKey =
    readOptionalStringValue(safeAppeal.typeId) ??
    readOptionalStringValue(safeAppeal.type_id) ??
    readOptionalStringValue(safeAppeal.type)
  const statusKey =
    readOptionalStringValue(safeAppeal.statusId) ??
    readOptionalStringValue(safeAppeal.status_id) ??
    readOptionalStringValue(safeAppeal.status)
  const criticalityKey =
    readOptionalStringValue(safeAppeal.criticalityId) ??
    readOptionalStringValue(safeAppeal.criticality_id) ??
    readOptionalStringValue(safeAppeal.priority)

  const rawLinkedTicketIDs = Array.isArray(safeAppeal.linkedTicketIds)
    ? safeAppeal.linkedTicketIds
    : Array.isArray(safeAppeal.linked_ticket_ids)
      ? safeAppeal.linked_ticket_ids
      : Array.isArray(safeAppeal.linkedAppealIds)
        ? safeAppeal.linkedAppealIds
        : Array.isArray(safeAppeal.linked_appeal_ids)
          ? safeAppeal.linked_appeal_ids
          : []
  const rawLinks = Array.isArray(safeAppeal.links) ? safeAppeal.links : []

  return {
    id,
    title:
      readOptionalStringValue(safeAppeal.title) ??
      readStringValue(safeAppeal.crmNumber) ??
      `CRM-${id}`,
    description: readStringValue(safeAppeal.description),
    typeId: normalizeAppealType(typeKey ? (dictionaries.typeById.get(typeKey) ?? typeKey) : undefined),
    statusId: normalizeAppealStatus(
      statusKey ? (dictionaries.statusById.get(statusKey) ?? statusKey) : undefined,
    ),
    criticalityId: normalizeCriticality(
      criticalityKey ? (dictionaries.criticalityById.get(criticalityKey) ?? criticalityKey) : undefined,
    ),
    productId: readOptionalStringValue(safeAppeal.productId ?? safeAppeal.product_id ?? safeAppeal.product),
    clientId: readOptionalStringValue(safeAppeal.clientId) ?? readStringValue(safeAppeal.client_id, ''),
    siteId: readOptionalStringValue(safeAppeal.siteId ?? safeAppeal.site_id),
    responsibleId: readOptionalStringValue(safeAppeal.responsibleId ?? safeAppeal.responsible_id),
    createdBy:
      readOptionalStringValue(safeAppeal.createdBy) ??
      readStringValue(safeAppeal.created_by) ??
      readStringValue(safeAppeal.createdById, 'system'),
    updatedBy:
      readOptionalStringValue(safeAppeal.updatedBy) ??
      readStringValue(safeAppeal.updated_by) ??
      readOptionalStringValue(safeAppeal.createdBy) ??
      readStringValue(safeAppeal.created_by, 'system'),
    createdAt:
      readOptionalStringValue(safeAppeal.createdAt) ??
      readStringValue(safeAppeal.created_at) ??
      new Date().toISOString(),
    updatedAt:
      readOptionalStringValue(safeAppeal.updatedAt) ??
      readStringValue(safeAppeal.updated_at) ??
      new Date().toISOString(),
    linkedTicketIds: rawLinkedTicketIDs
      .map((linkedTicketID) => readStringValue(linkedTicketID))
      .filter((linkedTicketID) => linkedTicketID.length > 0),
    links: rawLinks
      .map((link) => {
        const safeLink = (link && typeof link === 'object' ? link : {}) as Record<string, unknown>
        const linkedAppealId = readStringValue(
          safeLink.linkedAppealId ?? safeLink.linked_appeal_id,
        )
        if (!linkedAppealId) {
          return null
        }

        return {
          linkedAppealId,
          relationType: normalizeAppealLinkType(safeLink.relationType ?? safeLink.relation_type),
        }
      })
      .filter((link): link is NonNullable<typeof link> => Boolean(link)),
    comments: Array.isArray(safeAppeal.comments)
      ? safeAppeal.comments.map((comment) => normalizeComment(comment, id))
      : [],
  }
}

function normalizeBootstrap(payload: unknown): CrmBootstrapData {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Неверный формат bootstrap данных')
  }

  const safe = payload as Record<string, unknown>
  const productsSource = Array.isArray(safe.products) ? safe.products : []
  const equipmentTypesSource = Array.isArray(safe.equipmentTypes)
    ? safe.equipmentTypes
    : Array.isArray(safe.equipment_types)
      ? safe.equipment_types
      : []
  const ticketTypesSource = Array.isArray(safe.ticketTypes)
    ? safe.ticketTypes
    : Array.isArray(safe.ticket_types)
      ? safe.ticket_types
      : []
  const ticketStatusesSource = Array.isArray(safe.ticketStatuses)
    ? safe.ticketStatuses
    : Array.isArray(safe.ticket_statuses)
      ? safe.ticket_statuses
      : []
  const ticketCriticalitiesSource = Array.isArray(safe.ticketCriticalities)
    ? safe.ticketCriticalities
    : Array.isArray(safe.ticket_criticalities)
      ? safe.ticket_criticalities
      : []
  const reactionsSource = Array.isArray(safe.reactions) ? safe.reactions : []

  const normalized: CrmBootstrapData = {
    appeals: [],
    employees: [],
    clients: [],
    sites: [],
    equipment: [],
    users: [],
    products: productsSource.map((item) => normalizeProduct(item)),
    equipmentTypes: equipmentTypesSource.map((item) => normalizeEquipmentType(item)),
    ticketTypes: ticketTypesSource.map((item) => normalizeTicketType(item)),
    ticketStatuses: ticketStatusesSource.map((item) => normalizeTicketStatus(item)),
    ticketCriticalities: ticketCriticalitiesSource.map((item) => normalizeTicketCriticality(item)),
    reactions: reactionsSource.map((item) => normalizeReaction(item)),
  }

  const dictionaries = buildDictionaryMaps(normalized)

  if (Array.isArray(safe.appeals)) {
    normalized.appeals = safe.appeals.map((appeal) => normalizeAppeal(appeal, dictionaries))
  }
  if (Array.isArray(safe.employees)) {
    normalized.employees = safe.employees.map((employee) => normalizeEmployee(employee))
  }
  if (Array.isArray(safe.clients)) {
    normalized.clients = safe.clients.map((client) => normalizeClient(client))
  }
  if (Array.isArray(safe.sites)) {
    normalized.sites = safe.sites.map((site) => normalizeSite(site))
  }
  if (Array.isArray(safe.equipment)) {
    normalized.equipment = safe.equipment.map((equipment) => normalizeEquipment(equipment))
  }

  return normalized
}

async function loadAppealRelations(
  tokens: AuthTokens,
  appealId: string,
): Promise<Pick<Appeal, 'comments' | 'linkedTicketIds' | 'links'>> {
  const [commentsPayload, linksPayload] = await Promise.all([
    safeFetchJSON(tokens, `/appeals/${appealId}/comments`, [] as unknown[]),
    safeFetchJSON(tokens, `/appeals/${appealId}/links`, [] as unknown[]),
  ])

  const comments = Array.isArray(commentsPayload)
    ? commentsPayload.map((comment) => normalizeComment(comment, appealId))
    : []
  const links = Array.isArray(linksPayload)
    ? linksPayload
        .map((link) => {
          const safeLink = (link && typeof link === 'object' ? link : {}) as Record<string, unknown>
          const linkedAppealId = readStringValue(
            safeLink.linkedAppealId ??
              safeLink.linked_appeal_id ??
              ((safeLink.linkedAppeal as Record<string, unknown> | undefined)?.id ??
                (safeLink.linked_appeal as Record<string, unknown> | undefined)?.id),
          )
          if (!linkedAppealId) {
            return null
          }

          return {
            linkedAppealId,
            relationType: normalizeAppealLinkType(safeLink.relationType ?? safeLink.relation_type),
          }
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link))
    : []

  return {
    comments,
    linkedTicketIds: links.map((link) => link.linkedAppealId),
    links,
  }
}

function resolveDictionaryNumericID<T extends string>(
  rawValue: unknown,
  dictionary: Map<T, string>,
): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return undefined
  }

  const rawString = readStringValue(rawValue)
  const resolved = dictionary.get(rawString as T) ?? rawString
  const numeric = readNumberValue(resolved, 0)
  return numeric > 0 ? numeric : undefined
}

function resolveNumericID(rawValue: unknown): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return undefined
  }

  const numeric = readNumberValue(rawValue, 0)
  return numeric > 0 ? numeric : undefined
}

function serializeAppealPayload(
  payload: Partial<Appeal>,
  dictionaries: DictionaryMaps,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (payload.title !== undefined) {
    body.title = payload.title
  }

  if (payload.description !== undefined) {
    body.description = payload.description
  }

  if (payload.typeId !== undefined) {
    body.type_id = resolveDictionaryNumericID(payload.typeId, dictionaries.typeIdByName)
  }

  if (payload.statusId !== undefined) {
    body.status_id = resolveDictionaryNumericID(payload.statusId, dictionaries.statusIdByName)
  }

  if (payload.criticalityId !== undefined) {
    body.criticality_id = resolveDictionaryNumericID(
      payload.criticalityId,
      dictionaries.criticalityIdByName,
    )
  }

  if (payload.clientId !== undefined) {
    body.client_id = resolveNumericID(payload.clientId)
  }

  if (payload.siteId !== undefined) {
    body.site_id = resolveNumericID(payload.siteId)
  }

  if (payload.productId !== undefined) {
    body.product_id = resolveNumericID(payload.productId)
  }

  if (payload.responsibleId !== undefined) {
    body.responsible_id = resolveNumericID(payload.responsibleId)
  }

  return body
}

function withOptionalString(
  body: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    return
  }

  const normalized = value.trim()
  body[key] = normalized || null
}

function serializeEmployeePayload(employee: Employee): Record<string, unknown> {
  const body: Record<string, unknown> = {
    login: employee.login.trim(),
    role: employee.role,
    full_name: employee.fullName.trim(),
    phone_number: employee.phoneNumber.trim(),
    email: employee.email.trim(),
  }

  withOptionalString(body, 'password', employee.passwordHash)
  withOptionalString(body, 'image', employee.image)
  withOptionalString(body, 'birth_date', employee.birthDate)
  withOptionalString(body, 'position', employee.position)
  withOptionalString(body, 'hire_date', employee.hireDate)

  return body
}

function serializeClientPayload(client: ClientCompany): Record<string, unknown> {
  return {
    name: client.name.trim(),
    address: client.address.trim(),
    ceo_id: resolveNumericID(client.ceoId) ?? null,
  }
}

function serializeRepresentativePayload(
  customerId: string,
  representative: ClientRepresentative,
  includeClientID: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    login: representative.login.trim(),
    full_name: representative.fullName.trim(),
    phone_number: representative.phoneNumber.trim(),
    email: representative.email.trim(),
  }

  if (includeClientID) {
    body.client_id = resolveNumericID(customerId) ?? null
  }

  withOptionalString(body, 'password', representative.passwordHash)
  withOptionalString(body, 'image', representative.image)
  withOptionalString(body, 'birth_date', representative.birthDate)
  withOptionalString(body, 'position', representative.position)

  return body
}

function serializeSitePayload(site: Site): Record<string, unknown> {
  return {
    responsible_id: resolveNumericID(site.responsibleId),
    name: site.name.trim(),
    address: site.address.trim(),
    product_ids: site.productIds
      .map((productId) => resolveNumericID(productId))
      .filter((productId): productId is number => Number.isFinite(productId)),
  }
}

function serializeEquipmentPayload(equipment: EquipmentUnit): Record<string, unknown> {
  const normalizedSiteId =
    equipment.siteId === undefined || equipment.siteId === '' ? null : resolveNumericID(equipment.siteId)

  return {
    type_id: resolveNumericID(equipment.typeId),
    site_id: normalizedSiteId,
    serial_number: equipment.serialNumber.trim(),
    name: equipment.name.trim(),
    weight: String(Math.max(0, Number(equipment.weight) || 0)),
    description: equipment.description.trim(),
  }
}

export async function loadCrmBootstrap(tokens: AuthTokens): Promise<CrmBootstrapData> {
  if (USE_MOCK_DATA) {
    await wait(MOCK_NETWORK_DELAY_MS)
    return normalizeBootstrap(getMockBootstrapData())
  }

  const bootstrapPayload = await fetchJSON(tokens, '/bootstrap')
  const baseData = normalizeBootstrap(bootstrapPayload)
  const dictionaries = buildDictionaryMaps(baseData)

  const [appealsPayload, employeesPayload, clientsPayload, sitesPayload, equipmentPayload] =
    await Promise.all([
      safeFetchJSON(tokens, '/appeals', [] as unknown[]),
      safeFetchJSON(tokens, '/employees', [] as unknown[]),
      safeFetchJSON(tokens, '/clients', [] as unknown[]),
      safeFetchJSON(tokens, '/sites', [] as unknown[]),
      safeFetchJSON(tokens, '/equipment', [] as unknown[]),
    ])

  const normalizedAppeals = Array.isArray(appealsPayload)
    ? await Promise.all(
        appealsPayload.map(async (appeal) => {
          const normalizedAppeal = normalizeAppeal(appeal, dictionaries)
          const relations = await loadAppealRelations(tokens, normalizedAppeal.id)

          return {
            ...normalizedAppeal,
            comments: relations.comments,
            linkedTicketIds: relations.linkedTicketIds,
            links: relations.links,
          }
        }),
      )
    : []

  return {
    ...baseData,
    appeals: normalizedAppeals,
    employees: Array.isArray(employeesPayload)
      ? employeesPayload.map((employee) => normalizeEmployee(employee))
      : [],
    clients: Array.isArray(clientsPayload) ? clientsPayload.map((client) => normalizeClient(client)) : [],
    sites: Array.isArray(sitesPayload) ? sitesPayload.map((site) => normalizeSite(site)) : [],
    equipment: Array.isArray(equipmentPayload)
      ? equipmentPayload.map((equipment) => normalizeEquipment(equipment))
      : [],
    users: [],
  }
}

export async function loadAppealById(
  tokens: AuthTokens,
  data: Pick<CrmBootstrapData, 'ticketTypes' | 'ticketStatuses' | 'ticketCriticalities'>,
  appealId: string,
): Promise<Appeal> {
  const dictionaries = buildDictionaryMaps(data)
  const appealPayload = await fetchJSON(tokens, `/appeals/${appealId}`)
  const appeal = normalizeAppeal(appealPayload, dictionaries)
  const relations = await loadAppealRelations(tokens, appeal.id)

  return {
    ...appeal,
    comments: relations.comments,
    linkedTicketIds: relations.linkedTicketIds,
    links: relations.links,
  }
}

export async function syncAppealPatch(
  tokens: AuthTokens,
  data: Pick<CrmBootstrapData, 'ticketTypes' | 'ticketStatuses' | 'ticketCriticalities'>,
  appealId: string,
  patch: Partial<Appeal>,
): Promise<Appeal> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return loadAppealById(tokens, data, appealId)
  }

  const response = await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}`, {
      method: 'PATCH',
      headers: authHeaders(tokens),
      body: JSON.stringify(serializeAppealPayload(patch, buildDictionaryMaps(data))),
    }),
  )

  return normalizeAppeal(response, buildDictionaryMaps(data))
}

export async function syncAppealComment(
  tokens: AuthTokens,
  appealId: string,
  contents: string,
  _files: Array<{ name: string; size: number }>,
): Promise<void> {
  void _files

  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}/comments`, {
      method: 'POST',
      headers: authHeaders(tokens),
      body: JSON.stringify({ contents }),
    }),
  )
}

export async function syncAppealLink(
  tokens: AuthTokens,
  appealId: string,
  linkedAppealId: string,
  relationType: AppealLinkType,
): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}/links`, {
      method: 'POST',
      headers: authHeaders(tokens),
      body: JSON.stringify({
        linked_appeal_id: resolveNumericID(linkedAppealId),
        relation_type: relationType === 'subtask' ? 'subtask' : 'related',
      }),
    }),
  )
}

export async function syncAppealUnlink(
  tokens: AuthTokens,
  appealId: string,
  linkedAppealId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/appeals/${appealId}/links/${linkedAppealId}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncAppealCreate(
  tokens: AuthTokens,
  data: Pick<CrmBootstrapData, 'ticketTypes' | 'ticketStatuses' | 'ticketCriticalities'>,
  draft: Partial<Appeal>,
): Promise<Appeal> {
  if (USE_MOCK_DATA) {
    await wait(80)
    throw new Error('Создание обращения в mock-режиме не поддерживается')
  }

  const createdAppeal = await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/appeals`, {
      method: 'POST',
      headers: authHeaders(tokens),
      body: JSON.stringify(serializeAppealPayload(draft, buildDictionaryMaps(data))),
    }),
  )

  return loadAppealById(
    tokens,
    data,
    readStringValue((createdAppeal as Record<string, unknown> | null)?.id),
  )
}

export async function syncEmployeeUpsert(tokens: AuthTokens, employee: Employee): Promise<Employee> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return employee
  }

  const numericID = resolveNumericID(employee.accountId)
  const response = await checkResponse(
    await fetch(
      `${API_BASE_URL}/api/v1/employees${numericID ? `/${numericID}` : ''}`,
      {
        method: numericID ? 'PATCH' : 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(serializeEmployeePayload(employee)),
      },
    ),
  )

  return normalizeEmployee(response)
}

export async function syncEmployeeDelete(tokens: AuthTokens, employeeId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/employees/${resolveNumericID(employeeId)}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncClientUpsert(tokens: AuthTokens, client: ClientCompany): Promise<ClientCompany> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return client
  }

  const numericID = resolveNumericID(client.id)
  const response = await checkResponse(
    await fetch(
      `${API_BASE_URL}/api/v1/clients${numericID ? `/${numericID}` : ''}`,
      {
        method: numericID ? 'PATCH' : 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(serializeClientPayload(client)),
      },
    ),
  )

  return normalizeClient(response)
}

export async function syncClientDelete(
  tokens: AuthTokens,
  clientId: string,
  mode: 'delete' | 'unassign' = 'delete',
): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/clients/${resolveNumericID(clientId)}?mode=${mode}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncRepresentativeUpsert(
  tokens: AuthTokens,
  customerId: string,
  representative: ClientRepresentative,
): Promise<ClientRepresentative> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return representative
  }

  const numericID = resolveNumericID(representative.accountId)
  const payload = serializeRepresentativePayload(customerId, representative, Boolean(numericID))
  const response = await checkResponse(
    await fetch(
      numericID
        ? `${API_BASE_URL}/api/v1/representatives/${numericID}`
        : `${API_BASE_URL}/api/v1/clients/${resolveNumericID(customerId)}/representatives`,
      {
        method: numericID ? 'PATCH' : 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(payload),
      },
    ),
  )

  return normalizeRepresentative(response)
}

export async function syncRepresentativeDelete(
  tokens: AuthTokens,
  representativeId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/representatives/${resolveNumericID(representativeId)}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncSiteUpsert(tokens: AuthTokens, site: Site): Promise<Site> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return site
  }

  const numericID = resolveNumericID(site.id)
  const response = await checkResponse(
    await fetch(
      `${API_BASE_URL}/api/v1/sites${numericID ? `/${numericID}` : ''}`,
      {
        method: numericID ? 'PATCH' : 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(serializeSitePayload(site)),
      },
    ),
  )

  return normalizeSite(response)
}

export async function syncSiteDelete(tokens: AuthTokens, siteId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/sites/${resolveNumericID(siteId)}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncEquipmentUpsert(
  tokens: AuthTokens,
  equipment: EquipmentUnit,
): Promise<EquipmentUnit> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return equipment
  }

  const numericID = resolveNumericID(equipment.id)
  const response = await checkResponse(
    await fetch(
      `${API_BASE_URL}/api/v1/equipment${numericID ? `/${numericID}` : ''}`,
      {
        method: numericID ? 'PATCH' : 'POST',
        headers: authHeaders(tokens),
        body: JSON.stringify(serializeEquipmentPayload(equipment)),
      },
    ),
  )

  return normalizeEquipment(response)
}

export async function syncEquipmentDelete(tokens: AuthTokens, equipmentId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/equipment/${resolveNumericID(equipmentId)}`, {
      method: 'DELETE',
      headers: authHeaders(tokens),
    }),
  )
}

export async function syncEquipmentSite(
  tokens: AuthTokens,
  equipmentId: string,
  siteId: string,
): Promise<EquipmentUnit> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return {
      id: equipmentId,
      typeId: '',
      siteId,
      serialNumber: '',
      name: '',
      weight: 0,
      description: '',
    }
  }

  const response = await checkResponse(
    await fetch(`${API_BASE_URL}/api/v1/equipment/${resolveNumericID(equipmentId)}`, {
      method: 'PATCH',
      headers: authHeaders(tokens),
      body: JSON.stringify({ site_id: resolveNumericID(siteId) }),
    }),
  )

  return normalizeEquipment(response)
}
