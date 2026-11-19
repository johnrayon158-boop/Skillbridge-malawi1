import { BarChart3, BriefcaseBusiness, Building2, ChartColumnBig, FileText, Globe2, Layers3, MapPin, RefreshCw, Search, Sparkles, Target, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { labourMarketService } from '../../services/labourMarketService'
import { INTERNSHIP_TYPES } from '../../services/internshipService'
import { LABOUR_MARKET_SECTION_INFO, loadLabourMarketSectionData } from '../../utils/labourMarketSections.js'

const EMPTY_MESSAGE = 'No labour-market data available yet.'
const INPUT = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'
const EMPLOYMENT_TYPES = [
  ['full_time', 'Full-time'],
  ['part_time', 'Part-time'],
  ['contract', 'Contract'],
  ['internship', 'Internship'],
  ['graduate', 'Graduate'],
  ['temporary', 'Temporary'],
  ['volunteer', 'Volunteer'],
]
const POSTING_DATE_RANGES = [
  ['all', 'All dates'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
  ['year', 'Year to date'],
]

function StatCard({ label, value, icon: Icon, description }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon size={18} className="text-sky-600" />
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </Card>
  )
}

export default function LabourMarketModulePage() {
  const { pathname } = useLocation()
  const requestedSection = pathname.split('/').filter(Boolean).at(-1)
  const section = requestedSection === 'labour-market' ? 'overview' : requestedSection
  const sectionInfo = LABOUR_MARKET_SECTION_INFO[section] || LABOUR_MARKET_SECTION_INFO.overview
  const [filters, setFilters] = useState({ sector: '', location: '', employmentType: '', career: '', opportunityType: '', academicProgramme: '', postedWithin: 'all' })
  const [draftFilters, setDraftFilters] = useState(filters)
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = JSON.stringify({ section, filters, refreshKey })
  const currentResult = result?.key === requestKey ? result : null
  const overview = currentResult?.data || null
  const loading = !currentResult
  const error = currentResult?.error || ''

  useEffect(() => {
    let active = true
    loadLabourMarketSectionData(labourMarketService, section, filters)
      .then((data) => {
        if (active) setResult({ key: requestKey, data, error: '' })
      })
      .catch((loadError) => {
        if (active) setResult({ key: requestKey, data: null, error: loadError.message || 'Unable to load labour-market data.' })
      })
    return () => { active = false }
  }, [filters, refreshKey, section, requestKey])

  const handleChange = (field) => (event) => setDraftFilters((current) => ({ ...current, [field]: event.target.value }))
  const applyFilters = (event) => {
    event.preventDefault()
    if (Object.keys(draftFilters).every((key) => draftFilters[key] === filters[key])) {
      setRefreshKey((key) => key + 1)
    } else {
      setFilters({ ...draftFilters })
    }
  }
  const clearFilters = () => {
    const cleared = { sector: '', location: '', employmentType: '', career: '', opportunityType: '', academicProgramme: '', postedWithin: 'all' }
    setDraftFilters(cleared)
    if (Object.keys(cleared).every((key) => filters[key] === cleared[key])) {
      setRefreshKey((key) => key + 1)
    } else {
      setFilters(cleared)
    }
  }
  const hasDraftFilters = Object.entries(draftFilters).some(([key, value]) => key === 'postedWithin' ? value !== 'all' : Boolean(value))
  const hasAppliedFilters = Object.entries(filters).some(([key, value]) => key === 'postedWithin' ? value !== 'all' : Boolean(value))
  const refresh = () => {
    setRefreshKey((key) => key + 1)
  }

  const skillItems = overview?.skillDemand?.items || []
  const careerItems = overview?.careerDemand?.items || []
  const sectorItems = overview?.sectors?.items || []
  const locationItems = overview?.locations?.items || []
  const qualificationItems = overview?.qualifications?.items || []
  const trendItems = overview?.trends?.trendItems || []

  const filtersPanel = (
    <Card className="p-4 sm:p-5">
      <form onSubmit={applyFilters}>
        <div className="mb-3 flex items-center gap-2"><Search size={17} className="text-sky-600" /><h3 className="font-semibold text-slate-900">Filter published jobs</h3></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Sector<input className={`${INPUT} mt-1.5 font-normal`} placeholder="e.g. Agriculture" value={draftFilters.sector} onChange={handleChange('sector')} /></label>
          <label className="text-sm font-medium text-slate-700">Location<input className={`${INPUT} mt-1.5 font-normal`} placeholder="e.g. Lilongwe" value={draftFilters.location} onChange={handleChange('location')} /></label>
          <label className="text-sm font-medium text-slate-700">Career or job title<input className={`${INPUT} mt-1.5 font-normal`} placeholder="e.g. Data Analyst" value={draftFilters.career} onChange={handleChange('career')} /></label>
          <label className="text-sm font-medium text-slate-700">Employment type<select className={`${INPUT} mt-1.5 font-normal`} value={draftFilters.employmentType} onChange={handleChange('employmentType')}><option value="">All types</option>{EMPLOYMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Opportunity type<select className={`${INPUT} mt-1.5 font-normal`} value={draftFilters.opportunityType} onChange={handleChange('opportunityType')}><option value="">All opportunities</option><option value="standard">Standard jobs</option>{INTERNSHIP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Academic programme / discipline<input className={`${INPUT} mt-1.5 font-normal`} placeholder="e.g. Agriculture" value={draftFilters.academicProgramme} onChange={handleChange('academicProgramme')} /></label>
          <label className="text-sm font-medium text-slate-700">Posting date range<select className={`${INPUT} mt-1.5 font-normal`} value={draftFilters.postedWithin} onChange={handleChange('postedWithin')}>{POSTING_DATE_RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Filters are applied together when you select Apply.</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasDraftFilters && !hasAppliedFilters}>Clear</Button>
            <Button type="submit" disabled={loading}><Search size={15} />Apply filters</Button>
            <Button type="button" variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</Button>
          </div>
        </div>
      </form>
    </Card>
  )

  if (section !== 'overview') {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Labour Market</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">{sectionInfo.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{sectionInfo.description}</p>
        </div>
        {filtersPanel}
        {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>Unable to load labour-market data: {error}</span><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={15} />Try again</Button></div> : null}
        {loading && !overview ? <div aria-label={`Loading ${sectionInfo.title.toLowerCase()}`} className="h-56 animate-pulse rounded-2xl bg-slate-100" /> : null}
        {!loading && !error && overview ? <LabourMarketSectionContent section={section} data={overview} /> : null}
        {!loading && !error && !overview ? <Card className="p-6"><p className="text-slate-600">{EMPTY_MESSAGE}</p></Card> : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Labour Market</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">{sectionInfo.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{sectionInfo.description}</p>
        </div>
      </div>

      {filtersPanel}

      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>Unable to load labour-market data: {error}</span><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={15} />Try again</Button></div> : null}
      {overview && loading ? <p className="text-sm text-slate-500" role="status">Updating market indicators…</p> : null}

      {loading && !overview ? (
        <div aria-label="Loading labour-market data" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : !overview && !error ? <Card className="p-6"><p className="text-slate-600">{EMPTY_MESSAGE}</p></Card> : null}

      {overview ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Published & unexpired jobs" value={overview.totalJobs || 0} icon={BriefcaseBusiness} />
        <StatCard label="Employers with jobs" value={overview.totalEmployers || 0} icon={Building2} />
        <StatCard label="Sectors represented" value={overview.totalSectors || 0} icon={ChartColumnBig} />
        <StatCard label="Skills requested" value={overview.totalUniqueSkills || 0} icon={Layers3} />
      </div>
      <Card className="border-sky-200 bg-sky-50/60 p-4">
        <p className="font-semibold text-sky-950">SkillBridge posting sample: {overview.sampleSize ?? overview.totalJobs} {overview.sampleSize === 1 ? 'listing' : 'listings'}</p>
        <p className="mt-1 text-sm leading-6 text-sky-900">
          {overview.dateCoverage
            ? `Posting dates in this sample span ${new Date(overview.dateCoverage.from).toLocaleDateString()} to ${new Date(overview.dateCoverage.to).toLocaleDateString()}.`
            : 'Posting date coverage is unavailable for the current sample.'}
          {' '}These are platform signals only and are not national Malawi labour-market statistics.
        </p>
      </Card>

      {!overview.hasData ? <Card className="p-6"><p className="font-medium text-slate-800">{Object.values(filters).some(Boolean) ? 'No published jobs match these filters.' : EMPTY_MESSAGE}</p><p className="mt-1 text-sm text-slate-500">{Object.values(filters).some(Boolean) ? 'Try adjusting or clearing your filters.' : 'Demand insights will appear when employers publish jobs.'}</p></Card> : <>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><Sparkles size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Most requested skill</h3></div>
          <p className="text-2xl font-bold text-slate-900">{overview.mostRequestedSkill?.skill || 'Insufficient data'}</p>
          <p className="mt-2 text-sm text-slate-600">{overview.mostRequestedSkill ? `${overview.mostRequestedSkill.jobCount} jobs` : 'Insufficient data'}</p>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><Target size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Most requested career</h3></div>
          <p className="text-2xl font-bold text-slate-900">{overview.mostRequestedCareer?.career || 'Insufficient data'}</p>
          <p className="mt-2 text-sm text-slate-600">{overview.mostRequestedCareer ? `${overview.mostRequestedCareer.jobCount} jobs` : 'Insufficient data'}</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-2"><BarsIcon /><h3 className="text-lg font-semibold text-slate-900">Most requested skills</h3></div>
          <div className="space-y-3">
            {skillItems.length ? skillItems.slice(0, 8).map((item) => (
              <div key={item.skill} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="font-medium text-slate-800">{item.skill}</p>
                  <p className="text-xs text-slate-500">{item.employerCount} employers · {item.sectorCount} sectors</p>
                </div>
                <span className="font-semibold text-sky-700">{item.jobCount} jobs</span>
              </div>
            )) : <p className="text-sm text-slate-500">No skill requirements have been recorded for these jobs.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Trend indicators</h3></div>
          <div className="space-y-3">
            {trendItems.length ? trendItems.slice(0, 6).map((item) => (
              <div key={item.skill} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-800">{item.skill}</p>
                <p className="text-xs text-slate-500">{item.trend}</p>
                <p className="mt-1 text-sm text-slate-600">{item.trend === 'Insufficient data' ? 'Not enough consecutive periods to compare.' : `${item.change >= 0 ? '+' : ''}${item.change} vs previous period`}</p>
              </div>
            )) : <p className="text-sm text-slate-500">Not enough dated postings to calculate monthly trends.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><Target size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Career demand</h3></div>
          <div className="space-y-3">
            {careerItems.length ? careerItems.slice(0, 8).map((item) => (
              <div key={item.career} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <span className="font-medium text-slate-800">{item.career}</span>
                <span className="text-sm text-slate-500">{item.jobCount} jobs</span>
              </div>
            )) : <p className="text-sm text-slate-500">No career demand data is available.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><MapPin size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Jobs by location</h3></div>
          <div className="space-y-3">
            {locationItems.length ? locationItems.slice(0, 8).map((item) => (
              <div key={item.location} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <span className="font-medium text-slate-800">{item.location}</span>
                <span className="text-sm text-slate-500">{item.jobs} jobs</span>
              </div>
            )) : <p className="text-sm text-slate-500">No location data is recorded for these jobs.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><Globe2 size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Sector analysis</h3></div>
          <div className="space-y-3">
            {sectorItems.length ? sectorItems.slice(0, 8).map((item) => (
              <div key={item.sector} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="font-medium text-slate-800">{item.sector}</p><span className="text-sm text-slate-500">{item.jobCount} jobs</span></div>
                <p className="mt-1 text-xs text-slate-500">{item.mostRequestedSkills.slice(0, 3).map((skill) => skill.skill).join(', ') || 'No skill data'}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No sector data is recorded for these jobs.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><FileText size={18} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">Qualification demand</h3></div>
          <div className="space-y-3">
            {qualificationItems.length ? qualificationItems.slice(0, 8).map((item) => (
              <div key={item.qualification} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <span className="font-medium text-slate-800">{item.qualification}</span>
                <span className="text-sm text-slate-500">{item.jobCount} jobs</span>
              </div>
            )) : <p className="text-sm text-slate-500">No qualification requirements have been recorded for these jobs.</p>}
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Link to="/admin/labour-market/skills"><Button variant="outline">Open skill demand</Button></Link>
      </div>
      </>}</> : null}
    </div>
  )
}

function LabourMarketSectionContent({ section, data }) {
  if (section === 'jobs') {
    return data.length ? (
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((job) => (
          <Card key={job.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{job.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{job.employer_profiles?.company_name || 'Employer not specified'}</p>
              </div>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium capitalize text-sky-800">{String(job.employment_type || 'not specified').replaceAll('_', ' ')}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>{job.location || 'Location not specified'}</span>
              {job.application_deadline ? <span>Deadline {new Date(job.application_deadline).toLocaleDateString()}</span> : null}
            </div>
            <p className="text-sm text-slate-600">{(job.job_skills || []).map((item) => item.skills?.name).filter(Boolean).join(', ') || 'No approved skills listed'}</p>
          </Card>
        ))}
      </div>
    ) : <Card className="p-6"><p className="text-slate-700">No published, unexpired opportunities match these filters.</p></Card>
  }

  if (section === 'trends') {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Monthly posting volume</h3>
          {data.series?.length ? <div className="space-y-3">{data.series.map((item) => <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><span className="font-medium text-slate-800">{item.label}</span><span className="text-sm text-slate-600">{item.count} {item.count === 1 ? 'job' : 'jobs'}</span></div>)}</div> : <p className="text-sm text-slate-600">{data.summary}</p>}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Skill-demand changes</h3>
          {data.trendItems?.length ? <div className="space-y-3">{data.trendItems.map((item) => <div key={item.skill} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-800">{item.skill}</span><span className="text-sm text-sky-700">{item.trend}</span></div><p className="mt-1 text-xs text-slate-500">{item.change == null ? 'Insufficient consecutive monthly data.' : `${item.change >= 0 ? '+' : ''}${item.change} postings vs the previous month.`}</p></div>)}</div> : <p className="text-sm text-slate-600">No skill trend data is available for this sample.</p>}
        </Card>
      </div>
    )
  }

  if (section === 'reports') {
    const metrics = [
      ['Jobs in sample', data.metrics.jobs],
      ['Employers', data.metrics.employers],
      ['Sectors', data.metrics.sectors],
      ['Unique skills', data.metrics.skills],
    ]
    const lists = [
      ['Sectors', data.sectors.map((item) => `${item.sector}: ${item.jobCount} jobs`)],
      ['Locations', data.locations.map((item) => `${item.location}: ${item.jobs} jobs`)],
      ['Qualifications', data.qualifications.map((item) => `${item.qualification}: ${item.jobCount} jobs`)],
    ]
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <StatCard key={label} label={label} value={value || 0} icon={BarChart3} />)}</div>
        <Card className="border-sky-200 bg-sky-50/60 p-4">
          <p className="font-semibold text-sky-950">SkillBridge posting sample: {data.sampleSize} {data.sampleSize === 1 ? 'listing' : 'listings'}</p>
          <p className="mt-1 text-sm leading-6 text-sky-900">{data.dateCoverage ? `Posting dates span ${new Date(data.dateCoverage.from).toLocaleDateString()} to ${new Date(data.dateCoverage.to).toLocaleDateString()}.` : 'Posting-date coverage is unavailable for this sample.'} This report describes platform records and is not a national labour-market estimate.</p>
          <p className="mt-2 text-xs text-sky-800">Generated {new Date(data.generatedAt).toLocaleString()}</p>
        </Card>
        <div className="grid gap-6 md:grid-cols-3">
          {lists.map(([title, items]) => <Card key={title} className="p-5"><h3 className="mb-3 font-semibold text-slate-900">{title}</h3>{items.length ? <ul className="space-y-2 text-sm text-slate-600">{items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-slate-500">No records available.</p>}</Card>)}
        </div>
      </div>
    )
  }

  const items = data.items || []
  const getName = section === 'skills'
    ? (item) => item.skill
    : section === 'careers'
      ? (item) => item.career
      : (item) => item.sector
  const emptyMessage = section === 'skills'
    ? 'No skill requirements have been recorded for matching jobs.'
    : section === 'careers'
      ? 'No career demand data is available for these jobs.'
      : 'No sector data is available for these jobs.'

  return items.length ? (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={getName(item)} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-slate-900">{getName(item)}</p>
            {section === 'sectors' && item.mostRequestedSkills?.length ? <p className="mt-1 text-xs text-slate-500">Most requested skills: {item.mostRequestedSkills.slice(0, 3).map((skill) => skill.skill).join(', ')}</p> : null}
            {section === 'skills' ? <p className="mt-1 text-xs text-slate-500">{item.employerCount} employers · {item.sectorCount} sectors</p> : null}
          </div>
          <span className="text-sm font-medium text-sky-700">{item.jobCount || 0} jobs</span>
        </Card>
      ))}
    </div>
  ) : <Card className="p-6"><p className="text-slate-600">{emptyMessage}</p></Card>
}

function BarsIcon(props) {
  return <BarChart3 {...props} />
}
