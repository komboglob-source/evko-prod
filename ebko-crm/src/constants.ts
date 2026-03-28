import type { AppealCriticality, AppealStatus, ModuleKey, UserRole } from './types'

export const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'appeals', label: 'Обращения' },
  { key: 'employees', label: 'Сотрудники' },
  { key: 'customers', label: 'Заказчики' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'equipment', label: 'Оборудование' },
  { key: 'task_board', label: 'Доска задач' },
  { key: 'profile', label: 'Настройки профиля' },
]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Админ',
  ktp: 'Оператор КТП',
  wfm: 'Инженер WFM',
  client: 'Клиент',
  ebko: 'EBKO',
}

export const STATUS_ORDER: AppealStatus[] = [
  'Created',
  'Opened',
  'Customer Pending',
  'Done',
  'Verified',
]

export const PRIORITY_ORDER: AppealCriticality[] = ['Critical', 'Important', 'Basic']

export const PRIORITY_DEADLINE_DAYS: Record<AppealCriticality, number> = {
  Basic: 30,
  Important: 15,
  Critical: 1,
}

export const STATUS_LABELS: Record<AppealStatus, string> = {
  Created: 'Создано',
  Opened: 'В работе',
  'Customer Pending': 'Ожидание клиента',
  Done: 'Выполнено',
  Verified: 'Проверено',
}

const LEGACY_STATUS_MAP: Record<string, AppealStatus> = {
  Active: 'Opened',
  Development: 'Opened',
  'Info Request': 'Customer Pending',
  Canceled: 'Done',
}

export function normalizeAppealStatus(status: unknown): AppealStatus {
  if (typeof status !== 'string') {
    return 'Created'
  }

  if (STATUS_ORDER.includes(status as AppealStatus)) {
    return status as AppealStatus
  }

  return LEGACY_STATUS_MAP[status] ?? 'Created'
}
