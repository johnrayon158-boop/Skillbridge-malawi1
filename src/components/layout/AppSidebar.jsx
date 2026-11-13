import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui/Avatar'
import { ROLE_NAVIGATION } from './roleNavigation'

export function AppSidebar() {
  const { profile, user } = useAuth()
  const navItems = ROLE_NAVIGATION[profile?.role] || []
  const navSections = navItems.reduce((sections, item) => {
    const section = item.section || 'Workspace'
    sections[section] = [...(sections[section] || []), item]
    return sections
  }, {})

  if (!user) {
    return null
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-slate-50 lg:flex lg:flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-800 text-lg font-bold text-white">
          S
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">SkillBridge</p>
          <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Malawi</p>
        </div>
      </div>

      <nav aria-label="Workspace navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4">
        {Object.entries(navSections).map(([section, items]) => (
          <section key={section} aria-label={section}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase text-slate-500">{section}</p>
            <div className="space-y-1">
              {items.map(({ label, to, icon: Icon }) => (
                <NavLink
                  key={label}
                  to={to}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-sky-800 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-sky-50 p-3">
          <Avatar src={profile?.avatar_url} name={profile?.full_name || 'User'} size="md" className="border border-sky-100" />
          <div>
            <p className="text-sm font-semibold text-slate-900">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-slate-500">{profile?.role || 'Authenticated'} access</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
