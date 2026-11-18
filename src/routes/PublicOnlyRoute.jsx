import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const dashboardRoutes = {
  student: '/student/dashboard',
  employer: '/employer/dashboard',
  admin: '/admin/dashboard',
}

export default function PublicOnlyRoute() {
  const { user, profile, profileLoading, loading, passwordRecovery } = useAuth()

  if (loading || (user && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p className="text-sm font-medium text-slate-600">Loading your career workspace...</p>
      </div>
    )
  }

  // A recovery session is a normal authenticated session, but it must not be
  // bounced to the dashboard before the user chooses a new password.
  if (passwordRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p className="text-sm font-medium text-slate-600">Preparing your password reset...</p>
      </div>
    )
  }

  if (!user) {
    return <Outlet />
  }

  const role = profile?.role || user.role || user.user_metadata?.role || 'student'
  return <Navigate to={dashboardRoutes[role] || dashboardRoutes.student} replace />
}
