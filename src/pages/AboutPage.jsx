import { ArrowRight, BriefcaseBusiness, Lightbulb, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

const values = [
  { title: 'Career clarity', description: 'Students gain direction through AI-guided exploration and practical self-assessment.', icon: Lightbulb },
  { title: 'Skills credibility', description: 'Evidence-backed profiles help graduates show what they can do with confidence.', icon: ShieldCheck },
  { title: 'Employability outcomes', description: 'Employers and job seekers align around skills, readiness, and real opportunities.', icon: BriefcaseBusiness },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-slate-900">SkillBridge Malawi</Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <Link to="/features">Features</Link>
            <Link to="/for-employers">For Employers</Link>
            <Link to="/login">Login</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">About SkillBridge</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">Empowering learners and employers through smarter career pathways.</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            SkillBridge Malawi is designed to bridge the gap between education and employment by combining AI-powered career guidance,
            skills assessments, personalized learning, and recruitment intelligence in one trusted platform.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {values.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 text-slate-600">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-slate-900 p-8 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Our mission</p>
              <h2 className="mt-3 text-3xl font-bold">Helping Malawi’s talent become job-ready and career confident.</h2>
            </div>
            <Link to="/register">
              <Button variant="primary" size="lg" className="gap-2">
                Join SkillBridge <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
