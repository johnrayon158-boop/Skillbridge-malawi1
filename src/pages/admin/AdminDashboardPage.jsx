import { Activity, BarChart3, BookOpen, BriefcaseBusiness, Building2, FileText, GraduationCap, ListChecks, RefreshCw, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { adminService } from '../../services/adminService'
import { ADMIN_DASHBOARD_DATE_RANGES } from '../../utils/adminDashboardMetrics.js'

const DASHBOARD_CARDS = [
  { label: 'Users', metric: 'users', description: 'Registered platform accounts', icon: Users, to: '/admin/users' },
  { label: 'Students & graduates', metric: 'studentProfiles', description: 'Student profile records', icon: GraduationCap, to: '/admin/users' },
  { label: 'Employers', metric: 'employers', description: 'Employer profiles; tagged demo profile excluded', icon: Building2, to: '/admin/employers' },
  { label: 'Published jobs', metric: 'jobs', description: 'Published, non-demo listings', icon: BriefcaseBusiness, to: '/admin/jobs' },
  { label: 'Applications', metric: 'applications', description: 'Submitted application records', icon: FileText, to: '/admin/applications' },
  { label: 'Assessments', metric: 'assessments', description: 'All assessment statuses', icon: ListChecks, to: '/admin/assessments' },
  { label: 'Employment records', metric: 'employment', description: 'Tracked records; not unique candidates', icon: Activity, to: '/admin/employers' },
  { label: 'Published resources', metric: 'resources', description: 'Published, non-demo resources', icon: BookOpen, to: '/admin/learning' },
]

export default function AdminDashboardPage() {
  const [data, setData] = useState(null)
  const [dateRange, setDateRange] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getDashboard(dateRange)
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load dashboard statistics.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [dateRange, refreshKey])

  const refresh = () => {
    setLoading(true)
    setRefreshKey((key) => key + 1)
  }
  const metrics = data?.metrics || {}
  const hasActivity = ['users', 'jobsTotal', 'applications', 'assessments', 'employment'].some((key) => metrics[key] > 0)

  return (
    <AppShell title="Admin Dashboard" subtitle="Platform oversight based on recorded database activity." showBackButton>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="text-sm font-medium text-slate-700">Date range
            <select
              className="mt-1.5 block min-w-48 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              value={dateRange}
              onChange={(event) => {
                setLoading(true)
                setDateRange(event.target.value)
              }}
            >
              {ADMIN_DASHBOARD_DATE_RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Updating…' : 'Refresh data'}</Button>
        </div>

        {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
        {loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div> : null}

        {data ? <>
          <p className="text-sm text-slate-500">Showing {data.dateRange?.label || 'all time'} counts. Applications use submission dates; interviews use scheduled dates; other counts use record dates.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DASHBOARD_CARDS.map(({ label, metric, description, icon: Icon, to }) => (
              <Link key={metric} to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                <Card className="h-full p-4 transition hover:border-sky-300 hover:bg-sky-50/40">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><Icon size={18} className="text-sky-600" /></div>
                  <p className="mt-3 text-3xl font-bold text-slate-900">{metrics[metric] ?? 0}</p>
                  <p className="mt-1 text-xs text-slate-500">{description}</p>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2"><BarChart3 size={18} className="text-sky-600" /><h2 className="font-semibold text-slate-900">Record status and demo data</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['All job records', metrics.jobsTotal],
                ['Draft jobs', metrics.draftJobs],
                ['Closed jobs', metrics.closedJobs],
                ['Archived jobs', metrics.archivedJobs],
                ['Demo jobs excluded', metrics.demoJobs],
                ['Published assessments', metrics.publishedAssessments],
                ['Draft assessments', metrics.draftAssessments],
                ['Archived assessments', metrics.archivedAssessments],
                ['Active employment records', metrics.activeEmployment],
                ['Completed employment records', metrics.completedEmployment],
                ['Demo resources excluded', metrics.demoResources],
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value ?? 0}</p></div>)}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Only the explicitly seeded demo employer, jobs, and learning resources are marked as demo. Legacy records without a reliable demo marker remain included; no records are guessed to be test data.</p>
          </Card>

          {!hasActivity ? <Card className="p-5"><p className="font-medium text-slate-800">No user, opportunity, application, assessment, or employment activity was recorded for this date range.</p><p className="mt-1 text-sm text-slate-500">Content catalog counts are shown separately above.</p></Card> : null}
        </> : null}

        {data && loading ? <p role="status" className="text-sm text-slate-500">Refreshing dashboard counts…</p> : null}
      </div>
    </AppShell>
  )
}
