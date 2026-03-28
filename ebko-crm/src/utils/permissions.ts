import type {
  Appeal,
  AppealStatus,
  ClientCompany,
  ModuleKey,
  Site,
  UserProfile,
} from '../types'

export function canAccessModule(role: UserProfile['role'], module: ModuleKey): boolean {
  switch (module) {
    case 'employees':
    case 'equipment':
      return role !== 'client'
    default:
      return true
  }
}

export function canViewAppeal(user: UserProfile, appeal: Appeal): boolean {
  if (user.role !== 'client') {
    return true
  }

  return Boolean(user.clientId && appeal.clientId === user.clientId)
}

export function canEditAppeal(user: UserProfile, appeal: Appeal): boolean {
  if (user.role === 'admin') {
    return true
  }

  if (user.role === 'ktp') {
    return true
  }

  if (user.role === 'wfm') {
    return appeal.typeId === 'WFM'
  }

  return Boolean(user.clientId && appeal.clientId === user.clientId)
}

export function canCreateAppealType(user: UserProfile, type: Appeal['typeId']): boolean {
  if (user.role === 'admin' || user.role === 'ktp') {
    return true
  }

  if (user.role === 'wfm') {
    return type === 'WFM'
  }

  if (user.role === 'client') {
    return true
  }

  return false
}

export function canChangeStatus(
  user: UserProfile,
  appeal: Appeal,
  nextStatus: AppealStatus,
): boolean {
  if (!canEditAppeal(user, appeal)) {
    return false
  }

  if (user.role === 'admin') {
    return true
  }

  if (user.role === 'ktp') {
    if (nextStatus === 'Created' || nextStatus === 'Verified') {
      return false
    }

    return true
  }

  if (user.role === 'wfm') {
    if (nextStatus === 'Created' || nextStatus === 'Verified') {
      return false
    }

    return appeal.typeId === 'WFM'
  }

  if (user.role === 'client') {
    return appeal.statusId === 'Done' && nextStatus === 'Verified'
  }

  return false
}

export function canAssignResponsible(user: UserProfile, appeal: Appeal): boolean {
  if (!appeal) {
    return false
  }

  if (user.role === 'admin') {
    return true
  }

  if (user.role === 'ktp' || user.role === 'wfm') {
    return true
  }

  return false
}

export function canLinkAppeals(user: UserProfile): boolean {
  return user.role === 'admin' || user.role === 'ktp' || user.role === 'wfm'
}

export function canViewEmployeeCredentials(user: UserProfile): boolean {
  return user.role === 'admin'
}

export function canManageEmployees(user: UserProfile): boolean {
  return user.role === 'admin' || user.role === 'ebko'
}

export function canViewCustomer(user: UserProfile, customer: ClientCompany): boolean {
  if (user.role !== 'client') {
    return true
  }

  return user.clientId === customer.id
}

export function canManageCustomers(user: UserProfile): boolean {
  return user.role === 'admin'
}

export function canViewCustomerSite(user: UserProfile, site: Site): boolean {
  if (user.role !== 'client') {
    return true
  }

  return user.clientId === site.clientId
}

export function canManageCustomerSites(user: UserProfile): boolean {
  return user.role === 'admin'
}

export function canViewRepresentative(user: UserProfile, clientId: string): boolean {
  if (user.role !== 'client') {
    return true
  }

  return user.clientId === clientId
}

export function canManageRepresentatives(user: UserProfile): boolean {
  return user.role === 'admin'
}

export function canViewEquipment(user: UserProfile): boolean {
  return user.role !== 'client'
}

export function canManageEquipment(user: UserProfile): boolean {
  return user.role === 'admin' || user.role === 'wfm'
}

export function canEditEquipment(user: UserProfile): boolean {
  return canManageEquipment(user)
}

// Legacy compatibility helpers for modules still using old naming.
export function canViewClient(user: UserProfile, client: ClientCompany): boolean {
  return canViewCustomer(user, client)
}

export function canManageClients(user: UserProfile): boolean {
  return canManageCustomers(user)
}

export function canViewSite(user: UserProfile, site: Site): boolean {
  return canViewCustomerSite(user, site)
}

export function canManageSites(user: UserProfile): boolean {
  return canManageCustomerSites(user)
}

export function isOwnAppeal(user: UserProfile, appeal: Appeal): boolean {
  if (user.role === 'client') {
    return Boolean(user.clientId && appeal.clientId === user.clientId)
  }

  return appeal.responsibleId === user.id
}
