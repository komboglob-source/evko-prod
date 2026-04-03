import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  ApiError,
  loadCurrentProfile,
  loadTaskDashboards,
  login,
  logout,
  refreshToken,
  syncCurrentProfile,
  syncTaskDashboards,
} from './api/auth'
import {
  loadAppealById,
  loadCrmBootstrap,
  syncAppealComment,
  syncAppealCreate,
  syncAppealLink,
  syncAppealPatch,
  syncAppealUnlink,
  syncClientDelete,
  syncClientUpsert,
  syncEmployeeDelete,
  syncEmployeeUpsert,
  syncEquipmentDelete,
  syncEquipmentSite,
  syncEquipmentUpsert,
  syncRepresentativeDelete,
  syncRepresentativeUpsert,
  syncSiteDelete,
  syncSiteUpsert,
} from './api/crm'
import { LoginScreen } from './components/LoginScreen'
import { Sidebar } from './components/Sidebar'
import { AppealsModule } from './modules/AppealsModule'
import { ClientsModule } from './modules/ClientsModule'
import { CustomersModule } from './modules/CustomersModule'
import { EmployeesModule } from './modules/EmployeesModule'
import { EquipmentModule } from './modules/EquipmentModule'
import { ProfileModule } from './modules/ProfileModule'
import { TaskBoardModule } from './modules/TaskBoardModule'
import type {
  Appeal,
  AppealLinkType,
  AuthTokens,
  ClientRepresentative,
  ClientCompany,
  CrmBootstrapData,
  Employee,
  EquipmentUnit,
  FileAttachment,
  LoginPayload,
  ModuleKey,
  Site,
  TaskDashboard,
  UserProfile,
} from './types'
import { canAccessModule } from './utils/permissions'

interface Session {
  user: UserProfile
  tokens: AuthTokens
}

const SESSION_STORAGE_KEY = 'ebko-crm-session'

interface StoredSessionSnapshot {
  tokens: AuthTokens
  user?: UserProfile
}

function readStoredSession(): StoredSessionSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as {
      tokens?: Partial<AuthTokens>
      user?: Partial<UserProfile>
    }
    if (
      !parsed.tokens ||
      typeof parsed.tokens.accessToken !== 'string' ||
      typeof parsed.tokens.refreshToken !== 'string'
    ) {
      return null
    }

    return {
      tokens: {
        accessToken: parsed.tokens.accessToken,
        refreshToken: parsed.tokens.refreshToken,
      },
      user:
        parsed.user &&
        typeof parsed.user.id === 'string' &&
        typeof parsed.user.fullName === 'string' &&
        typeof parsed.user.role === 'string' &&
        typeof parsed.user.position === 'string' &&
        typeof parsed.user.phoneNumber === 'string' &&
        typeof parsed.user.email === 'string' &&
        typeof parsed.user.image === 'string' &&
        typeof parsed.user.login === 'string'
          ? {
              id: parsed.user.id,
              fullName: parsed.user.fullName,
              role: parsed.user.role as UserProfile['role'],
              position: parsed.user.position,
              phoneNumber: parsed.user.phoneNumber,
              email: parsed.user.email,
              image: parsed.user.image,
              login: parsed.user.login,
              clientId: typeof parsed.user.clientId === 'string' ? parsed.user.clientId : undefined,
              representativeId:
                typeof parsed.user.representativeId === 'string'
                  ? parsed.user.representativeId
                  : undefined,
            }
          : undefined,
    }
  } catch {
    return null
  }
}

