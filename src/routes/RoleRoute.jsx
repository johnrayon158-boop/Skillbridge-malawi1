import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RoleRoute({ allowedRoles = [], children, fallbackPath = '/' }) {
  const { profile, profileLoading, user } = useAuth()
  const role = profile?.role || user?.role || null

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p className="text-sm font-medium text-slate-600">Loading your career workspace...</p>
      </div>
    )
  }

  if (!role) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(role)) {
    const dashboardMap = {
      student: '/student/dashboard',
      employer: '/employer/dashboard',
      admin: '/admin/dashboard',
    }

    return <Navigate to={dashboardMap[role] || fallbackPath} replace />
  }

  return children
}
