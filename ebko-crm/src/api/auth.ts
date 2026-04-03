import { findMockUserByCredentials } from '../mockData'
import type {
  AuthTokens,
  LoginPayload,
  LoginResult,
  RefreshPayload,
  TaskDashboard,
  UserProfile,
} from '../types'
import { formatPhoneNumber } from '../utils/phone'
import { createRandomTokenFragment } from '../utils/random'
import { API_BASE_URL, MOCK_NETWORK_DELAY_MS, USE_MOCK_DATA, wait } from './config'

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function readStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function parseTokens(payload: unknown): AuthTokens | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const safePayload = payload as Record<string, unknown>
  const accessToken = safePayload.access_token ?? safePayload.accessToken
  const refreshToken = safePayload.refresh_token ?? safePayload.refreshToken

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return null
  }

  return {
    accessToken,
    refreshToken,
  }
}

function parseProfile(payload: unknown): UserProfile | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const safeUser = payload as Record<string, unknown>
  const id = readStringValue(safeUser.id) ?? readStringValue(safeUser.account_id)
  const fullName =
    readStringValue(safeUser.fullName) ??
    readStringValue(safeUser.full_name) ??
    readStringValue(safeUser.name)

  if (!id || !fullName) {
    return null
  }

  return {
    id,
    fullName,
    role: safeUser.role as UserProfile['role'],
    position: readStringValue(safeUser.position) ?? 'Пользователь CRM',
    phoneNumber:
      formatPhoneNumber(
        readStringValue(safeUser.phoneNumber) ??
          readStringValue(safeUser.phone_number) ??
          readStringValue(safeUser.phone) ??
          '',
      ) || '-',
    email: readStringValue(safeUser.email) ?? '-',
    image: readStringValue(safeUser.image) ?? readStringValue(safeUser.photoUrl) ?? '',
    login: readStringValue(safeUser.login) ?? id,
    clientId: readStringValue(safeUser.clientId) ?? readStringValue(safeUser.client_id) ?? undefined,
    representativeId:
      readStringValue(safeUser.representativeId) ??
      readStringValue(safeUser.representative_id) ??
      undefined,
  }
}

function parseUser(payload: unknown): UserProfile | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const safePayload = payload as Record<string, unknown>
  return parseProfile(safePayload.user)
}

function parseTaskDashboard(payload: unknown): TaskDashboard | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const safeDashboard = payload as Record<string, unknown>
  const id = readStringValue(safeDashboard.id)
  const name = readStringValue(safeDashboard.name)
  const safeFilters =
    safeDashboard.filters && typeof safeDashboard.filters === 'object'
      ? (safeDashboard.filters as Record<string, unknown>)
      : {}
  const safeSort =
    safeDashboard.sort && typeof safeDashboard.sort === 'object'
      ? (safeDashboard.sort as Record<string, unknown>)
      : {}

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    filters: {
      status: (readStringValue(safeFilters.status) as TaskDashboard['filters']['status']) ?? 'all',
      criticality:
        (readStringValue(safeFilters.criticality) as TaskDashboard['filters']['criticality']) ??
        'all',
      type: (readStringValue(safeFilters.type) as TaskDashboard['filters']['type']) ?? 'all',
      search: readStringValue(safeFilters.search) ?? '',
    },
    sort: {
      field: (readStringValue(safeSort.field) as TaskDashboard['sort']['field']) ?? 'updatedAt',
      direction:
        (readStringValue(safeSort.direction) as TaskDashboard['sort']['direction']) ?? 'desc',
    },
  }
}

function parseTaskDashboards(payload: unknown): TaskDashboard[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((item) => parseTaskDashboard(item))
    .filter((item): item is TaskDashboard => item !== null)
}

function withOptionalProfileString(
  body: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    return
  }

  if (key === 'image') {
    body[key] = value
    return
  }

  body[key] = value.trim()
}

