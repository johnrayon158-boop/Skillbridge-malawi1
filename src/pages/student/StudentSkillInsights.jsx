import { BookOpen, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { aiService } from '../../services/aiService'
import { careerService } from '../../services/careerService'
import { jobService } from '../../services/jobService'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { RequestError } from '../../components/ui/RequestState'
import { getRecommendationRows, getSafeResourceUrl, getSkillGapRows } from './skillInsightsViewModel'

const emptyOptions = { careers: [], jobs: [], loading: true, error: '' }

export default function StudentSkillInsights({ userId, mode = 'gaps' }) {
  const [options, setOptions] = useState(emptyOptions)
  const [targetType, setTargetType] = useState('career')
  const [targetId, setTargetId] = useState('')
  const [retry, setRetry] = useState(0)
  const [optionsRetry, setOptionsRetry] = useState(0)
  const [result, setResult] = useState({ key: '', loading: false, gaps: null, recommendations: null, gapError: '', recommendationError: '' })

  useEffect(() => {
    let active = true
    Promise.allSettled([
      careerService.listCareers(),
      jobService.getJobs({ limit: 100, candidateType: 'graduate' }),
    ]).then(([careersResult, jobsResult]) => {
      if (!active) return
      const careers = careersResult.status === 'fulfilled' ? careersResult.value || [] : []
      const jobs = jobsResult.status === 'fulfilled' ? jobsResult.value || [] : []
      const errors = [careersResult, jobsResult]
        .filter((item) => item.status === 'rejected')
        .map((item) => item.reason)
      const initialType = careers.length ? 'career' : 'job'
      setOptions({
        careers,
        jobs,
        loading: false,
        error: careers.length || jobs.length ? null : errors[0],
      })
      setTargetType(initialType)
      setTargetId(careers[0]?.id || jobs[0]?.id || '')
    })
    return () => { active = false }
  }, [optionsRetry])

  const targetOptions = targetType === 'career' ? options.careers : options.jobs

  useEffect(() => {
    if (options.loading || !targetId) return undefined
    let active = true
    const key = `${userId}:${mode}:${targetType}:${targetId}:${retry}`
    const context = targetType === 'job' ? { targetJobId: targetId } : {}
    const careerId = targetType === 'career' ? targetId : undefined

    const gapRequest = mode === 'gaps'
      ? aiService.getSkillsGap(userId, careerId, context)
      : Promise.resolve(null)
    Promise.allSettled([
      gapRequest,
      aiService.getLearningRecommendations(userId, careerId, context),
    ]).then(([gapResult, recommendationResult]) => {
      if (!active) return
      setResult({
        key,
        loading: false,
        gaps: gapResult.status === 'fulfilled' ? gapResult.value : null,
        recommendations: recommendationResult.status === 'fulfilled' ? recommendationResult.value : null,
        gapError: gapResult.status === 'rejected' ? gapResult.reason : null,
        recommendationError: recommendationResult.status === 'rejected' ? recommendationResult.reason : null,
      })
    })
    return () => { active = false }
  }, [mode, options.loading, retry, targetId, targetType, userId])

  const targetName = targetOptions.find((item) => item.id === targetId)?.title
    || targetOptions.find((item) => item.id === targetId)?.name
    || 'selected target'
  const currentResult = result.key === `${userId}:${mode}:${targetType}:${targetId}:${retry}` ? result : null
  const loading = options.loading || Boolean(targetId && (!currentResult || currentResult.loading))
  const gaps = getSkillGapRows(currentResult?.gaps || {})
  const recommendations = getRecommendationRows(currentResult?.recommendations || {})
  const gapError = currentResult?.gapError || ''
  const recommendationError = currentResult?.recommendationError || ''

  const changeTargetType = (event) => {
    const nextType = event.target.value
    const nextOptions = nextType === 'career' ? options.careers : options.jobs
    setTargetType(nextType)
    setTargetId(nextOptions[0]?.id || '')
  }

  return <Card className="space-y-5 p-5 sm:p-6">
    <div>
      <div className="flex items-center gap-2 text-sky-700">
        {mode === 'gaps' ? <Target size={19} aria-hidden="true" /> : <BookOpen size={19} aria-hidden="true" />}
        <h3 className="text-lg font-semibold text-slate-900">{mode === 'gaps' ? 'Skills-gap analysis' : 'Recommended learning for your target'}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Compare your profile skills with target requirements. Assessment results are optional; proficiency comes from the skill levels in your profile.
      </p>
    </div>

    {options.error ? <RequestError error={options.error} fallback="Career and opportunity options could not be loaded." onRetry={() => setOptionsRetry((value) => value + 1)} /> : null}
    {!options.error ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        Target type
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={targetType} onChange={changeTargetType} disabled={options.loading}>
          <option value="career" disabled={!options.careers.length}>Career</option>
          <option value="job" disabled={!options.jobs.length}>Job or internship</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        {targetType === 'career' ? 'Career' : 'Job or internship'}
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={options.loading || !targetOptions.length}>
          {targetOptions.map((item) => <option key={item.id} value={item.id}>{item.title || item.name}</option>)}
        </select>
      </label>
    </div> : null}

    {options.loading || loading ? <div role="status" className="animate-pulse rounded-lg bg-slate-100 p-4 text-sm text-slate-500">{options.loading ? 'Loading careers and published jobs…' : `Analyzing ${targetName} and finding relevant resources…`}</div> : null}
    {!options.loading && !options.error && !targetId ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">There are no published jobs or configured careers to analyze yet.</p> : null}

    {mode === 'gaps' && !loading && gapError ? <RequestError error={gapError} fallback="Skill-gap analysis is temporarily unavailable." kind="ai" onRetry={() => setRetry((value) => value + 1)} /> : null}
    {mode === 'gaps' && !loading && !gapError && currentResult?.gaps ? gaps.length ? <div>
      <h4 className="mb-3 font-semibold text-slate-900">Skills to develop for {targetName}</h4>
      <div className="space-y-3">{gaps.map((gap) => {
        const severity = String(gap.severity || gap.priority || 'medium').toLowerCase()
        const tone = severity === 'high' ? 'red' : severity === 'medium' ? 'amber' : 'blue'
        return <div key={`${gap.name || gap.skill}-${gap.gap}`} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
          <div><h5 className="font-medium text-slate-900">{gap.name || gap.skill}</h5><p className="mt-1 text-sm text-slate-600">Current: {gap.currentLevel || gap.current_level || 'Not assessed'} <span aria-hidden="true">·</span> Required: {gap.requiredLevel || gap.required_level || 'Proficient'}</p></div>
          <div className="flex items-center gap-2"><Badge tone={tone}>{gap.gap === 'missing' ? 'Missing' : 'Insufficient'}</Badge><Badge tone={tone}>{severity} priority</Badge></div>
        </div>
      })}</div>
    </div> : <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No skill gaps were identified for {targetName} based on the skills currently in your profile.</p> : null}

    {!loading && recommendationError ? <RequestError error={recommendationError} fallback="Learning recommendations are temporarily unavailable." kind="ai" onRetry={() => setRetry((value) => value + 1)} /> : null}
    {!loading && !recommendationError && currentResult?.recommendations ? <div>
      <h4 className="mb-3 font-semibold text-slate-900">Learning recommendations</h4>
      {recommendations.length ? <div className="space-y-3">{recommendations.map((item, index) => {
        const url = getSafeResourceUrl(item.resource_url)
        return <div key={item.resource_id || item.id || `${item.skill}-${index}`} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h5 className="font-medium text-slate-900">{item.title || `Practice ${item.skill}`}</h5><p className="mt-1 text-sm text-slate-600">{item.skill}{item.current_level || item.required_level ? ` · ${item.current_level || 'Not assessed'} → ${item.required_level || 'Proficient'}` : ''}</p></div>
            <Badge tone={String(item.severity || item.priority).toLowerCase() === 'high' ? 'red' : 'blue'}>{item.priority || 'Recommended'}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
          {url ? <a className="mt-3 inline-flex items-center font-medium text-sky-800 underline" href={url} target="_blank" rel="noreferrer">Open learning resource</a> : item.resource_id ? <p className="mt-3 text-xs text-slate-500">This resource has no web link yet; find it in the learning resource library.</p> : <p className="mt-3 text-xs text-slate-500">No matching resource is currently available in the library. No external course link has been invented.</p>}
        </div>
      })}</div> : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">No learning recommendations are needed for the skills currently recorded against this target.</p>}
    </div> : null}
  </Card>
}
