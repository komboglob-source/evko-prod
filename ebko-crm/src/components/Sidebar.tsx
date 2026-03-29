import { MODULES, ROLE_LABELS } from '../constants'
import type { ModuleKey, UserProfile } from '../types'
import { canAccessModule } from '../utils/permissions'

interface SidebarProps {
  user: UserProfile
  activeModule: ModuleKey
  onModuleChange: (module: ModuleKey) => void
  onLogout: () => Promise<void>
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function Sidebar({ user, activeModule, onModuleChange, onLogout }: SidebarProps) {
  const availableModules = MODULES.filter((module) => canAccessModule(user.role, module.key))

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand">
          <p className="sidebar-brand-caption">CRM Platform</p>
          <h2>EBKO CRM</h2>
        </div>

        <nav className="sidebar-nav" aria-label="Главная навигация">
          {availableModules.map((module) => {
            const active = module.key === activeModule

            return (
              <button
                key={module.key}
                type="button"
                onClick={() => onModuleChange(module.key)}
                className={`nav-item ${active ? 'is-active' : ''}`}
              >
                <span>{module.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="profile-badge">
          {user.image ? (
            <img className="avatar-photo avatar-photo-sm" src={user.image} alt={user.fullName} />
          ) : (
            <div className="profile-avatar">{initials(user.fullName)}</div>
          )}
          <div>
            <p className="profile-name">{user.fullName}</p>
            <p className="profile-role">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <button type="button" className="logout-button" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </aside>
  )
}

