import { ArrowRight, BarChart3, BriefcaseBusiness, MapPin, Sparkles, Target, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CareerGoalSummary } from '../../components/student/CareerGoalSummary'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { LastUpdated, RequestError } from '../../components/ui/RequestState'
import { labourMarketService } from '../../services/labourMarketService'
import { skillService } from '../../services/skillService'
import { studentService } from '../../services/studentService'

const INITIAL_DATA = { key: '', overview: null, profile: null, skills: [], warnings: [], error: null, updatedAt: null }
function EmptyState({ children, action, to }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
    <p>{children}</p>
    {to ? <Link to={to} className="mt-3 inline-flex items-center gap-1 font-semibold text-sky-700">{action || 'Explore'} <ArrowRight size={15} /></Link> : null}
  </div>
}

function MetricCard({ label, value, hint, icon: Icon }) {
  return <Card className="p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>
      <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><Icon size={19} aria-hidden="true" /></span>
    </div>
  </Card>
}

function DemandList({ items, totalJobs }) {
  if (!items?.length) return <EmptyState>No skill requirements are available in the published job data yet.</EmptyState>
  const maxCount = Math.max(...items.map((item) => item.jobCount || item.count || 0), 1)
  return <ol className="space-y-4">
    {items.slice(0, 8).map((item, index) => {
      const count = item.jobCount || item.count || 0
      const share = totalJobs ? Math.min(100, Math.round((count / totalJobs) * 100)) : Math.round((count / maxCount) * 100)
      return <li key={item.skill} className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 font-medium text-slate-800"><span className="mr-2 text-xs text-slate-400">{index + 1}.</span>{item.skill}</span>
          <span className="shrink-0 text-xs text-slate-500">{count} {count === 1 ? 'job' : 'jobs'}{totalJobs ? ` · ${share}%` : ''}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${item.skill} demand`} aria-valuenow={share} aria-valuemin="0" aria-valuemax="100">
          <div className="h-full rounded-full bg-sky-600" style={{ width: `${share}%` }} />
        </div>
      </li>
    })}
  </ol>
}

export default function StudentMarketPage({ userId, mode = 'market' }) {
  const [retryCount, setRetryCount] = useState(0)
  const [dataState, setDataState] = useState(INITIAL_DATA)
  const [draftCareer, setDraftCareer] = useState('')
  const [selectedCareer, setSelectedCareer] = useState('')
  const [insightRetry, setInsightRetry] = useState(0)
  const isSkillDemand = mode === 'demand'
  const dataKey = `${userId}:${retryCount}`
  const loading = dataState.key !== dataKey
  const overview = dataState.overview
  const warnings = dataState.key === dataKey ? dataState.warnings : []
  const marketError = dataState.key === dataKey ? dataState.error : null
  const insightKey = `${userId}:${selectedCareer.trim()}:${dataState.key}:${insightRetry}`
  const insightLoading = Boolean(overview?.hasData) && dataState.key === dataKey && dataState.insightKey !== insightKey

  useEffect(() => {
    let active = true
    Promise.allSettled([
      labourMarketService.getOverview(),
      studentService.getProfile(userId),
      skillService.getSkillProfile(userId),
    ]).then(([overviewResult, profileResult, skillsResult]) => {
      if (!active) return
      if (overviewResult.status === 'rejected') {
        setDataState((current) => ({ ...current, key: dataKey, warnings: [], error: overviewResult.reason }))
        return
      }
      const profile = profileResult.status === 'fulfilled' ? profileResult.value : null
      const student = Array.isArray(profile?.student_profiles) ? profile.student_profiles[0] : profile?.student_profiles
      const skills = skillsResult.status === 'fulfilled'
        ? skillsResult.value.map((item) => item?.skills?.name || item?.name || '').filter(Boolean)
        : []
      const warnings = [
        ...(profileResult.status === 'rejected' ? [{ key: 'profile', error: profileResult.reason }] : []),
        ...(skillsResult.status === 'rejected' ? [{ key: 'skills', error: skillsResult.reason }] : []),
      ]
      const career = student?.target_role || overviewResult.value.mostRequestedCareer?.career || ''
      setDataState({ key: dataKey, overview: overviewResult.value, profile, skills, warnings, error: null, insightKey: '', updatedAt: new Date() })
      setDraftCareer(career)
      setSelectedCareer(career)
    })
    return () => { active = false }
  }, [dataKey, userId])

  useEffect(() => {
    if (loading || !overview?.hasData) return undefined
    let active = true
    const key = `${userId}:${selectedCareer.trim()}:${dataState.key}:${insightRetry}`
    labourMarketService.getStudentInsights(userId, selectedCareer.trim(), dataState.skills)
      .then((data) => {
        if (active) setDataState((current) => ({ ...current, insightKey: key, insights: data, insightError: '' }))
      })
      .catch((error) => {
        if (active) setDataState((current) => ({ ...current, insightKey: key, insights: null, insightError: error }))
      })
    return () => { active = false }
  }, [dataState.key, dataState.skills, insightRetry, loading, overview?.hasData, selectedCareer, userId])

  const insights = dataState.insightKey === insightKey ? dataState.insights : null
  const insightError = dataState.insightKey === insightKey ? dataState.insightError : ''
  const targetLabel = selectedCareer.trim() || 'All careers'
  const studentProfile = Array.isArray(dataState.profile?.student_profiles)
    ? dataState.profile.student_profiles[0]
    : dataState.profile?.student_profiles
  const topSector = overview?.sectors?.items?.[0]
  const skillItems = isSkillDemand ? overview?.skillDemand?.items || [] : insights?.skills || []
  const missingSkills = insights?.missingSkills || []

  const applyCareer = (event) => {
    event.preventDefault()
    setSelectedCareer(draftCareer.trim())
  }

  const pageTitle = isSkillDemand ? 'Skills in demand' : 'Career Market'
  const pageDescription = isSkillDemand
    ? 'See which skills appear most often in current published job requirements.'
    : 'Explore current job-market signals and compare your skills with opportunities.'

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Career market</p>
      <h2 className="mt-1 text-3xl font-bold text-slate-900">{pageTitle}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{pageDescription} Insights are calculated from published SkillBridge job listings and are not a guarantee of hiring demand across the whole labour market.</p>
      {overview ? <p className="mt-2 text-xs leading-5 text-slate-500">Early Platform Signals · {overview.sampleSize ?? overview.totalJobs} current SkillBridge posting(s){overview.dateCoverage ? ` · dates ${new Date(overview.dateCoverage.from).toLocaleDateString()}–${new Date(overview.dateCoverage.to).toLocaleDateString()}` : ' · posting date coverage unavailable'} · not national Malawi labour-market statistics.</p> : null}
    </header>

    {marketError && !overview ? <RequestError error={marketError} fallback="We could not load current labour-market data." onRetry={() => setRetryCount((count) => count + 1)} /> : null}
    {loading && !overview ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading career market">
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
    </div> : overview?.hasData ? <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LastUpdated value={dataState.updatedAt} />
        {loading ? <p role="status" className="text-xs text-slate-500">Refreshing market data…</p> : null}
        {marketError ? <div className="min-w-0 flex-1"><RequestError error={marketError} fallback="We could not refresh market data." stale onRetry={() => setRetryCount((count) => count + 1)} /></div> : null}
      </div>
      {warnings.map(({ key, error }) => <RequestError key={key} error={error} fallback={key === 'profile' ? 'Your target occupation could not be loaded.' : 'Your saved skills could not be loaded.'} onRetry={() => setRetryCount((count) => count + 1)} />)}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Published opportunities" value={overview.totalJobs} hint="Current, non-expired listings" icon={BriefcaseBusiness} />
        <MetricCard label="Active employers" value={overview.totalEmployers} hint="With current published listings" icon={Target} />
        <MetricCard label="Skills requested" value={overview.totalUniqueSkills} hint="Across published job requirements" icon={Sparkles} />
        <MetricCard label={isSkillDemand ? 'Top requested skill' : 'Top hiring sector'} value={isSkillDemand ? overview.mostRequestedSkill?.skill || 'Not specified' : topSector?.sector || 'Not specified'} hint={isSkillDemand ? `${overview.mostRequestedSkill?.jobCount || 0} listing(s) mention it` : `${topSector?.jobCount || 0} current listing(s)`} icon={BarChart3} />
      </div>

      {!isSkillDemand ? <Card className="p-5 sm:p-6">
        {dataState.profile ? <CareerGoalSummary className="mb-4" targetRole={studentProfile?.target_role} careerGoal={studentProfile?.career_goal} /> : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><div className="flex items-center gap-2 text-sky-700"><Target size={17} /><h3 className="font-semibold text-slate-900">Compare your skills with a career</h3></div><p className="mt-1 text-sm text-slate-600">Use your target occupation or enter a role title to see related listings and skill gaps. Your longer career-goal description remains supporting context.</p></div>
          <form onSubmit={applyCareer} className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
            <label className="sr-only" htmlFor="market-career">Career or job title</label>
            <input id="market-career" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={draftCareer} onChange={(event) => setDraftCareer(event.target.value)} placeholder="e.g. Software Developer (blank for all jobs)" />
            <Button type="submit" variant="outline">Update view</Button>
          </form>
        </div>
        {dataState.skills.length ? <p className="mt-3 text-xs text-slate-500">Comparing against {dataState.skills.length} skill(s) in your Skills profile.</p> : <p className="mt-3 text-xs text-amber-700">Add verified skills in <Link to="/student/skills" className="font-semibold underline">Skills</Link> for a personalized comparison.</p>}
      </Card> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-sky-700"><Sparkles size={18} /><h3 className="text-lg font-semibold text-slate-900">{isSkillDemand ? 'Most requested skills' : `Skills in ${targetLabel} listings`}</h3></div><p className="mt-1 text-sm text-slate-600">{isSkillDemand ? `Ranked from ${overview.skillDemand?.totalJobs || overview.totalJobs} current listings with skill requirements.` : 'Counts show how often each skill appears in matching published roles.'}</p></div>
            <Badge tone="blue">{skillItems.length} skills</Badge>
          </div>
          {isSkillDemand ? <DemandList items={skillItems} totalJobs={overview.totalJobs} /> : insightError ? <RequestError error={insightError} fallback="We could not load career-specific market insights." onRetry={() => setInsightRetry((value) => value + 1)} /> : insightLoading ? <div className="space-y-4" aria-label="Loading career skill insights">{[1, 2, 3, 4].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-slate-100" />)}</div> : insights?.jobCount ? <>
            <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm leading-6 text-sky-950">{insights.summary}</p>
            <DemandList items={skillItems} totalJobs={insights.jobCount} />
          </> : <EmptyState>{selectedCareer ? `No current published job titles matched “${selectedCareer}”. Try a broader role name or clear the career filter.` : 'No skill-level requirements were found in the current published listings.'}</EmptyState>}
          <Link to="/student/skills/demand" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">View all market skills <ArrowRight size={15} /></Link>
        </Card>

        {!isSkillDemand ? <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sky-700"><TrendingUp size={18} /><h3 className="text-lg font-semibold text-slate-900">Your skill priorities</h3></div>
          {insightError ? <EmptyState>Career-specific skill priorities could not be loaded. The overall market data is still available in the other panels.</EmptyState> : insightLoading ? <div className="space-y-3" aria-label="Loading your skill priorities"><div className="h-14 animate-pulse rounded bg-slate-100" /><div className="h-14 animate-pulse rounded bg-slate-100" /></div> : insights?.jobCount ? missingSkills.length ? <div className="space-y-3">{missingSkills.map((item, index) => <div key={item.skill} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="font-medium text-slate-800">{item.skill}</p><p className="text-xs text-slate-500">Requested in {item.count} matching {item.count === 1 ? 'listing' : 'listings'}</p></div><Badge tone={index < 2 ? 'amber' : 'slate'}>Suggested gap</Badge></div>)}<Link to="/student/skills" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Review my skills <ArrowRight size={15} /></Link></div> : <EmptyState>Your profile includes the most frequent skills found in these listings. Keep your evidence up to date.</EmptyState> : <EmptyState>There are no matching opportunities to compare yet.</EmptyState>}
        </Card> : <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sky-700"><MapPin size={18} /><h3 className="text-lg font-semibold text-slate-900">Where opportunities are listed</h3></div>
          {overview.locations?.items?.length ? <ul className="space-y-3">{overview.locations.items.slice(0, 7).map((item) => <li key={item.location} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><span className="font-medium text-slate-800">{item.location}</span><span className="text-slate-500">{item.jobs} {item.jobs === 1 ? 'listing' : 'listings'}{item.remote ? ` · ${item.remote} remote` : ''}</span></li>)}</ul> : <EmptyState>Location information is not available on current listings.</EmptyState>}
        </Card>}
      </div>

      {!isSkillDemand ? <>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-sky-700"><BarChart3 size={18} /><h3 className="text-lg font-semibold text-slate-900">Hiring by sector</h3></div>
            {overview.sectors?.items?.length ? <ul className="space-y-3">{overview.sectors.items.slice(0, 6).map((item) => <li key={item.sector} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="font-medium text-slate-800">{item.sector}</span><span className="text-slate-600">{item.jobCount} listings</span></li>)}</ul> : <EmptyState>Sector information is not available for current listings.</EmptyState>}
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-sky-700"><BriefcaseBusiness size={18} /><h3 className="text-lg font-semibold text-slate-900">Recently published roles</h3></div>
            {overview.recentJobs?.length ? <ul className="divide-y divide-slate-100">{overview.recentJobs.slice(0, 6).map((job) => <li key={job.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium text-slate-900">{job.title}</p><p className="mt-1 text-xs text-slate-500">{job.employer_profiles?.company_name || 'Employer'} · {job.location || 'Location not listed'}{job.published_at ? ` · ${new Date(job.published_at).toLocaleDateString()}` : ''}</p></div><Link to={`/student/jobs/${job.id}`} className="shrink-0 text-sm font-semibold text-sky-700 hover:underline">View role</Link></li>)}</ul> : <EmptyState to="/student/jobs" action="Browse opportunities">No current listings are available.</EmptyState>}
            <Link to="/student/jobs" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Browse all opportunities <ArrowRight size={15} /></Link>
          </Card>
        </div>
        <p className="text-xs leading-5 text-slate-500">Market figures reflect SkillBridge listings available now. Job counts are not independent of reposts and may not represent every employer or vacancy in Malawi.</p>
      </> : null}
    </> : marketError ? null : loading ? null : <><LastUpdated value={dataState.updatedAt} /><EmptyState>No published job data is available to calculate market demand yet. Check back when employers post new opportunities.</EmptyState></>}
  </div>
}
