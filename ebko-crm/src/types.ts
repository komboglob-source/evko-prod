export type UserRole = 'admin' | 'ktp' | 'wfm' | 'client' | 'ebko'

export type ModuleKey =
  | 'appeals'
  | 'employees'
  | 'customers'
  | 'clients'
  | 'equipment'
  | 'task_board'
  | 'profile'

export type AppealType = 'KTP' | 'WFM'

export type AppealStatus =
  | 'Created'
  | 'Opened'
  | 'Customer Pending'
  | 'Done'
  | 'Verified'

export type AppealCriticality = 'Basic' | 'Important' | 'Critical'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface ProductCatalogItem {
  id: string
  name: string
  description: string
}

export interface EquipmentType {
  id: string
  name: string
  description: string
}

export interface TicketType {
  id: string
  name: AppealType
}

export interface TicketStatus {
  id: string
  name: AppealStatus
}

export interface TicketCriticality {
  id: string
  name: AppealCriticality
  deadlineDays: number
}

export interface Reaction {
  id: string
  name: string
  picture: string
}

export interface UserProfile {
  id: string
  fullName: string
  role: UserRole
  position: string
  phoneNumber: string
  email: string
  image: string
  login: string
  clientId?: string
  representativeId?: string
}

export interface FileAttachment {
  id: string
  name: string
  size: number
}

export interface AppealComment {
  id: string
  ticketId: string
  isClosedComment: boolean
  createdBy: string
  authorName: string
  contents: string
  createdAt: string
  updatedAt: string
  files: FileAttachment[]
}

export interface Appeal {
  id: string
  title: string
  description: string
  typeId: AppealType
  statusId: AppealStatus
  criticalityId: AppealCriticality
  productId?: string
  clientId: string
  siteId?: string
  responsibleId?: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  linkedTicketIds: string[]
  comments: AppealComment[]
}

export interface Employee {
  accountId: string
  fullName: string
  image: string
  birthDate: string
  position: string
  phoneNumber: string
  email: string
  role: UserRole
  login: string
  passwordHash: string
  hireDate: string
}

export interface ClientRepresentative {
  accountId: string
  clientId: string
  fullName: string
  phoneNumber: string
  email: string
  login: string
  passwordHash: string
  role: 'client'
}

export interface ClientCompany {
  id: string
  name: string
  address: string
  ceoId?: string
  representatives: ClientRepresentative[]
}

export interface EquipmentUnit {
  id: string
  typeId: string
  siteId?: string
  serialNumber: string
  name: string
  weight: number
  description: string
}

export interface Site {
  id: string
  name: string
  address: string
  responsibleId: string
  clientId: string
  productIds: string[]
}

export interface CrmBootstrapData {
  appeals: Appeal[]
  employees: Employee[]
  clients: ClientCompany[]
  sites: Site[]
  equipment: EquipmentUnit[]
  users: UserProfile[]
  products: ProductCatalogItem[]
  equipmentTypes: EquipmentType[]
  ticketTypes: TicketType[]
  ticketStatuses: TicketStatus[]
  ticketCriticalities: TicketCriticality[]
  reactions: Reaction[]
}

export type DashboardSortField = 'updatedAt' | 'createdAt' | 'criticality' | 'title'

export interface TaskDashboardFilters {
  status: 'all' | AppealStatus
  criticality: 'all' | AppealCriticality
  type: 'all' | AppealType
  search: string
}

export interface TaskDashboardSort {
  field: DashboardSortField
  direction: 'asc' | 'desc'
}

export interface TaskDashboard {
  id: string
  name: string
  filters: TaskDashboardFilters
  sort: TaskDashboardSort
}

export interface LoginPayload {
  login: string
  password: string
}

export interface LoginResult {
  tokens: AuthTokens
  user: UserProfile
}

export interface RefreshPayload {
  refreshToken: string
}
