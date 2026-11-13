import { ArrowLeft, MessageSquareText } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { Button } from '../ui/Button'

const dashboardRoutes = {
  student: '/student/dashboard',
  employer: '/employer/dashboard',
  admin: '/admin/dashboard',
}

export function AppShell({ title, subtitle, showBackButton = false, children }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()
  const dashboardPath = dashboardRoutes[profile?.role || user?.role || user?.user_metadata?.role] || '/student/dashboard'
  const isStudent = (profile?.role || user?.role || user?.user_metadata?.role) === 'student'

  const handleBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1)
      return
    }

    navigate(dashboardPath, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen min-w-0">
        <AppSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AppHeader title={title} subtitle={subtitle} />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
            {showBackButton ? (
              <Button type="button" variant="outline" size="sm" className="mb-5" onClick={handleBack}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </Button>
            ) : null}
            {children}
          </main>
        </div>
      </div>
      {isStudent ? (
        <div className="fixed bottom-20 right-4 z-40 sm:right-6">
          <Link to="/student/career-assistant" className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-700/30 transition hover:bg-sky-800">
            <MessageSquareText size={18} aria-hidden="true" />
            Career AI
          </Link>
        </div>
      ) : null}
      <MobileBottomNav />
    </div>
  )
}
