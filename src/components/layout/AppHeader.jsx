import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ProfileDropdown } from '../ui/ProfileDropdown'
import { Button } from '../ui/Button'
import { NotificationBell } from './NotificationBell'

export function AppHeader({ title, subtitle }) {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div>
            <p className="hidden text-xs font-semibold uppercase text-sky-800 sm:block">SkillBridge Malawi</p>
            <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{title}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!user ? (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">Login</Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">Sign Up</Button>
              </Link>
            </>
          ) : (
            <>
              <NotificationBell user={user} role={profile?.role} />
              <ProfileDropdown profile={profile || { full_name: 'User', role: 'student', email: user?.email }} onLogout={handleLogout} />
            </>
          )}
        </div>
      </div>
      {subtitle ? <div className="border-t border-slate-200 px-4 py-2 text-sm text-slate-500 sm:px-6 lg:px-8">{subtitle}</div> : null}
    </header>
  )
}
