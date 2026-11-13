import { AppShell } from '../../components/layout/AppShell'
import { StudentDashboard } from '../../components/dashboard/StudentDashboard'

export default function StudentDashboardPage() {
  return (
    <AppShell title="Dashboard" subtitle="Your career, skills, and progress at a glance." showBackButton>
      <StudentDashboard />
    </AppShell>
  )
}
