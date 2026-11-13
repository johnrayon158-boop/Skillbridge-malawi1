import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, FileSearch, FileText, LoaderCircle, Sparkles, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { RequestError } from '../../components/ui/RequestState'
import { aiService } from '../../services/aiService'
import { careerService } from '../../services/careerService'
import { jobService } from '../../services/jobService'
import { portfolioService } from '../../services/portfolioService'
import { studentService } from '../../services/studentService'

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
const EMPTY_JOBS = []
const targetLabels = {
  career: 'Career',
  job: 'Job',
  internship: 'Internship',
  career_goal: 'My target occupation',
}
const scoreLabels = {
  skills: 'Skills match',
  education: 'Education match',
  experience: 'Experience evidence',
  projects: 'Project evidence',
  cvCompleteness: 'CV completeness',
}

function ResultList({ title, items, emptyText }) {
  return (
    <section>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {items?.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      )}
    </section>
  )
}

function DetailSection({ title, details }) {
  const entries = Object.entries(details || {}).filter(([, value]) => typeof value === 'string' && value)
  if (!entries.length) return null
  return (
    <section>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt>
            <dd className="mt-1 text-sm leading-6 text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function CvPortfolioAnalyzerPage() {
  const { user } = useAuth()
  const [targetType, setTargetType] = useState('career')
  const [targetId, setTargetId] = useState('')
  const [candidateType, setCandidateType] = useState('student')
  const [targetRole, setTargetRole] = useState('')
  const [careers, setCareers] = useState([])
  const [jobData, setJobData] = useState({ query: '', jobs: [] })
  const [documents, setDocuments] = useState([])
  const [analyses, setAnalyses] = useState([])
  const [portfolioSummary, setPortfolioSummary] = useState(null)
  const [documentId, setDocumentId] = useState('')
  const [includePortfolio, setIncludePortfolio] = useState(true)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState(null)
  const [historyError, setHistoryError] = useState(null)
  const [dataErrors, setDataErrors] = useState({})
  const [initialRetry, setInitialRetry] = useState(0)
  const [jobsRetry, setJobsRetry] = useState(0)

  useEffect(() => {
    let active = true
    const loadInitialData = async () => {
      setLoading(true)
      setDataErrors({})
      setHistoryError(null)
      const [profileResult, careerResult, portfolioResult, historyResult] = await Promise.allSettled([
        studentService.getProfile(user.id),
        careerService.listCareers(),
        portfolioService.getOverview(user.id),
        aiService.getCvAnalysisHistory(),
      ])
      if (!active) return

      if (profileResult.status === 'fulfilled') {
        const profile = profileResult.value
        const student = Array.isArray(profile.student_profiles) ? profile.student_profiles[0] : profile.student_profiles
        setTargetRole(student?.target_role || '')
        setCandidateType(student?.candidate_type || 'student')
      } else setDataErrors((current) => ({ ...current, profile: profileResult.reason }))
      if (careerResult.status === 'fulfilled') setCareers(careerResult.value)
      else setDataErrors((current) => ({ ...current, careers: careerResult.reason }))
      if (portfolioResult.status === 'fulfilled') {
        setPortfolioSummary({
          projects: portfolioResult.value.projects || [],
          certificates: portfolioResult.value.certificates || [],
        })
      } else setDataErrors((current) => ({ ...current, portfolio: portfolioResult.reason }))
      if (historyResult.status === 'fulfilled') {
        setDocuments(historyResult.value.documents || [])
        setAnalyses(historyResult.value.analyses || [])
        if (historyResult.value.documents?.length) setDocumentId(historyResult.value.documents[0].id)
        if (historyResult.value.analyses?.length) {
          const latest = historyResult.value.analyses[0]
          setResult(latest.analysis_result)
          setTargetType(latest.target_type || 'career')
          setTargetId(latest.analysis_result?.target?.id || '')
          if (!historyResult.value.documents?.length && latest.document_id) setDocumentId(latest.document_id)
        }
      } else {
        setDataErrors((current) => ({ ...current, history: historyResult.reason }))
      }
      setLoading(false)
    }

    loadInitialData()
    return () => { active = false }
  }, [initialRetry, user.id])

  const jobsQuery = `${candidateType}:${targetType}:${jobsRetry}`
  const loadingTargets = (targetType === 'job' || targetType === 'internship')
    && jobData.query !== jobsQuery
  const jobs = jobData.query === jobsQuery ? jobData.jobs : EMPTY_JOBS

  useEffect(() => {
    if (targetType !== 'job' && targetType !== 'internship') {
      return undefined
    }

    let active = true
    jobService.getJobs({
      candidateType,
      employmentType: targetType === 'internship' ? 'internship' : '',
      limit: 100,
    })
      .then((loadedJobs) => {
        if (!active) return
        setJobData({ query: jobsQuery, jobs: loadedJobs })
        setDataErrors((current) => ({ ...current, jobs: '' }))
      })
      .catch((loadError) => {
        if (!active) return
        setJobData({ query: jobsQuery, jobs: [] })
        setDataErrors((current) => ({ ...current, jobs: loadError }))
      })
    return () => { active = false }
  }, [jobsQuery, candidateType, targetType])

  const targetOptions = useMemo(() => {
    if (targetType === 'career') return careers.map((career) => ({ id: career.id, label: career.title }))
    if (targetType === 'job' || targetType === 'internship') {
      if (loadingTargets) return []
      return jobs.map((job) => ({
        id: job.id,
        label: `${job.title} — ${job.employer_profiles?.company_name || 'Employer'} · ${job.location || 'Location not listed'}`,
      }))
    }
    return []
  }, [careers, jobs, loadingTargets, targetType])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    setRequestError(null)
    setDataErrors((current) => ({ ...current, history: '' }))
    try {
      const document = await aiService.uploadCvDocument(user.id, file)
      setDocuments((current) => [document, ...current])
      setDocumentId(document.id)
      setResult(null)
    } catch (uploadError) {
      setRequestError({ error: uploadError })
    } finally {
      setUploading(false)
    }
  }

  const handleAnalyze = async (event) => {
    event.preventDefault()
    if (!documentId) {
      setError('Upload a CV or select one from your CV library before analyzing.')
      return
    }
    if ((targetType === 'career' || targetType === 'job' || targetType === 'internship') && !targetId) {
      setError(`Select a SkillBridge ${targetLabels[targetType].toLowerCase()} to analyze against.`)
      return
    }
    setAnalyzing(true)
    setError('')
    setRequestError(null)
    setHistoryError('')
    try {
      const analysis = await aiService.analyzeCv({
        documentId,
        targetType,
        targetId: targetId || null,
        includePortfolio,
      })
      setResult(analysis)
      setDocumentId(analysis.documentId || documentId)
      try {
        const history = await aiService.getCvAnalysisHistory()
        setDocuments(history.documents || [])
        setAnalyses(history.analyses || [])
        setDataErrors((current) => ({ ...current, history: '' }))
      } catch (refreshError) {
        setHistoryError(refreshError)
      }
    } catch (analysisError) {
      setRequestError({ error: analysisError, kind: 'ai' })
    } finally {
      setAnalyzing(false)
    }
  }

  const selectAnalysis = (analysis) => {
    setResult(analysis.analysis_result)
    setDocumentId(analysis.document_id)
    setTargetType(analysis.target_type)
    setTargetId(analysis.analysis_result?.target?.id || '')
    setError('')
    setHistoryError('')
  }

  const scoreEntries = Object.entries(result?.scoreBreakdown || {}).filter(([, value]) => Number.isFinite(value))
  const selectedDocument = documents.find((document) => document.id === documentId)

  return (
    <AppShell title="CV & Portfolio Analyzer" subtitle="Compare your CV and SkillBridge portfolio with real career and job requirements.">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="p-5 sm:p-7">
          <form onSubmit={handleAnalyze} className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-800"><FileSearch size={22} aria-hidden="true" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Analyze your CV against a target</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Your file stays private to your account. SkillBridge extracts the text securely and does not store the extracted CV text in analysis history.</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="cv-target-type" className="mb-2 block text-sm font-semibold text-slate-800">1. Analysis target</label>
                <select id="cv-target-type" className={inputClass} value={targetType} onChange={(event) => { setTargetType(event.target.value); setTargetId(''); setResult(null); setError('') }}>
                  {Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {targetType === 'career' || targetType === 'job' || targetType === 'internship' ? (
                  <select
                    id="cv-target"
                    aria-label={`Select ${targetLabels[targetType].toLowerCase()}`}
                    className={`${inputClass} mt-3`}
                    value={targetId}
                    onChange={(event) => { setTargetId(event.target.value); setResult(null); setError('') }}
                    disabled={loading || loadingTargets}
                  >
                    <option value="">{loadingTargets ? 'Loading SkillBridge opportunities…' : `Select a ${targetLabels[targetType].toLowerCase()}`}</option>
                    {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    {targetRole || 'No target occupation is saved on your profile yet.'}
                    {!targetRole ? <Link to="/student/profile" className="ml-2 font-semibold text-sky-700">Add one</Link> : null}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="cv-existing" className="mb-2 block text-sm font-semibold text-slate-800">2. Select a saved CV</label>
                <div className="flex gap-2">
                  <select id="cv-existing" className={inputClass} value={documentId} onChange={(event) => { setDocumentId(event.target.value); setResult(null); setError('') }} disabled={loading}>
                    <option value="">Choose an existing CV</option>
                    {documents.map((document) => <option key={document.id} value={document.id}>{document.original_filename} · {document.created_at ? new Date(document.created_at).toLocaleDateString() : 'date unavailable'}</option>)}
                  </select>
                  <label className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                    {uploading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={17} aria-hidden="true" />}
                    <span className="hidden sm:inline">{uploading ? 'Uploading' : 'Upload CV'}</span>
                    <input className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleUpload} disabled={uploading} aria-label="Upload a PDF or DOCX CV" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">PDF or DOCX · maximum 10 MB · private to your account</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-700" checked={includePortfolio} onChange={(event) => { setIncludePortfolio(event.target.checked); setResult(null) }} />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Use my SkillBridge portfolio</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {portfolioSummary
                      ? `${portfolioSummary.projects.length} project(s) and ${portfolioSummary.certificates.length} certificate(s) will be considered.`
                      : 'Your existing SkillBridge projects and certificates will be included when available.'}
                  </span>
                </span>
              </label>
              {dataErrors.portfolio ? <div className="ml-7 mt-2"><RequestError error={dataErrors.portfolio} fallback="Your portfolio evidence could not be loaded." onRetry={() => setInitialRetry((count) => count + 1)} /></div> : null}
              {includePortfolio && portfolioSummary && !portfolioSummary.projects.length ? (
                <p className="ml-7 mt-2 text-xs text-amber-700">Add projects to your <Link to="/student/portfolio" className="font-semibold underline">SkillBridge portfolio</Link> for stronger evidence analysis.</p>
              ) : null}
            </div>

            {Object.entries(dataErrors).filter(([key]) => key !== 'portfolio' && key !== 'history' && key !== 'jobs').map(([key, loadError]) => (
              <RequestError key={key} error={loadError} fallback={key === 'profile' ? 'Your profile details could not be loaded.' : 'SkillBridge careers could not be loaded.'} onRetry={() => setInitialRetry((count) => count + 1)} />
            ))}
            {dataErrors.history ? <RequestError error={dataErrors.history} fallback="Your saved CV library could not be loaded. You can still upload a CV." onRetry={() => setInitialRetry((count) => count + 1)} /> : null}
            {dataErrors.jobs && (targetType === 'job' || targetType === 'internship') ? <RequestError error={dataErrors.jobs} fallback="SkillBridge opportunities could not be loaded." onRetry={() => setJobsRetry((count) => count + 1)} /> : null}
            {(targetType === 'job' || targetType === 'internship') && !loadingTargets && !dataErrors.jobs && !targetOptions.length ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No published {targetType === 'internship' ? 'internships' : 'jobs'} are currently available to analyze.</p> : null}
            {error ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
            {requestError ? <RequestError error={requestError.error} kind={requestError.kind} fallback="We could not complete the request." /> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={analyzing || uploading || loading || loadingTargets || !documentId || ((targetType === 'career' || targetType === 'job' || targetType === 'internship') && !targetId) || Boolean(dataErrors.careers && targetType === 'career')} className="w-full justify-center sm:w-auto">
              {analyzing ? <><LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> Analyzing your CV and portfolio…</> : 'Analyze CV & Portfolio'}
            </Button>
            {selectedDocument ? <span className="text-xs text-slate-500">Selected CV: <strong className="font-semibold text-slate-700">{selectedDocument.original_filename}</strong></span> : null}
            </div>
            <p role="status" aria-live="polite" className="text-xs text-slate-500">{analyzing ? 'Extracting document text and comparing real SkillBridge evidence with your target.' : ''}</p>
          </form>
        </Card>

        {result ? (
          <div className="space-y-6">
            <Card className="p-5 sm:p-7">
              <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-center">
                <div className="flex flex-col items-center justify-center rounded-2xl bg-sky-50 p-6 text-center">
                  <div className="flex items-center gap-2 text-sky-800"><Sparkles size={15} aria-hidden="true" /><p className="text-xs font-bold uppercase tracking-widest">Evidence compatibility</p></div>
                  <p className="mt-2 text-6xl font-bold text-sky-900">{result.score}%</p>
                  <p className="mt-2 text-xs text-slate-600">Evidence match only — not a probability of employment.</p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700">{targetLabels[result.target?.type] || 'Target'}: {result.target?.title}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"><CheckCircle2 size={13} /> Analysis complete</span>
                    {result.status === 'fallback' ? <span role="status" className="text-xs text-amber-800">AI feedback unavailable; deterministic evidence guidance is shown.</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Based on {result.filename || selectedDocument?.original_filename || 'your saved CV'}{result.createdAt ? ` · ${new Date(result.createdAt).toLocaleString()}` : ''}</p>
                  <p className="mt-2 leading-7 text-slate-700">{result.summary}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {scoreEntries.map(([key, value]) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between gap-3 text-sm"><span className="text-slate-700">{scoreLabels[key] || key}</span><span className="font-semibold text-slate-900">{value}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={scoreLabels[key] || key} aria-valuenow={value} aria-valuemin="0" aria-valuemax="100">
                          <div className="h-full rounded-full bg-sky-600" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">{result.scoreBasis?.scoreMethod}</p>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-6 p-5 sm:p-6">
                <ResultList title="Strengths" items={result.strengths} emptyText="No specific strengths were verified in the available evidence." />
                <ResultList title="Areas to improve" items={result.weaknesses} emptyText="No additional weaknesses were identified." />
                <ResultList title="Missing or unverified skills" items={result.missingSkills} emptyText="All listed target skills have some supporting evidence." />
                {result.missingSkills?.length ? <Link to="/student/skills/gaps" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700">View my existing Skills Gap Analysis <ArrowRight size={15} /></Link> : null}
              </Card>
              <Card className="space-y-6 p-5 sm:p-6">
                <DetailSection title="CV analysis" details={result.cvAnalysis} />
                <DetailSection title="Portfolio analysis" details={result.portfolioAnalysis} />
              </Card>
            </div>

            <Card className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
              <ResultList title="Missing CV content" items={result.missingCvContent} emptyText="No specific missing CV sections were identified." />
              <ResultList title="Missing portfolio evidence" items={result.missingPortfolioEvidence} emptyText="No specific portfolio evidence gaps were identified." />
              <ResultList title="CV improvements" items={result.cvImprovements} emptyText="No further CV edits suggested." />
              <ResultList title="Portfolio improvements" items={result.portfolioImprovements} emptyText="No further portfolio edits suggested." />
            </Card>

            <Card className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
              <section>
                <h3 className="font-semibold text-slate-900">Priority actions</h3>
                <ol className="mt-3 space-y-3">
                  {(result.priorityActions || []).map((action, index) => (
                    <li key={`${index}-${action.title}`} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-sky-800">{action.priority} priority</p>
                      <p className="mt-1 font-semibold text-slate-800">{action.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
                    </li>
                  ))}
                  {!result.priorityActions?.length ? <li className="text-sm text-slate-500">No priority actions returned.</li> : null}
                </ol>
              </section>
              <div className="space-y-6">
                <ResultList title="Your improvement plan" items={result.actionPlan} emptyText="No action plan was returned." />
                <div className="flex flex-wrap gap-3">
                  <Link to="/student/career"><Button variant="outline">Career recommendations</Button></Link>
                  <Link to="/student/jobs"><Button variant="outline">Find matching jobs</Button></Link>
                  <Link to="/student/learning"><Button variant="outline">Explore learning</Button></Link>
                </div>
                <Button type="button" onClick={() => { setResult(null); setError('') }}>Analyze again</Button>
              </div>
            </Card>
          </div>
        ) : null}

        <Card className="p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2"><FileText size={18} className="text-sky-700" /><h2 className="font-semibold text-slate-900">Analysis history</h2></div>
          <p className="mb-4 text-sm text-slate-600">Reopen a saved analysis to review its score and recommendations.</p>
          {historyError ? <div className="mb-3"><RequestError error={historyError} fallback="Analysis completed, but saved history could not be refreshed." onRetry={() => setInitialRetry((count) => count + 1)} /></div> : null}
          {analyses.length ? (
            <ul className="divide-y divide-slate-100">
              {analyses.map((analysis) => (
                <li key={analysis.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{analysis.target_title}</p>
                    <p className="mt-1 text-xs text-slate-500">{analysis.original_filename} · {analysis.created_at ? new Date(analysis.created_at).toLocaleString() : 'date unavailable'}</p>
                  </div>
                  <div className="flex items-center gap-3"><span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">{analysis.compatibility_score}%</span><Button type="button" variant="outline" size="sm" onClick={() => selectAnalysis(analysis)}>View analysis</Button></div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
              <FileSearch size={22} className="mx-auto text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-800">{loading ? 'Loading your saved analyses…' : 'No saved analyses yet'}</p>
              <p className="mt-1 text-sm text-slate-600">{loading ? 'Your analysis history will appear here.' : 'Choose a CV and target above to get evidence-based feedback.'}</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  )
}
