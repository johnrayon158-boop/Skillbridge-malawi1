import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Building2, CalendarDays, ExternalLink, GraduationCap, MapPin, RefreshCw, Search } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { RequestError } from '../../components/ui/RequestState'
import { internshipService, INTERNSHIP_TYPES } from '../../services/internshipService'
import { INTERNSHIP_MATCH_WEIGHTS, matchInternship } from '../../utils/internshipMatching'
import { getOpportunityTypeFilterValue } from '../../utils/opportunityType'
import { formatApplicationStatus } from '../../services/applicationService'

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100'
const tabs = ['Recommended', 'Browse all', 'Web listings', 'Saved', 'My applications']
const DEFAULT_FILTERS = { search: '', type: '', location: '', industry: '', workMode: '', academic: '', skill: '', education: '', studyYear: '', duration: '', compensated: false, eligibleOnly: false, sort: 'match', minimumScore: '' }
const factorLabels = {
  skills: 'Skills and competencies',
  academic: 'Academic programme',
  career: 'Target occupation and supporting goal',
  education: 'Education level',
  evidence: 'Projects, assessments and certificates',
  location: 'Location preference',
  availability: 'Placement availability',
}
function placementType(opportunity) {
  const label = INTERNSHIP_TYPES.find(([value]) => value === opportunity.opportunity_type)?.[1]
  return label || opportunity.employment_type?.replace(/_/g, ' ') || 'Practical placement'
}