function persistStoredSession(session: Session): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function clearStoredTokens(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

function resolveCurrentUser(user: UserProfile, data: CrmBootstrapData): UserProfile {
  return (
    data.users.find((item) => item.id === user.id || item.login === user.login) ??
    data.users.find((item) => item.id === user.id) ??
    user
  )
}

function withCurrentUser(data: CrmBootstrapData, user: UserProfile): CrmBootstrapData {
  const users = data.users.filter((item) => item.id !== user.id && item.login !== user.login)

  return {
    ...data,
    users: [user, ...users],
  }
}

async function hydrateSession(
  tokens: AuthTokens,
  fallbackUser?: UserProfile,
): Promise<{ session: Session; data: CrmBootstrapData; dashboards: TaskDashboard[] }> {
  const [bootstrap, currentUserFromAPI, dashboards] = await Promise.all([
    loadCrmBootstrap(tokens),
    loadCurrentProfile(tokens),
    loadTaskDashboards(tokens),
  ])

  const currentUser =
    currentUserFromAPI ?? (fallbackUser ? resolveCurrentUser(fallbackUser, bootstrap) : null)

  if (!currentUser) {
    throw new Error('Не удалось загрузить текущий профиль.')
  }

  return {
    session: { user: currentUser, tokens },
    data: withCurrentUser(bootstrap, currentUser),
    dashboards,
  }
}

function mergeAppeals(currentAppeals: Appeal[], nextAppeals: Appeal[]): Appeal[] {
  const appealMap = new Map(currentAppeals.map((appeal) => [appeal.id, appeal]))
  for (const appeal of nextAppeals) {
    appealMap.set(appeal.id, appeal)
  }

  return Array.from(appealMap.values()).sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

function representativeRecordKey(customerId: string, representativeId: string): string {
  return `${customerId}:${representativeId}`
}

function isAuthenticationError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('invalid or expired access token') ||
    message.includes('missing or invalid authorization header') ||
    message.includes('invalid or expired refresh token')
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [data, setData] = useState<CrmBootstrapData | null>(null)
  const [taskDashboards, setTaskDashboards] = useState<TaskDashboard[]>([])
  const [activeModule, setActiveModule] = useState<ModuleKey>('appeals')
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedRepresentativeKey, setSelectedRepresentativeKey] = useState<string | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [isSessionRestoring, setIsSessionRestoring] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const sessionRef = useRef<Session | null>(null)

  const isSignedIn = Boolean(session && data)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    let cancelled = false

    async function restoreSession(): Promise<void> {
      const storedSession = readStoredSession()
      if (!storedSession) {
        setIsSessionRestoring(false)
        return
      }

      setIsDataLoading(true)

      try {
        let activeTokens = storedSession.tokens
        let hydrated: { session: Session; data: CrmBootstrapData; dashboards: TaskDashboard[] }

        try {
          hydrated = await hydrateSession(activeTokens, storedSession.user)
        } catch {
          activeTokens = await refreshToken({ refreshToken: storedSession.tokens.refreshToken })
          hydrated = await hydrateSession(activeTokens, storedSession.user)
        }

        if (cancelled) {
          return
        }

        persistStoredSession(hydrated.session)
        sessionRef.current = hydrated.session
        setSession(hydrated.session)
        setData(hydrated.data)
        setTaskDashboards(hydrated.dashboards)
      } catch (error) {
        console.error('Session restore failed', error)
        clearStoredTokens()
        sessionRef.current = null
        if (!cancelled) {
          setSession(null)
          setData(null)
          setTaskDashboards([])
        }
      } finally {
        if (!cancelled) {
          setIsDataLoading(false)
          setIsSessionRestoring(false)
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(payload: LoginPayload): Promise<void> {
    setIsAuthLoading(true)
    setErrorMessage(null)

    try {
      const loginResult = await login(payload)
      setIsDataLoading(true)
      const hydrated = await hydrateSession(loginResult.tokens, loginResult.user)

      persistStoredSession(hydrated.session)
      sessionRef.current = hydrated.session
      setSession(hydrated.session)
      setData(hydrated.data)
      setTaskDashboards(hydrated.dashboards)
      setActiveModule('appeals')
      setSelectedAppealId(null)
      setSelectedSiteId(null)
      setSelectedCustomerId(null)
      setSelectedEmployeeId(null)
      setSelectedRepresentativeKey(null)
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      } else if (error instanceof Error) {
        console.error('Login bootstrap failed', error)
        setErrorMessage(error.message || 'Не удалось выполнить вход. Повторите попытку.')
      } else {
        setErrorMessage('Не удалось выполнить вход. Повторите попытку.')
      }
    } finally {
      setIsAuthLoading(false)
      setIsDataLoading(false)
    }
  }

  async function handleLogout(): Promise<void> {
    if (session) {
      try {
        await logout(session.tokens)
      } catch {
        // Игнорируем ошибки logout, чтобы не блокировать выход.
      }
    }

    clearStoredTokens()
    sessionRef.current = null
    setSession(null)
    setData(null)
    setTaskDashboards([])
    setSelectedAppealId(null)
    setSelectedSiteId(null)
    setSelectedCustomerId(null)
    setSelectedEmployeeId(null)
    setSelectedRepresentativeKey(null)
    setErrorMessage(null)
  }

  if (isSessionRestoring) {
    return (
      <div className="login-layout">
        <div className="login-card">
          <div className="login-header">
            <span className="brand-caption">EBKO CRM</span>
            <h1>Восстановление сессии</h1>
            <p>Проверяем сохранённый вход и загружаем данные.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isSignedIn || !session || !data) {
    return <LoginScreen onLogin={handleLogin} isLoading={isAuthLoading} errorMessage={errorMessage} />
  }

  const { user, tokens } = session
  const currentData: CrmBootstrapData = data

  async function refreshActiveTokens(): Promise<AuthTokens> {
    const activeSession = sessionRef.current ?? session
    const refreshedTokens = await refreshToken({
      refreshToken: activeSession?.tokens.refreshToken ?? tokens.refreshToken,
    })
    const refreshedUser = (await loadCurrentProfile(refreshedTokens)) ?? activeSession?.user ?? user
    const nextSession = {
      user: refreshedUser,
      tokens: refreshedTokens,
    }

    persistStoredSession(nextSession)
    sessionRef.current = nextSession
    setSession(nextSession)

    return refreshedTokens
  }

  async function withFreshTokens<T>(
    operation: (activeTokens: AuthTokens) => Promise<T>,
  ): Promise<T> {
    const activeTokens = sessionRef.current?.tokens ?? tokens

    try {
      return await operation(activeTokens)
    } catch (error) {
      if (!isAuthenticationError(error)) {
        throw error
      }

      try {
        const refreshedTokens = await refreshActiveTokens()
        return await operation(refreshedTokens)
      } catch {
        clearStoredTokens()
        sessionRef.current = null
        setSession(null)
        setData(null)
        throw new Error('Сессия истекла. Войдите в систему заново.')
      }
    }
  }

  async function refreshData(): Promise<void> {
    const hydrated = await withFreshTokens((activeTokens) => hydrateSession(activeTokens, user))
    persistStoredSession(hydrated.session)
    sessionRef.current = hydrated.session
    setSession(hydrated.session)
    setData(hydrated.data)
    setTaskDashboards(hydrated.dashboards)
  }

  async function saveTaskBoardDashboards(nextDashboards: TaskDashboard[]): Promise<void> {
    setTaskDashboards(nextDashboards)
    const savedDashboards = await withFreshTokens((activeTokens) =>
      syncTaskDashboards(activeTokens, nextDashboards),
    )
    setTaskDashboards(savedDashboards)
  }

  function replaceAppeals(nextAppeals: Appeal[]): void {
    setData((previous) =>
      previous
        ? {
            ...previous,
            appeals: mergeAppeals(previous.appeals, nextAppeals),
          }
        : previous,
    )
  }

  async function reloadAppealsByID(...appealIDs: string[]): Promise<void> {
    const uniqueIDs = Array.from(new Set(appealIDs.filter((appealID) => appealID)))
    if (uniqueIDs.length === 0) {
      return
    }

    const nextAppeals = await withFreshTokens((activeTokens) =>
      Promise.all(uniqueIDs.map((appealID) => loadAppealById(activeTokens, currentData, appealID))),
    )
    replaceAppeals(nextAppeals)
  }

  async function createAppeal(draft: Omit<Appeal, 'id'>): Promise<void> {
    const createdAppeal = await withFreshTokens((activeTokens) =>
      syncAppealCreate(activeTokens, currentData, draft),
    )
    replaceAppeals([createdAppeal])
    setSelectedAppealId(createdAppeal.id)
  }

  async function updateAppeal(appealId: string, patch: Partial<Appeal>): Promise<void> {
    const currentAppeal =
      currentData.appeals.find((appeal) => appeal.id === appealId) ?? null
    const updatedAppeal = await withFreshTokens((activeTokens) =>
      syncAppealPatch(activeTokens, currentData, appealId, patch),
    )
    replaceAppeals([
      {
        ...updatedAppeal,
        comments: currentAppeal?.comments ?? updatedAppeal.comments,
        linkedTicketIds: currentAppeal?.linkedTicketIds ?? updatedAppeal.linkedTicketIds,
        links: currentAppeal?.links ?? updatedAppeal.links,
      },
    ])
  }

  async function addComment(
    appealId: string,
    contents: string,
    isClosedComment: boolean,
    files: FileAttachment[],
  ): Promise<void> {
    await withFreshTokens((activeTokens) =>
      syncAppealComment(
        activeTokens,
        appealId,
        contents,
        isClosedComment,
        files.map((file) => ({ name: file.name, size: file.size })),
      ),
    )
    await reloadAppealsByID(appealId)
  }

  async function linkAppeal(
    appealId: string,
    linkedAppealId: string,
    relationType: AppealLinkType,
  ): Promise<void> {
    await withFreshTokens((activeTokens) =>
      syncAppealLink(activeTokens, appealId, linkedAppealId, relationType),
    )
    await reloadAppealsByID(appealId, linkedAppealId)
  }

  async function unlinkAppeal(appealId: string, linkedAppealId: string): Promise<void> {
    await withFreshTokens((activeTokens) => syncAppealUnlink(activeTokens, appealId, linkedAppealId))
    await reloadAppealsByID(appealId, linkedAppealId)
  }

  async function upsertEmployee(employee: Employee): Promise<void> {
    const savedEmployee = await withFreshTokens((activeTokens) =>
      syncEmployeeUpsert(activeTokens, employee),
    )
    await refreshData()
    setSelectedEmployeeId(savedEmployee.accountId)
  }

  async function deleteEmployee(employeeId: string): Promise<void> {
    await withFreshTokens((activeTokens) => syncEmployeeDelete(activeTokens, employeeId))
    await refreshData()
  }

  async function upsertCustomer(customer: ClientCompany): Promise<void> {
    const savedCustomer = await withFreshTokens((activeTokens) =>
      syncClientUpsert(activeTokens, customer),
    )
    await refreshData()
    setSelectedCustomerId(savedCustomer.id)
  }

  async function deleteCustomer(
    customerId: string,
    mode: 'delete' | 'unassign' = 'delete',
  ): Promise<void> {
    await withFreshTokens((activeTokens) => syncClientDelete(activeTokens, customerId, mode))
    await refreshData()
  }

  async function upsertSite(site: Site): Promise<void> {
    const savedSite = await withFreshTokens((activeTokens) => syncSiteUpsert(activeTokens, site))
    await refreshData()
    setSelectedCustomerId(savedSite.clientId)
    setSelectedSiteId(savedSite.id)
  }

  async function deleteSite(siteId: string): Promise<void> {
    await withFreshTokens((activeTokens) => syncSiteDelete(activeTokens, siteId))
    await refreshData()
  }

  async function upsertRepresentative(
    customerId: string,
    representative: ClientRepresentative,
  ): Promise<void> {
    const savedRepresentative = await withFreshTokens((activeTokens) =>
      syncRepresentativeUpsert(activeTokens, customerId, representative),
    )
    await refreshData()
    setSelectedRepresentativeKey(representativeRecordKey(savedRepresentative.clientId, savedRepresentative.accountId))
  }

  async function deleteRepresentative(customerId: string, representativeId: string): Promise<void> {
    void customerId
    await withFreshTokens((activeTokens) => syncRepresentativeDelete(activeTokens, representativeId))
    await refreshData()
  }

  async function upsertEquipment(equipmentUnit: EquipmentUnit): Promise<void> {
    const savedEquipment = await withFreshTokens((activeTokens) =>
      syncEquipmentUpsert(activeTokens, equipmentUnit),
    )
    await refreshData()
    setSelectedSiteId(savedEquipment.siteId ?? selectedSiteId)
  }

  async function deleteEquipment(equipmentId: string): Promise<void> {
    await withFreshTokens((activeTokens) => syncEquipmentDelete(activeTokens, equipmentId))
    await refreshData()
  }

  async function attachEquipmentToSite(equipmentId: string, siteId: string): Promise<void> {
    await withFreshTokens((activeTokens) => syncEquipmentSite(activeTokens, equipmentId, siteId))
    await refreshData()
  }

  async function updateProfile(patch: Partial<UserProfile>): Promise<void> {
    setIsDataLoading(true)

    try {
      const updatedUser = await withFreshTokens((activeTokens) =>
        syncCurrentProfile(activeTokens, patch),
      )
      const bootstrap = await withFreshTokens((activeTokens) => loadCrmBootstrap(activeTokens))
      const hydratedBootstrap = withCurrentUser(bootstrap, updatedUser)

      const nextSession = {
        user: updatedUser,
        tokens: sessionRef.current?.tokens ?? tokens,
      }
      persistStoredSession(nextSession)
      sessionRef.current = nextSession
      setSession(nextSession)
      setData(hydratedBootstrap)
    } finally {
      setIsDataLoading(false)
    }
  }

  function openPerson(accountId: string): void {
    const targetEmployee = currentData.employees.find((employee) => employee.accountId === accountId)
    if (targetEmployee) {
      setSelectedEmployeeId(targetEmployee.accountId)
      setSelectedRepresentativeKey(null)
      setActiveModule('employees')
      return
    }

    const targetCustomer = currentData.clients.find((client) =>
      client.representatives.some((representative) => representative.accountId === accountId),
    )
    if (!targetCustomer) {
      return
    }

    setSelectedRepresentativeKey(representativeRecordKey(targetCustomer.id, accountId))
    setSelectedEmployeeId(null)
    setActiveModule('clients')
  }

  function handleSidebarModuleChange(module: ModuleKey): void {
    setActiveModule(module)

    if (module !== 'appeals' && module !== 'appeals_archive') {
      setSelectedAppealId(null)
    }

    if (module !== 'customers') {
      setSelectedSiteId(null)
      setSelectedCustomerId(null)
    }

    if (module !== 'employees') {
      setSelectedEmployeeId(null)
    }

    if (module !== 'clients') {
      setSelectedRepresentativeKey(null)
    }
  }

  function renderModule() {
    if (!canAccessModule(user.role, activeModule)) {
      return <p className="empty-state">Текущая роль не имеет доступа к выбранному модулю.</p>
    }

    switch (activeModule) {
      case 'appeals':
        return (
          <AppealsModule
            key="appeals"
            user={user}
            appeals={currentData.appeals}
            employees={currentData.employees}
            clients={currentData.clients}
            sites={currentData.sites}
            products={currentData.products}
            selectedAppealId={selectedAppealId}
            onSelectAppeal={setSelectedAppealId}
            onOpenAppeal={(appealId, archived) => {
              setSelectedAppealId(appealId)
              setActiveModule(archived ? 'appeals_archive' : 'appeals')
            }}
            onCreateAppeal={createAppeal}
            onUpdateAppeal={updateAppeal}
            onAddComment={addComment}
            onLinkAppeal={linkAppeal}
            onUnlinkAppeal={unlinkAppeal}
            onOpenPerson={openPerson}
            onOpenSite={(siteId) => {
              setSelectedSiteId(siteId)
              const site = currentData.sites.find((item) => item.id === siteId)
              setSelectedCustomerId(site?.clientId ?? null)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule('customers')
            }}
            onOpenCustomer={(customerId) => {
              setSelectedCustomerId(customerId)
              setSelectedSiteId(null)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule('customers')
            }}
          />
        )

      case 'appeals_archive':
        return (
          <AppealsModule
            key="appeals_archive"
            user={user}
            appeals={currentData.appeals}
            employees={currentData.employees}
            clients={currentData.clients}
            sites={currentData.sites}
            products={currentData.products}
            archiveMode
            selectedAppealId={selectedAppealId}
            onSelectAppeal={setSelectedAppealId}
            onOpenAppeal={(appealId, archived) => {
              setSelectedAppealId(appealId)
              setActiveModule(archived ? 'appeals_archive' : 'appeals')
            }}
            onCreateAppeal={createAppeal}
            onUpdateAppeal={updateAppeal}
            onAddComment={addComment}
            onLinkAppeal={linkAppeal}
            onUnlinkAppeal={unlinkAppeal}
            onOpenPerson={openPerson}
            onOpenSite={(siteId) => {
              setSelectedSiteId(siteId)
              const site = currentData.sites.find((item) => item.id === siteId)
              setSelectedCustomerId(site?.clientId ?? null)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule('customers')
            }}
            onOpenCustomer={(customerId) => {
              setSelectedCustomerId(customerId)
              setSelectedSiteId(null)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule('customers')
            }}
          />
        )

      case 'employees':
        return (
          <EmployeesModule
            user={user}
            employees={currentData.employees}
            selectedEmployeeId={selectedEmployeeId}
            onSelectEmployee={setSelectedEmployeeId}
            onUpsertEmployee={upsertEmployee}
            onDeleteEmployee={deleteEmployee}
          />
        )

      case 'clients':
        return (
          <ClientsModule
            user={user}
            clients={currentData.clients}
            selectedRecordKey={selectedRepresentativeKey}
            onSelectRecord={setSelectedRepresentativeKey}
            onUpsertRepresentative={upsertRepresentative}
            onDeleteRepresentative={deleteRepresentative}
          />
        )

      case 'customers':
        return (
          <CustomersModule
            user={user}
            customers={currentData.clients}
            sites={currentData.sites}
            equipment={currentData.equipment}
            equipmentTypes={currentData.equipmentTypes}
            products={currentData.products}
            selectedSiteId={selectedSiteId}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={setSelectedCustomerId}
            onSelectSite={setSelectedSiteId}
            onUpsertCustomer={upsertCustomer}
            onDeleteCustomer={deleteCustomer}
            onUpsertSite={upsertSite}
            onDeleteSite={deleteSite}
            onAttachEquipmentToSite={attachEquipmentToSite}
          />
        )

      case 'equipment':
        return (
          <EquipmentModule
            user={user}
            equipment={currentData.equipment}
            sites={currentData.sites}
            clients={currentData.clients}
            equipmentTypes={currentData.equipmentTypes}
            products={currentData.products}
            onUpsertEquipment={upsertEquipment}
            onDeleteEquipment={deleteEquipment}
          />
        )

      case 'task_board':
        return (
          <TaskBoardModule
            key={user.id}
            user={user}
            appeals={currentData.appeals}
            employees={currentData.employees}
            clients={currentData.clients}
            sites={currentData.sites}
            products={currentData.products}
            dashboards={taskDashboards}
            onSaveDashboards={saveTaskBoardDashboards}
            onOpenAppeal={(appealId, archived) => {
              setSelectedAppealId(appealId)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule(archived ? 'appeals_archive' : 'appeals')
            }}
          />
        )

      case 'profile':
        return <ProfileModule user={user} onUpdateProfile={updateProfile} />

      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activeModule={activeModule}
        onModuleChange={handleSidebarModuleChange}
        onLogout={handleLogout}
      />

      <main className="workspace">
        {isDataLoading ? <p className="empty-state">Загрузка данных...</p> : renderModule()}
      </main>
    </div>
  )
}

export default App
