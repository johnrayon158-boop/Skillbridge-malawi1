import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'

export function ProfileDropdown({ profile, onLogout }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const roleLabel = {
    student: 'Student/Graduate',
    employer: 'Employer',
    admin: 'Administrator',
  }[profile?.role] || 'User'

  const profileRoute = profile?.role === 'student' ? '/student/profile' : profile?.role === 'employer' ? '/employer/company' : '/admin/users'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="profile-dropdown-menu"
        aria-label={`Account menu${profile?.full_name ? ` for ${profile.full_name}` : ''}`}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left"
      >
        <Avatar src={profile?.avatar_url} name={profile?.full_name || 'User'} size="sm" className="border border-slate-200" />
        <div className="hidden text-left sm:block">
          <p className="text-sm font-semibold text-slate-800">{profile?.full_name || 'User'}</p>
          <p className="text-[11px] text-slate-500">{roleLabel}</p>
        </div>
        <ChevronDown size={16} className="text-slate-500" />
      </button>

      {open ? (
        <div id="profile-dropdown-menu" className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="border-b border-slate-200 pb-3">
            <p className="font-semibold text-slate-900">{profile?.full_name || 'User'}</p>
            <p className="text-sm text-slate-500">{profile?.email || 'No email provided'}</p>
            <p className="mt-2 inline-flex rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">{roleLabel}</p>
          </div>

          <div className="mt-3 space-y-1">
            <Link to={profileRoute} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <UserRound size={16} /> My Profile
            </Link>
            <Link to={profile?.role === 'student' ? '/student/settings' : profile?.role === 'employer' ? '/employer/settings' : '/admin/settings'} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <Settings size={16} /> Settings
            </Link>
            <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