function MatchDetails({ match }) {
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-sky-50 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={!match.eligible ? 'rose' : match.eligibilityPending ? 'amber' : 'green'}>{!match.eligible ? 'Does not meet listed requirements' : match.eligibilityPending ? 'Eligibility needs confirmation' : 'Meets listed requirements'}</Badge>
        {match.provisional ? <Badge tone="amber">Provisional</Badge> : null}
        {match.score !== null ? <span className="font-semibold text-sky-900">Compatibility {match.score}%</span> : null}
      </div>
      <p className="text-slate-700">{match.explanation}</p>
      {match.score !== null ? <div className="grid gap-2 sm:grid-cols-2">{Object.entries(INTERNSHIP_MATCH_WEIGHTS).filter(([factor]) => match.factors[factor] !== null).map(([factor, weight]) => <p key={factor} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700">{factorLabels[factor]} · {weight}% base weight: <strong>{match.factors[factor]}%</strong></p>)}</div> : null}
      <p className="text-xs text-slate-500">Compatibility is based on recorded information and is not a probability of acceptance.</p>
      {match.eligibilityReasons.length ? <ul className="list-disc space-y-1 pl-5 text-rose-800">{match.eligibilityReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
      {match.skills.length ? <div className="flex flex-wrap gap-2">{match.skills.map((skill) => <Badge key={skill.name} tone={skill.found ? 'green' : skill.isRequired ? 'rose' : 'amber'}>{skill.name}: {skill.found ? 'recorded' : skill.isRequired ? 'required, not recorded' : 'preferred, not recorded'}</Badge>)}</div> : null}
      {match.missingInformation.length ? <div className="text-slate-600"><p className="font-medium">Improve your match information:</p><ul className="list-disc pl-5">{match.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul><Link className="mt-2 inline-flex font-semibold text-sky-800 underline" to="/student/profile">Update your profile</Link></div> : null}
      <Link className="inline-flex font-semibold text-sky-800 underline" to="/student/skills/gaps">Review your skills gap</Link>
    </div>
  )
}

function OpportunityCard({ opportunity, match, saved, application, onSave, onApply, detail = false }) {
  const [coverLetter, setCoverLetter] = useState('')
  const [documents, setDocuments] = useState((opportunity.required_documents || []).map((name) => ({ name, url: '' })))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const employerName = opportunity.employer_profiles?.company_name
  const isExpired = opportunity.application_deadline && opportunity.application_deadline < new Date().toISOString().slice(0, 10)
  const typeText = placementType(opportunity)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setApplying(true)
    try {
      await onApply(opportunity.id, coverLetter, documents)
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your application.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {detail ? opportunity.title : <Link className="hover:text-sky-800" to={`/student/internships/${opportunity.id}`}>{opportunity.title}</Link>}
            </h3>
            <Badge tone="blue">{typeText}</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {employerName ? <span className="inline-flex items-center gap-1"><Building2 size={14} />{employerName}</span> : null}
            {opportunity.location ? <span className="inline-flex items-center gap-1"><MapPin size={14} />{opportunity.location}</span> : null}
            {opportunity.work_mode ? <span>{opportunity.work_mode}</span> : null}
            {opportunity.employer_profiles?.industry ? <span>{opportunity.employer_profiles.industry}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {match.score !== null ? <Badge tone="green">{match.score}% compatibility</Badge> : null}
          {application ? <Badge tone="amber">{formatApplicationStatus(application.status)}</Badge> : null}
        </div>
      </div>
      <p className={`mt-3 text-sm leading-6 text-slate-600 ${detail ? 'whitespace-pre-line' : 'line-clamp-3'}`}>{opportunity.description}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {opportunity.application_deadline ? <span className="inline-flex items-center gap-1"><CalendarDays size={14} />Deadline {opportunity.application_deadline}</span> : null}
        {opportunity.duration_weeks ? <span>{opportunity.duration_weeks} weeks</span> : null}
        {opportunity.placement_start_date ? <span>Starts {opportunity.placement_start_date}</span> : null}
        {opportunity.eligible_programmes?.length ? <span className="inline-flex items-center gap-1"><GraduationCap size={14} />{opportunity.eligible_programmes.join(', ')}</span> : null}
        {opportunity.positions_available ? <span>{opportunity.positions_available} positions</span> : null}
        {opportunity.salary_min != null || opportunity.salary_max != null
          ? <span>{opportunity.currency || 'MWK'} {opportunity.salary_min ?? ''}{opportunity.salary_max != null ? `–${opportunity.salary_max}` : ''}</span>
          : null}
      </div>
      {detail ? (
        <>
          {opportunity.responsibilities ? <section className="mt-5"><h4 className="font-semibold text-slate-900">Responsibilities</h4><p className="mt-1 whitespace-pre-line text-sm text-slate-600">{opportunity.responsibilities}</p></section> : null}
          {opportunity.learning_objectives ? <section className="mt-4"><h4 className="font-semibold text-slate-900">Learning objectives</h4><p className="mt-1 whitespace-pre-line text-sm text-slate-600">{opportunity.learning_objectives}</p></section> : null}
          {opportunity.application_instructions ? <section className="mt-4"><h4 className="font-semibold text-slate-900">Application instructions</h4><p className="mt-1 whitespace-pre-line text-sm text-slate-600">{opportunity.application_instructions}</p></section> : null}
        </>
      ) : null}
      <div className="mt-5"><MatchDetails match={match} /></div>
      {detail && !application && !isExpired ? (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
          <h4 className="font-semibold text-slate-900">Apply for this placement</h4>
          {opportunity.required_documents?.length ? <div className="space-y-3"><p className="text-sm text-slate-600">Provide secure HTTPS links for the required documents:</p>{documents.map((document, index) => <label key={document.name} className="block text-sm font-medium text-slate-700">{document.name}<input required type="url" pattern="https://.*" className={`${inputClass} mt-1`} placeholder="https://…" value={document.url} onChange={(event) => setDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /></label>)}</div> : null}
          <label className="block text-sm font-medium text-slate-700">Cover letter (optional)<textarea className={`${inputClass} mt-1 min-h-28`} value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} /></label>
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
          <Button type="submit" disabled={applying || !match.eligible || match.eligibilityPending}>{applying ? 'Submitting…' : 'Submit application'}</Button>
          {match.eligibilityPending ? <p className="text-sm text-amber-800">Update the required profile details above to confirm you meet this placement’s eligibility criteria.</p> : null}
        </form>
      ) : detail && application ? <p className="mt-5 text-sm font-medium text-sky-800">Your application is recorded. Current status: {formatApplicationStatus(application.status)}.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!detail ? <Link to={`/student/internships/${opportunity.id}`}><Button size="sm" variant="outline">View details</Button></Link> : null}
        <Button size="sm" variant="outline" onClick={() => onSave(opportunity.id, saved)}>{saved ? 'Remove saved' : 'Save placement'}</Button>
        {!detail && !application ? <Link to={`/student/internships/${opportunity.id}`} aria-disabled={!match.eligible || isExpired} tabIndex={!match.eligible || isExpired ? -1 : undefined} className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${!match.eligible || isExpired ? 'pointer-events-none bg-slate-200 text-slate-500' : 'bg-sky-700 text-white hover:bg-sky-800'}`}>Apply now</Link> : null}
        {application ? <Link className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/student/applications/${application.id}`}>Track application</Link> : null}
      </div>
      {isExpired ? <p className="mt-3 text-sm text-rose-700">The recorded application deadline has passed.</p> : null}
    </Card>
  )
}

function PublicListings() {
  const [listings, setListings] = useState([])
  const [searchedAt, setSearchedAt] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [incomplete, setIncomplete] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    internshipService.searchPublicOpportunities()
      .then((result) => {
        if (!active) return
        setListings(result.listings || [])
        setSearchedAt(result.searchedAt || '')
        setIncomplete(Boolean(result.incomplete))
        setError('')
      })
      .catch((searchError) => {
        if (active) setError(searchError)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  const visibleListings = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return listings
    return listings.filter((listing) => `${listing.title} ${listing.description} ${listing.source}`.toLowerCase().includes(search))
  }, [listings, query])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Internship and industrial attachment listings from the web</h2>
          <p className="mt-1 text-sm text-slate-600">Active results from supported public job feeds, including international and remote opportunities. Open the original source to confirm availability and application details.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => { setLoading(true); setError(''); setRetry((current) => current + 1) }} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh listings
        </Button>
      </div>
      <label className="relative block">
        <span className="sr-only">Filter web listings</span>
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input className={`${inputClass} pl-9`} placeholder="Filter by title, description or source" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p className="text-xs leading-5 text-slate-500">Listings are gathered from the Jobicy, Arbeitnow and Remotive public feeds, with feed responses cached for up to six hours. Expired postings with a stated deadline are excluded; providers may not supply an expiry date for every listing, so confirm that it is still open at the source. Feed coverage is not exhaustive. SkillBridge does not verify external listings or submit applications for them.</p>
      {incomplete ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Some search sources did not respond; the results shown may be incomplete.</p> : null}
      {error ? <RequestError error={error} fallback="Public placement listings could not be loaded." onRetry={() => { setLoading(true); setError(''); setRetry((current) => current + 1) }} /> : null}
      {loading ? <div className="grid gap-4 md:grid-cols-2" aria-label="Searching public placement listings"><div className="h-40 animate-pulse rounded-2xl bg-slate-200" /><div className="h-40 animate-pulse rounded-2xl bg-slate-200" /></div> : visibleListings.length ? (
        <>
          {searchedAt ? <p className="text-xs text-slate-500">{visibleListings.length} result(s) · searched {new Date(searchedAt).toLocaleString()}</p> : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleListings.map((listing) => (
              <Card key={listing.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">{listing.title}</h3>
                  <Badge tone="blue">Web result</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{listing.source} · {listing.location}{listing.publishedAt ? ` · posted ${new Date(listing.publishedAt).toLocaleDateString()}` : ''}{listing.deadline ? ` · deadline ${new Date(`${listing.deadline}T00:00:00`).toLocaleDateString()}` : ''}</p>
                {listing.description ? <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{listing.description}</p> : null}
                <a href={listing.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-sky-800 underline">
                  Open source listing <ExternalLink size={14} />
                </a>
              </Card>
            ))}
          </div>
        </>
      ) : !error ? <Card className="p-8 text-center"><BriefcaseBusiness className="mx-auto text-slate-400" size={28} /><p className="mt-3 font-medium text-slate-800">{query ? 'No web results match that filter.' : 'No recent public listings were found.'}</p></Card> : null}
    </div>
  )
}

export default function InternshipsPage() {
  const { user, profile } = useAuth()
  const { id } = useParams()
  const [tab, setTab] = useState('Browse all')
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [loadingMore, setLoadingMore] = useState(false)
  const [requestState, setRequestState] = useState({ key: '', error: '' })
  const [loadMoreError, setLoadMoreError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const requestKey = `${user.id}:${profile?.updated_at || ''}:${id || 'list'}:${retry}`
  const loading = requestState.key !== requestKey
  const error = loading ? '' : requestState.error || loadMoreError

  const load = async () => {
    setRequestState({ key: '', error: '' })
    setLoadMoreError('')
    try {
      const result = await internshipService.getStudentOpportunities(
        user.id,
        profile,
        id ? { opportunityId: id, limit: 1 } : undefined,
      )
      setData(result)
      setRequestState({ key: requestKey, error: '' })
    } catch (loadError) {
      setRequestState({ key: requestKey, error: loadError })
    }
  }

  useEffect(() => {
    let active = true
    internshipService.getStudentOpportunities(user.id, profile, id ? { opportunityId: id, limit: 1 } : undefined)
      .then((result) => {
        if (active) {
          setData(result)
          setRequestState({ key: requestKey, error: '' })
        }
      })
      .catch((loadError) => {
        if (active) setRequestState({ key: requestKey, error: loadError })
      })
    return () => { active = false }
  }, [user.id, profile, requestKey, id])

  const matches = useMemo(() => (data?.opportunities || []).map((opportunity) => ({
    opportunity,
    match: matchInternship(data.student, opportunity),
  })), [data])

  const activeFilterLabels = [
    filters.search && `Search: ${filters.search}`,
    filters.type && `Type: ${INTERNSHIP_TYPES.find(([value]) => value === filters.type)?.[1] || filters.type}`,
    filters.location && `Location: ${filters.location}`,
    filters.industry && `Industry or field: ${filters.industry}`,
    filters.workMode && `Work arrangement: ${filters.workMode}`,
    filters.academic && `Programme: ${filters.academic}`,
    filters.skill && `Skill: ${filters.skill}`,
    filters.education && `Education: ${filters.education}`,
    filters.studyYear && `Study year: ${filters.studyYear}`,
    filters.duration && `Duration: ${filters.duration === 'short' ? 'under 12 weeks' : '12 weeks or longer'}`,
    filters.compensated && 'Compensation recorded',
    filters.eligibleOnly && 'Meets listed eligibility',
    filters.minimumScore && `Compatibility: ${filters.minimumScore}% or higher`,
    filters.sort !== 'match' && `Sort: ${filters.sort}`,
  ].filter(Boolean)

  const visible = useMemo(() => {
    let result = [...matches]
    if (tab === 'Recommended') result = result.filter(({ match }) => match.eligible).sort((left, right) => (right.match.score ?? -1) - (left.match.score ?? -1))
    if (tab === 'Saved') result = result.filter(({ opportunity }) => data?.savedJobIds.has(opportunity.id))
    if (id) result = result.filter(({ opportunity }) => opportunity.id === id)
    const search = filters.search.trim().toLowerCase()
    if (search) result = result.filter(({ opportunity }) => `${opportunity.title} ${opportunity.description} ${opportunity.employer_profiles?.company_name || ''} ${opportunity.department || ''}`.toLowerCase().includes(search))
    if (filters.type) result = result.filter(({ opportunity }) => getOpportunityTypeFilterValue(opportunity) === filters.type)
    if (filters.location) result = result.filter(({ opportunity }) => (opportunity.location || '').toLowerCase().includes(filters.location.toLowerCase()))
    if (filters.industry) result = result.filter(({ opportunity }) => `${opportunity.employer_profiles?.industry || ''} ${opportunity.department || ''}`.toLowerCase().includes(filters.industry.toLowerCase()))
    if (filters.workMode) result = result.filter(({ opportunity }) => opportunity.work_mode === filters.workMode)
    if (filters.academic) result = result.filter(({ opportunity }) => (opportunity.eligible_programmes || []).some((programme) => programme.toLowerCase().includes(filters.academic.toLowerCase())))
    if (filters.skill) result = result.filter(({ opportunity }) => (opportunity.job_skills || []).some((skill) => (skill.skills?.name || '').toLowerCase().includes(filters.skill.toLowerCase())))
    if (filters.education) result = result.filter(({ opportunity }) => (opportunity.education_required || '').toLowerCase().includes(filters.education.toLowerCase()))
    if (filters.studyYear) result = result.filter(({ opportunity }) => (!opportunity.min_study_year || Number(filters.studyYear) >= opportunity.min_study_year) && (!opportunity.max_study_year || Number(filters.studyYear) <= opportunity.max_study_year))
    if (filters.duration) result = result.filter(({ opportunity }) => opportunity.duration_weeks != null && (filters.duration === 'short' ? opportunity.duration_weeks < 12 : opportunity.duration_weeks >= 12))
    if (filters.compensated) result = result.filter(({ opportunity }) => opportunity.salary_min != null || opportunity.salary_max != null)
    if (filters.eligibleOnly) result = result.filter(({ match }) => match.eligible)
    if (filters.minimumScore) result = result.filter(({ match }) => match.score !== null && match.score >= Number(filters.minimumScore))
    if (filters.sort === 'match') result.sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1))
    if (filters.sort === 'latest') result.sort((a, b) => new Date(b.opportunity.published_at || b.opportunity.created_at) - new Date(a.opportunity.published_at || a.opportunity.created_at))
    if (filters.sort === 'deadline') result.sort((a, b) => (a.opportunity.application_deadline || '9999-12-31').localeCompare(b.opportunity.application_deadline || '9999-12-31'))
    if (filters.sort === 'title') result.sort((a, b) => a.opportunity.title.localeCompare(b.opportunity.title))
    if (tab === 'My applications') {
      result = (data?.applications || []).map((application) => {
        const found = matches.find((item) => item.opportunity.id === application.job_id)
        if (found) return { ...found, application }
        if (!application.jobs) {
          const opportunity = { id: application.job_id, title: 'Placement application', description: '', job_skills: [] }
          return { opportunity, match: matchInternship(data.student, opportunity), application }
        }
        return {
          opportunity: { ...application.jobs, description: '', job_skills: [] },
          match: matchInternship(data.student, { ...application.jobs, job_skills: [] }),
          application,
        }
      }).filter(Boolean)
    }
    return result
  }, [matches, tab, data, filters, id])

  const saveOpportunity = async (jobId, isSaved) => {
    setNotice('')
    try {
      if (isSaved) await internshipService.removeSavedOpportunity(user.id, jobId)
      else await internshipService.saveOpportunity(user.id, jobId)
      setData((current) => ({
        ...current,
        savedJobIds: new Set([...current.savedJobIds].filter((item) => item !== jobId).concat(isSaved ? [] : [jobId])),
      }))
      setNotice(isSaved ? 'Placement removed from your saved list.' : 'Placement saved.')
    } catch (saveError) {
      setNotice(saveError.message || 'Unable to update saved placements.')
    }
  }

  const submitApplication = async (jobId, coverLetter, documents) => {
    await internshipService.submitApplication(jobId, coverLetter, documents)
    setNotice('Your application was submitted successfully.')
    await load()
  }

  const loadMore = async () => {
    setLoadingMore(true)
    setLoadMoreError('')
    try {
      const more = await internshipService.getStudentOpportunities(user.id, profile, { offset: data.nextOffset })
      setData((current) => ({
        ...more,
        opportunities: [...current.opportunities, ...more.opportunities],
        savedJobIds: current.savedJobIds,
        applications: current.applications,
      }))
    } catch (loadError) {
      setLoadMoreError(loadError)
    } finally {
      setLoadingMore(false)
    }
  }

  const activeApplications = new Map((data?.applications || []).map((application) => [application.job_id, application]))
  const detailItem = id ? matches.find(({ opportunity }) => opportunity.id === id) : null
  const title = id ? detailItem?.opportunity.title || 'Placement details' : 'Internships & Industrial Attachments'

  return (
    <AppShell title={title} subtitle="Find practical placements using published opportunities and your recorded profile.">
      <div className="mx-auto max-w-6xl space-y-6">
        {!id ? <div className="flex flex-wrap gap-2" role="tablist" aria-label="Placement sections">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 ${tab === item ? 'bg-sky-800 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50'}`}>{item}</button>)}</div> : <Link className="font-medium text-sky-800 underline" to="/student/internships">← All placements</Link>}
        {!id && tab !== 'My applications' && tab !== 'Web listings' ? <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative lg:col-span-2"><span className="sr-only">Search opportunities</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search title, employer or description" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
          <label><span className="sr-only">Filter by placement type</span><select className={inputClass} value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All placement types</option>{INTERNSHIP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Filter by location</span><input className={inputClass} placeholder="Location" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} /></label>
          <label><span className="sr-only">Filter by industry or academic field</span><input className={inputClass} placeholder="Industry or field" value={filters.industry} onChange={(event) => setFilters({ ...filters, industry: event.target.value })} /></label>
          <label><span className="sr-only">Filter by work arrangement</span><select className={inputClass} value={filters.workMode} onChange={(event) => setFilters({ ...filters, workMode: event.target.value })}><option value="">Any work arrangement</option>{['onsite', 'remote', 'hybrid'].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
          <label><span className="sr-only">Filter by academic programme</span><input className={inputClass} placeholder="Eligible programme" value={filters.academic} onChange={(event) => setFilters({ ...filters, academic: event.target.value })} /></label>
          <label><span className="sr-only">Filter by required skill</span><input className={inputClass} placeholder="Required skill" value={filters.skill} onChange={(event) => setFilters({ ...filters, skill: event.target.value })} /></label>
          <label><span className="sr-only">Filter by education level</span><input className={inputClass} placeholder="Education level" value={filters.education} onChange={(event) => setFilters({ ...filters, education: event.target.value })} /></label>
          <label><span className="sr-only">Filter by study year</span><select className={inputClass} value={filters.studyYear} onChange={(event) => setFilters({ ...filters, studyYear: event.target.value })}><option value="">Any study year</option>{Array.from({ length: 20 }, (_, index) => index + 1).map((year) => <option key={year} value={year}>Year {year}</option>)}</select></label>
          <label><span className="sr-only">Filter by duration</span><select className={inputClass} value={filters.duration} onChange={(event) => setFilters({ ...filters, duration: event.target.value })}><option value="">Any duration</option><option value="short">Under 12 weeks</option><option value="long">12 weeks or longer</option></select></label>
          <label><span className="sr-only">Sort placements</span><select className={inputClass} value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="match">Best match</option><option value="latest">Latest posted</option><option value="deadline">Deadline approaching</option><option value="title">Alphabetical</option></select></label>
          <label><span className="sr-only">Minimum compatibility</span><select className={inputClass} value={filters.minimumScore} onChange={(event) => setFilters({ ...filters, minimumScore: event.target.value })}><option value="">Any compatibility</option><option value="50">50% or higher</option><option value="70">70% or higher</option><option value="85">85% or higher</option></select></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={filters.compensated} onChange={(event) => setFilters({ ...filters, compensated: event.target.checked })} />Compensation recorded</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={filters.eligibleOnly} onChange={(event) => setFilters({ ...filters, eligibleOnly: event.target.checked })} />Meets listed eligibility</label>
        </div> : null}
        {!id && tab !== 'My applications' && tab !== 'Web listings' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <div>
              <p role="status">{tab === 'Browse all' ? 'Showing all available published placements' : 'Showing eligible recommendations'}{activeFilterLabels.length ? ` · ${activeFilterLabels.length} active filter(s)` : ''}.</p>
              {activeFilterLabels.length ? <div className="mt-2 flex flex-wrap gap-2">{activeFilterLabels.map((label) => <Badge key={label} tone="blue">{label}</Badge>)}</div> : null}
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!activeFilterLabels.length} onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Clear filters</Button>
          </div>
        ) : null}
        {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        {error && tab !== 'Web listings' ? <RequestError error={error} fallback="Placements could not be loaded." onRetry={() => setRetry((value) => value + 1)} /> : null}
        {tab === 'Web listings' && !id ? <PublicListings /> : loading ? <div className="grid gap-4 md:grid-cols-2" aria-label="Loading placements"><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /><div className="h-48 animate-pulse rounded-2xl bg-slate-200" /></div> : detailItem ? (
          <OpportunityCard opportunity={detailItem.opportunity} match={detailItem.match} saved={data.savedJobIds.has(detailItem.opportunity.id)} application={activeApplications.get(detailItem.opportunity.id)} onSave={saveOpportunity} onApply={submitApplication} detail />
        ) : visible.length ? (
          <div className="grid gap-4 xl:grid-cols-2">{visible.map(({ opportunity, match, application }) => <OpportunityCard key={opportunity.id} opportunity={opportunity} match={match} saved={data.savedJobIds.has(opportunity.id)} application={application || activeApplications.get(opportunity.id)} onSave={saveOpportunity} onApply={submitApplication} />)}</div>
        ) : id && !error ? (
          <Card className="p-8 text-center">
            <BriefcaseBusiness className="mx-auto text-slate-400" size={28} />
            <p className="mt-3 font-medium text-slate-800">This placement is no longer available or its link is invalid.</p>
            <Link className="mt-4 inline-flex" to="/student/internships"><Button variant="outline">Browse placements</Button></Link>
          </Card>
        ) : !error ? (
          <Card className="p-8 text-center">
            <BriefcaseBusiness className="mx-auto text-slate-400" size={28} />
            <p className="mt-3 font-medium text-slate-800">{tab === 'Saved' ? 'You have no saved placements yet.' : tab === 'My applications' ? 'No placement applications are recorded yet.' : tab === 'Recommended' ? 'No recommended placements currently meet your recorded profile and preferences. Browse all placements or update your profile.' : 'No placements match these filters. Clear filters or adjust your search.'}</p>
            <p className="mt-2 text-sm text-slate-600">This search covers published opportunities currently listed in SkillBridge.</p>
          </Card>
        ) : null}
        {!id && !loading && data?.hasMore && tab !== 'My applications' && tab !== 'Web listings' ? <div className="text-center"><Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading more…' : 'Load more placements'}</Button></div> : null}
      </div>
    </AppShell>
  )
}
