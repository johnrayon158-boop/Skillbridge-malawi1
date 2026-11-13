import { AppShell } from '../../components/layout/AppShell'

export default function EmployerDashboardPage() {
  return (
    <AppShell title="Employer Dashboard" subtitle="Candidate pipeline, job activity, and hiring readiness.">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Employer workspace</p>
        <h1 className="mt-4 text-4xl font-black text-slate-900">Talent and hiring insights</h1>
        <p className="mt-4 text-lg text-slate-600">This dashboard will be expanded in the next module with recruitment and matching workflows.</p>
      </div>
    </AppShell>
  )
}
