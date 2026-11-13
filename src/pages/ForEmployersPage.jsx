import { ArrowRight, Briefcase, ChartColumnBig, ClipboardCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

const employerBenefits = [
  { title: 'AI candidate matching', description: 'Screen applicants using explainable skill and readiness signals.', icon: ChartColumnBig },
  { title: 'Hiring pipeline', description: 'Track applications from discovery through shortlist, assessment, interview, and offer.', icon: ClipboardCheck },
  { title: 'Talent discovery', description: 'Find students and graduates with the right practical evidence and career fit.', icon: Users },
  { title: 'Recruitment efficiency', description: 'Save time while building a stronger, more transparent hiring process.', icon: Briefcase },
]

export default function ForEmployersPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-slate-900">SkillBridge Malawi</Link>
          <div className="hidden items-center gap-4 text-sm text-slate-600 md:flex">
            <Link to="/about">About</Link>
            <Link to="/features">Features</Link>
            <Link to="/login">Login</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">For employers</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">Find the right talent with better signals.</h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              SkillBridge helps employers identify candidates based on actual capabilities, learning progress, project evidence, and readiness for the job.
            </p>
            <div className="mt-8 flex gap-4">
              <Link to="/register">
                <Button variant="primary" size="lg" className="gap-2">
                  Partner with us <ArrowRight size={18} />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Candidate pipeline</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">Applied → Screened → Shortlisted → Assessment → Interview → Offer</h3>
            </div>
            <div className="mt-6 grid gap-3">
              {['AI matched candidates', 'Shortlisted faster', 'Assessment readiness tracked', 'Hiring insights built in'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {employerBenefits.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