function serializeProfilePatch(patch: Partial<UserProfile>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  withOptionalProfileString(body, 'full_name', patch.fullName)
  withOptionalProfileString(body, 'phone_number', patch.phoneNumber)
  withOptionalProfileString(body, 'email', patch.email)
  withOptionalProfileString(body, 'image', patch.image)
  withOptionalProfileString(body, 'position', patch.position)

  return body
}

export async function loadCurrentProfile(tokens: AuthTokens): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    })

    if (!response.ok) {
      return null
    }

    return parseProfile((await response.json()) as unknown)
  } catch {
    return null
  }
}

export async function syncCurrentProfile(
  tokens: AuthTokens,
  patch: Partial<UserProfile>,
): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/api/v1/profiles/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(serializeProfilePatch(patch)),
  })

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status)
  }

  const profile = parseProfile((await response.json()) as unknown)
  if (!profile) {
    throw new ApiError('Сервер вернул некорректные данные профиля.', 500)
  }

  return profile
}

export async function loadTaskDashboards(tokens: AuthTokens): Promise<TaskDashboard[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/profiles/me/dashboards`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    })

    if (!response.ok) {
      return []
    }

    return parseTaskDashboards((await response.json()) as unknown)
  } catch {
    return []
  }
}

export async function syncTaskDashboards(
  tokens: AuthTokens,
  dashboards: TaskDashboard[],
): Promise<TaskDashboard[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/profiles/me/dashboards`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dashboards),
  })

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status)
  }

  return parseTaskDashboards((await response.json()) as unknown)
}

function generateMockTokens(): AuthTokens {
  const random = createRandomTokenFragment()
  return {
    accessToken: `mock_access_${random}`,
    refreshToken: `mock_refresh_${random}`,
  }
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) {
    return `Ошибка запроса: ${response.status}`
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const message = payload.error ?? payload.message
    if (typeof message === 'string') {
      return message
    }
  } catch {
    return text
  }

  return text
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  const basicToken = btoa(`${payload.login}:${payload.password}`)

  if (!USE_MOCK_DATA) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicToken}`,
      },
    })

    if (!response.ok) {
      throw new ApiError(await parseError(response), response.status)
    }

    const body = (await response.json()) as unknown
    const tokens = parseTokens(body)
    if (!tokens) {
      throw new ApiError('Сервер не вернул access/refresh токены.', 500)
    }

    const bodyUser = parseUser(body)
    const profileUser = await loadCurrentProfile(tokens)
    const mockUser = findMockUserByCredentials(payload.login, payload.password)

    return {
      tokens,
      user:
        bodyUser ??
        profileUser ??
        mockUser ?? {
          id: `user-${payload.login}`,
          fullName: payload.login,
          role: 'client',
          position: 'Пользователь CRM',
          phoneNumber: '-',
          email: '-',
          image: '',
          login: payload.login,
        },
    }
  }

  await wait(MOCK_NETWORK_DELAY_MS)
  const mockUser = findMockUserByCredentials(payload.login, payload.password)

  if (!mockUser) {
    throw new ApiError('Неверный логин или пароль.', 401)
  }

  return {
    tokens: generateMockTokens(),
    user: mockUser,
  }
}

export async function refreshToken(payload: RefreshPayload): Promise<AuthTokens> {
  if (USE_MOCK_DATA) {
    await wait(120)
    return {
      accessToken: `mock_access_${createRandomTokenFragment()}`,
      refreshToken: payload.refreshToken,
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: payload.refreshToken }),
  })

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status)
  }

  const body = (await response.json()) as unknown
  const tokens = parseTokens(body)
  if (!tokens) {
    throw new ApiError('Сервер не вернул обновленные токены.', 500)
  }

  return tokens
}

export async function logout(tokens: AuthTokens): Promise<void> {
  if (USE_MOCK_DATA) {
    await wait(80)
    return
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  })

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status)
  }
}

export { ApiError }
