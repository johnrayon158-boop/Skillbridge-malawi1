import { ArrowRight, BookOpen, BrainCircuit, BriefcaseBusiness, FileCheck2, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

const features = [
  { title: 'AI career guidance', description: 'Personalized recommendations based on skills, preferences, and career goals.', icon: BrainCircuit },
  { title: 'Skills assessments', description: 'Structured evaluation across technical, behavioral, and workplace readiness areas.', icon: FileCheck2 },
  { title: 'Gap analysis', description: 'Identify the exact learning priorities that move students closer to their target role.', icon: TrendingUp },
  { title: 'Learning pathways', description: 'Connect each gap to practical resources and skill-building opportunities.', icon: BookOpen },
  { title: 'Portfolio evidence', description: 'Transform projects and certificates into visible proof of readiness.', icon: Sparkles },
  { title: 'Employment matching', description: 'Show matches, readiness scores, and explainable hiring signals for students and employers.', icon: BriefcaseBusiness },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-slate-900">SkillBridge Malawi</Link>
          <div className="hidden items-center gap-4 text-sm text-slate-600 md:flex">
            <Link to="/about">About</Link>
            <Link to="/for-employers">For Employers</Link>
            <Link to="/login">Login</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Platform features</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">A complete support system for career growth.</h1>
          <p className="mt-6 text-lg text-slate-600">SkillBridge combines data, guidance, evidence, and recruiting support to help students and employers make smarter career decisions.</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-sky-50 p-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900">Ready to move from uncertainty to opportunity?</h2>
          <p className="mt-3 text-slate-600">Explore the platform and begin building a stronger career path today.</p>
          <div className="mt-6 flex justify-center">
            <Link to="/register">
              <Button variant="primary" size="lg" className="gap-2">
                Create account <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
