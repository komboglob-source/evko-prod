import { useState } from 'react'
import './App.css'
import { ApiError, login, logout } from './api/auth'
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
  AppealStatus,
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
  UserProfile,
} from './types'
import { canAccessModule } from './utils/permissions'

interface Session {
  user: UserProfile
  tokens: AuthTokens
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

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [data, setData] = useState<CrmBootstrapData | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleKey>('appeals')
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedRepresentativeKey, setSelectedRepresentativeKey] = useState<string | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isSignedIn = Boolean(session && data)

  async function handleLogin(payload: LoginPayload): Promise<void> {
    setIsAuthLoading(true)
    setErrorMessage(null)

    try {
      const loginResult = await login(payload)
      setIsDataLoading(true)
      const bootstrap = await loadCrmBootstrap(loginResult.tokens)
      const currentUser = resolveCurrentUser(loginResult.user, bootstrap)
      const hydratedBootstrap = withCurrentUser(bootstrap, currentUser)

      setSession({ user: currentUser, tokens: loginResult.tokens })
      setData(hydratedBootstrap)
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

    setSession(null)
    setData(null)
    setSelectedAppealId(null)
    setSelectedSiteId(null)
    setSelectedCustomerId(null)
    setSelectedEmployeeId(null)
    setSelectedRepresentativeKey(null)
    setErrorMessage(null)
  }

  if (!isSignedIn || !session || !data) {
    return <LoginScreen onLogin={handleLogin} isLoading={isAuthLoading} errorMessage={errorMessage} />
  }

  const { user, tokens } = session
  const currentData: CrmBootstrapData = data

  async function refreshData(): Promise<void> {
    const bootstrap = await loadCrmBootstrap(tokens)
    const currentUser = resolveCurrentUser(user, bootstrap)
    const hydratedBootstrap = withCurrentUser(bootstrap, currentUser)

    setSession((previous) => (previous ? { ...previous, user: currentUser } : previous))
    setData(hydratedBootstrap)
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

    const nextAppeals = await Promise.all(
      uniqueIDs.map((appealID) => loadAppealById(tokens, currentData, appealID)),
    )
    replaceAppeals(nextAppeals)
  }

  async function createAppeal(draft: Omit<Appeal, 'id'>): Promise<void> {
    const createdAppeal = await syncAppealCreate(tokens, currentData, draft)
    replaceAppeals([createdAppeal])
    setSelectedAppealId(createdAppeal.id)
  }

  async function updateAppeal(appealId: string, patch: Partial<Appeal>): Promise<void> {
    const updatedAppeal = await syncAppealPatch(tokens, currentData, appealId, patch)
    replaceAppeals([updatedAppeal])
  }

  async function addComment(appealId: string, contents: string, files: FileAttachment[]): Promise<void> {
    await syncAppealComment(
      tokens,
      appealId,
      contents,
      files.map((file) => ({ name: file.name, size: file.size })),
    )
    await reloadAppealsByID(appealId)
  }

  async function linkAppeal(
    appealId: string,
    linkedAppealId: string,
    relationType: AppealLinkType,
  ): Promise<void> {
    await syncAppealLink(tokens, appealId, linkedAppealId, relationType)
    await reloadAppealsByID(appealId, linkedAppealId)
  }

  async function unlinkAppeal(appealId: string, linkedAppealId: string): Promise<void> {
    await syncAppealUnlink(tokens, appealId, linkedAppealId)
    await reloadAppealsByID(appealId, linkedAppealId)
  }

  async function upsertEmployee(employee: Employee): Promise<void> {
    const savedEmployee = await syncEmployeeUpsert(tokens, employee)
    await refreshData()
    setSelectedEmployeeId(savedEmployee.accountId)
  }

  async function deleteEmployee(employeeId: string): Promise<void> {
    await syncEmployeeDelete(tokens, employeeId)
    await refreshData()
  }

  async function upsertCustomer(customer: ClientCompany): Promise<void> {
    const savedCustomer = await syncClientUpsert(tokens, customer)
    await refreshData()
    setSelectedCustomerId(savedCustomer.id)
  }

  async function deleteCustomer(customerId: string): Promise<void> {
    await syncClientDelete(tokens, customerId)
    await refreshData()
  }

  async function upsertSite(site: Site): Promise<void> {
    const savedSite = await syncSiteUpsert(tokens, site)
    await refreshData()
    setSelectedCustomerId(savedSite.clientId)
    setSelectedSiteId(savedSite.id)
  }

  async function deleteSite(siteId: string): Promise<void> {
    await syncSiteDelete(tokens, siteId)
    await refreshData()
  }

  async function upsertRepresentative(
    customerId: string,
    representative: ClientRepresentative,
  ): Promise<void> {
    const savedRepresentative = await syncRepresentativeUpsert(tokens, customerId, representative)
    await refreshData()
    setSelectedRepresentativeKey(representativeRecordKey(savedRepresentative.clientId, savedRepresentative.accountId))
  }

  async function deleteRepresentative(customerId: string, representativeId: string): Promise<void> {
    void customerId
    await syncRepresentativeDelete(tokens, representativeId)
    await refreshData()
  }

  async function upsertEquipment(equipmentUnit: EquipmentUnit): Promise<void> {
    const savedEquipment = await syncEquipmentUpsert(tokens, equipmentUnit)
    await refreshData()
    setSelectedSiteId(savedEquipment.siteId ?? selectedSiteId)
  }

  async function deleteEquipment(equipmentId: string): Promise<void> {
    await syncEquipmentDelete(tokens, equipmentId)
    await refreshData()
  }

  async function attachEquipmentToSite(equipmentId: string, siteId: string): Promise<void> {
    await syncEquipmentSite(tokens, equipmentId, siteId)
    await refreshData()
  }

  async function updateProfile(patch: Partial<UserProfile>): Promise<void> {
    const updatedUser = { ...user, ...patch }

    setSession((previous) => (previous ? { ...previous, user: updatedUser } : previous))
    setData((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        users: previous.users.some((item) => item.id === user.id)
          ? previous.users.map((item) => (item.id === user.id ? updatedUser : item))
          : [updatedUser, ...previous.users],
        employees: previous.employees.map((employee) =>
          employee.accountId === user.id
            ? {
                ...employee,
                image: patch.image ?? employee.image,
                position: patch.position ?? employee.position,
                phoneNumber: patch.phoneNumber ?? employee.phoneNumber,
                email: patch.email ?? employee.email,
              }
            : employee,
        ),
        clients: previous.clients.map((client) => ({
          ...client,
          representatives: client.representatives.map((representative) =>
            representative.accountId === user.representativeId
              ? {
                  ...representative,
                  image: patch.image ?? representative.image,
                  position: patch.position ?? representative.position,
                  phoneNumber: patch.phoneNumber ?? representative.phoneNumber,
                  email: patch.email ?? representative.email,
                }
              : representative,
          ),
        })),
      }
    })
  }

  async function moveAppeal(appealId: string, nextStatus: AppealStatus): Promise<void> {
    await updateAppeal(appealId, {
      statusId: nextStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    })
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

    if (module !== 'appeals') {
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
            user={user}
            appeals={currentData.appeals}
            employees={currentData.employees}
            clients={currentData.clients}
            sites={currentData.sites}
            products={currentData.products}
            selectedAppealId={selectedAppealId}
            onSelectAppeal={setSelectedAppealId}
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
            onMoveAppeal={moveAppeal}
            onOpenAppeal={(appealId) => {
              setSelectedAppealId(appealId)
              setSelectedEmployeeId(null)
              setSelectedRepresentativeKey(null)
              setActiveModule('appeals')
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
