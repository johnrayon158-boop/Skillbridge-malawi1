import { ArrowRight, BookOpen, BriefcaseBusiness, CheckCircle2, ClipboardCheck, Compass, FileCheck2, FolderOpen, GraduationCap, Layers3, Lightbulb, MapPin, Menu, ShieldCheck, Sparkles, Target, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const steps = [
  {
    number: '01',
    title: 'Discover Your Strengths',
    description: 'Explore career options based on your interests, qualifications, skills and goals.',
    icon: Compass,
  },
  {
    number: '02',
    title: 'Identify Your Skills Gaps',
    description: 'Assess your competencies and understand which skills to develop for your preferred career.',
    icon: Target,
  },
  {
    number: '03',
    title: 'Build Towards Opportunity',
    description: 'Use learning resources, build portfolio evidence and explore employment opportunities.',
    icon: BriefcaseBusiness,
  },
]

const features = [
  {
    title: 'Career Guidance',
    description: 'Discover potential career paths based on your interests, qualifications and competencies.',
    icon: Compass,
  },
  {
    title: 'Skills Assessment',
    description: 'Evaluate your current skills and identify areas of strength and improvement.',
    icon: ClipboardCheck,
  },
  {
    title: 'Skills-Gap Analysis',
    description: 'See how your existing skills compare with the competencies your career goals may require.',
    icon: Target,
  },
  {
    title: 'Learning Recommendations',
    description: 'Find learning resources that can help you develop relevant professional skills.',
    icon: BookOpen,
  },
  {
    title: 'Portfolio and Evidence',
    description: 'Build a record of your projects, certificates, experience and demonstrated competencies.',
    icon: FolderOpen,
  },
  {
    title: 'Employment Matching',
    description: 'Explore jobs, internships and industrial attachments relevant to your profile.',
    icon: BriefcaseBusiness,
  },
]

const platformValues = [
  {
    title: 'Designed for Malawi',
    description: 'Built around the career development and employment needs of students and graduates in Malawi.',
    icon: MapPin,
  },
  {
    title: 'Competency-Based Development',
    description: 'Bring together skills, qualifications, projects, certificates and practical evidence.',
    icon: Layers3,
  },
  {
    title: 'Explainable Recommendations',
    description: 'Understand why careers, learning resources and opportunities may be relevant to your profile.',
    icon: Lightbulb,
  },
  {
    title: 'Career Development Support',
    description: 'Connect career discovery, skills development, portfolio building and opportunities in one place.',
    icon: CheckCircle2,
  },
]

const employerBenefits = [
  {
    title: 'Discover Relevant Candidates',
    description: 'Explore candidate profiles using qualifications, competencies and relevant experience.',
    icon: Users,
  },
  {
    title: 'Publish Opportunities',
    description: 'Create and manage jobs, internships and industrial attachment opportunities.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Review Applications',
    description: 'Manage applications and review relevant candidate information.',
    icon: FileCheck2,
  },
  {
    title: 'Competency-Based Recruitment',
    description: 'Consider available skills, assessments, projects and other evidence during review.',
    icon: ShieldCheck,
  },
]

function BrandLink({ footer = false, onClick, compact = false }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="SkillBridge Malawi home"
      className={`inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 ${footer ? '' : 'shrink-0'} ${compact ? 'max-[380px]:gap-1' : ''}`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-lg font-bold text-white ${compact ? 'max-[380px]:h-9 max-[380px]:w-9' : ''}`} aria-hidden="true">S</span>
      <span className="leading-tight">
        <span className={`block text-base font-bold text-slate-900 ${compact ? 'max-[380px]:text-sm' : ''}`}>SkillBridge</span>
        <span className={`block text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 ${compact ? 'max-[380px]:hidden' : ''}`}>Malawi</span>
      </span>
    </Link>
  )
}

function SectionHeading({ eyebrow, title, description, centered = false, id }) {
  return (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">{eyebrow}</p> : null}
      <h2 id={id} className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{description}</p> : null}
    </div>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 max-[380px]:gap-2 max-[380px]:px-3 sm:px-6 lg:px-8">
          <BrandLink onClick={closeMenu} compact />

          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a className="rounded hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600" href="#how-it-works">How It Works</a>
            <a className="rounded hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600" href="#students">For Students</a>
            <a className="rounded hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600" href="#employers">For Employers</a>
          </nav>

          <div className="flex shrink-0 items-center gap-3 max-[380px]:gap-2">
            <Link to="/login" className="hidden rounded text-sm font-semibold text-slate-700 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 sm:inline">Sign In</Link>
            <Link to="/register" className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 max-[380px]:min-h-9 max-[380px]:px-2 max-[380px]:text-xs sm:px-4">
              Create Profile
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 max-[380px]:h-9 max-[380px]:w-9 md:hidden"
            >
              {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav id="landing-mobile-menu" aria-label="Mobile navigation" className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <div className="mx-auto grid max-w-7xl gap-1">
              <a href="#how-it-works" onClick={closeMenu} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">How It Works</a>
              <a href="#students" onClick={closeMenu} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">For Students</a>
              <a href="#employers" onClick={closeMenu} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">For Employers</a>
              <Link to="/login" onClick={closeMenu} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Sign In</Link>
            </div>
          </nav>
        ) : null}
      </header>

      <main>
        <section className="overflow-hidden bg-gradient-to-br from-sky-50 via-white to-white">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-800 sm:text-sm">
                <span className="h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
                Career Development for Malawi’s Next Generation
              </p>
              <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Build the Skills for the Career You Want.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                SkillBridge Malawi helps students and graduates discover suitable career paths, understand their skill gaps, find learning opportunities, build evidence of their abilities, and connect with meaningful jobs.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
                  Create Your Free Profile <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href="#how-it-works" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
                  Explore How It Works
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -left-6 top-8 h-32 w-32 rounded-full bg-sky-200/50 blur-3xl" aria-hidden="true" />
              <div className="absolute -right-4 bottom-4 h-40 w-40 rounded-full bg-teal-100/70 blur-3xl" aria-hidden="true" />
              <div className="relative rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10 sm:p-7">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-700 text-white"><Sparkles size={21} aria-hidden="true" /></span>
                    <div>
                      <p className="font-semibold text-slate-900">Your career development journey</p>
                      <p className="mt-0.5 text-xs text-slate-500">A connected set of next steps</p>
                    </div>
                  </div>
                  <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 sm:inline">Illustrative preview</span>
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    { icon: Compass, title: 'Explore career paths', text: 'Start with interests, skills and goals.' },
                    { icon: Target, title: 'Understand skill needs', text: 'See areas to strengthen for your direction.' },
                    { icon: BookOpen, title: 'Learn and build evidence', text: 'Connect resources with projects and experience.' },
                    { icon: BriefcaseBusiness, title: 'Explore opportunities', text: 'Find jobs and practical placements.' },
                  ].map(({ icon: Icon, title, text }, index) => (
                    <div key={title} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 3 ? 'bg-teal-50 text-teal-800' : 'bg-white text-sky-800'} shadow-sm`}>
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-600">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">Illustrative product journey, not a live user dashboard or activity report.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            id="how-it-works-title"
            eyebrow="A simple journey"
            title="How It Works"
            description="Move from exploring possibilities to taking practical steps toward your career."
            centered
          />
          <div className="relative mt-12 grid gap-5 md:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-sky-200 md:block" aria-hidden="true" />
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article key={number} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="relative flex items-center justify-between">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-sky-50 text-sky-800 shadow-sm"><Icon size={23} aria-hidden="true" /></span>
                  <span className="text-sm font-bold tracking-[0.14em] text-sky-700">STEP {number}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="students" aria-labelledby="student-features-title" className="scroll-mt-24 border-y border-slate-200 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="student-features-title"
              eyebrow="For students and graduates"
              title="Tools for every part of your career development."
              description="Use practical guidance and evidence to make informed next steps."
              centered
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {features.map(({ title, description, icon: Icon }) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="why-skillbridge-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            id="why-skillbridge-title"
            eyebrow="Why SkillBridge Malawi?"
            title="Career development grounded in your context."
            description="A practical way to connect what you know with where you want to go."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {platformValues.map(({ title, description, icon: Icon }) => (
              <article key={title} className="flex gap-4 rounded-2xl border border-slate-200 p-5 sm:p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Icon size={21} aria-hidden="true" /></span>
                <div>
                  <h3 className="font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="trust-title" className="border-y border-slate-200 bg-sky-50/70 py-14 sm:py-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:gap-12 lg:px-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-800 shadow-sm">
              <GraduationCap size={30} aria-hidden="true" />
            </div>
            <div>
              <h2 id="trust-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Designed Around Malawi’s Education and Employment Realities</h2>
              <p className="mt-3 max-w-4xl leading-7 text-slate-600">SkillBridge Malawi brings career guidance, skills development and employment opportunities together to support students and graduates as they prepare for their professional journeys.</p>
            </div>
          </div>
        </section>

        <section id="employers" aria-labelledby="employers-title" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              id="employers-title"
              eyebrow="For employers"
              title="Connect with emerging talent."
              description="Support a clearer recruitment process with relevant candidate information and practical opportunities."
            />
            <Link to="/for-employers" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
              Explore Employer Features <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {employerBenefits.map(({ title, description, icon: Icon }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><Icon size={21} aria-hidden="true" /></span>
                <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Employers make recruitment decisions. SkillBridge provides information and tools to support their review.</p>
        </section>

        <section aria-labelledby="final-cta-title" className="bg-slate-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-300">Take your next step</p>
            <h2 id="final-cta-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your Career Journey Starts Here.</h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">Take the next step towards understanding your strengths, developing your skills and exploring career opportunities.</p>
            <Link to="/register" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
              Create Your Free Profile <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div className="md:col-span-2 lg:col-span-1">
            <BrandLink footer />
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-600">Career guidance, skills development and opportunity discovery for students and graduates in Malawi.</p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">Explore</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li><a href="#how-it-works" className="hover:text-sky-800">How It Works</a></li>
              <li><a href="#students" className="hover:text-sky-800">For Students</a></li>
              <li><Link to="/features" className="hover:text-sky-800">Platform Features</Link></li>
              <li><Link to="/about" className="hover:text-sky-800">About SkillBridge</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">Employers</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li><a href="#employers" className="hover:text-sky-800">Employer Benefits</a></li>
              <li><Link to="/for-employers" className="hover:text-sky-800">Employer Features</Link></li>
              <li><Link to="/register" className="hover:text-sky-800">Join SkillBridge</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">Your account</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li><Link to="/login" className="hover:text-sky-800">Sign In</Link></li>
              <li><Link to="/register" className="hover:text-sky-800">Create Your Profile</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <p>© {new Date().getFullYear()} SkillBridge Malawi</p>
            <p>Built to support career development in Malawi.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
