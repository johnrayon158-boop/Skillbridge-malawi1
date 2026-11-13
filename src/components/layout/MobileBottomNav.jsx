import { useEffect, useState } from 'react'
import { ChevronUp, MoreHorizontal } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ROLE_NAVIGATION } from './roleNavigation'

const PRIMARY_DESTINATIONS = {
  student: ['/student/dashboard', '/student/career', '/student/jobs', '/student/applications'],
  graduate: ['/student/jobs', '/student/interviews', '/student/notifications'],
  employer: ['/employer/dashboard', '/employer/jobs', '/employer/applications', '/employer/candidates'],
  admin: ['/admin/dashboard', '/admin/users', '/admin/jobs', '/admin/analytics'],
}

export function MobileBottomNav() {
  const { profile, user } = useAuth()
  const location = useLocation()
  const [menuPath, setMenuPath] = useState(null)
  const menuOpen = menuPath === location.pathname
  const role = profile?.role
  const allItems = ROLE_NAVIGATION[role] || []
  const primaryRoutes = PRIMARY_DESTINATIONS[role] || []
  const primaryItems = primaryRoutes.map((route) => allItems.find((item) => item.to === route)).filter(Boolean)
  const moreItems = allItems.filter((item) => !primaryRoutes.includes(item.to))
  const moreSections = moreItems.reduce((sections, item) => {
    const section = item.section || 'Workspace'
    sections[section] = [...(sections[section] || []), item]
    return sections
  }, {})

  useEffect(() => {
    if (!menuOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuPath(null)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  if (!user || !primaryItems.length) return null

  return (
    <>
      {menuOpen ? (
        <>
          <button type="button" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" aria-label="Close navigation menu" onClick={() => setMenuPath(null)} />
          <div id="mobile-role-menu" className="fixed inset-x-0 bottom-[4.5rem] z-40 max-h-[65vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-3 shadow-xl lg:hidden">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-sm font-semibold text-slate-900">{role === 'admin' ? 'Administration' : role === 'employer' ? 'Employer workspace' : 'Student workspace'}</p>
              <button type="button" onClick={() => setMenuPath(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Close navigation menu">
                <ChevronUp size={18} />
              </button>
            </div>
            <nav aria-label="More navigation" className="space-y-4">
              {Object.entries(moreSections).map(([section, items]) => (
                <section key={section} aria-label={section}>
                  <p className="mb-1 px-2 text-[11px] font-semibold uppercase text-slate-500">{section}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {items.map(({ label, to, icon: Icon }) => (
                      <NavLink key={`${label}:${to}`} to={to} onClick={() => setMenuPath(null)} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                        <Icon size={17} aria-hidden="true" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
          </div>
        </>
      ) : null}

      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {primaryItems.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to.endsWith('/dashboard')} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium ${isActive ? 'bg-sky-50 text-sky-800' : 'text-slate-600'}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <button type="button" aria-expanded={menuOpen} aria-controls="mobile-role-menu" onClick={() => setMenuPath((current) => current === location.pathname ? null : location.pathname)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium ${menuOpen ? 'bg-sky-50 text-sky-800' : 'text-slate-600'}`}>
            <MoreHorizontal size={18} aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
