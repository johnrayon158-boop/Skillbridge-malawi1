import { ArrowRight, BriefcaseBusiness, ChartColumnBig, Gauge, MessageSquareText, Sparkles, Target, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { RequestError } from '../../components/ui/RequestState'
import { aiService } from '../../services/aiService'
import { assessmentService } from '../../services/assessmentService'
import { applicationService } from '../../services/applicationService'
import { careerService } from '../../services/careerService'
import { jobService } from '../../services/jobService'
import { skillService } from '../../services/skillService'
import { studentService } from '../../services/studentService'

function EmptyState({ children }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">{children}</div>
}

function SectionHeader({ title, description, icon: Icon }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="rounded-xl bg-sky-50 p-2 text-sky-700"><Icon size={18} /></div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>
  )
}

function InterviewPrepView({ userId }) {
  const { jobId } = useParams()
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(jobId || '')
  const [prep, setPrep] = useState(null)
  const [practice, setPractice] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    Promise.all([
      jobService.getJobs(),
      applicationService.getApplications(userId),
      studentService.getDashboard(userId),
    ])
      .then(([jobList, applications, dashboard]) => {
        if (!active) return
        const sourceJobs = jobList.length ? jobList : []
        const applicationJobs = applications.map((app) => app.jobs).filter(Boolean)
        const combined = [...sourceJobs, ...applicationJobs]
        const unique = combined.filter((job, index, array) => array.findIndex((entry) => entry?.id === job?.id) === index)
        setJobs(unique)
        const first = jobId || unique[0]?.id || ''
        setSelectedJobId(first)
        if (first) {
          const contextualSkills = dashboard?.skills || []
          const userSkills = contextualSkills.map((item) => item?.skills?.name || item?.name || item?.skill_name).filter(Boolean)
          const skillData = userSkills.length ? userSkills : ['communication', 'problem solving']
          aiService.getInterviewPreparation(userId, { jobId: first, candidateSkills: skillData, jobRequirements: unique.find((job) => job.id === first) || {} })
            .then((result) => setPrep(result))
            .catch(() => setPrep(null))
        }
      })
      .catch(() => setJobs([]))
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [jobId, userId])

  const selectedJob = useMemo(() => jobs.find((job) => String(job.id) === String(selectedJobId)) || jobs[0], [jobs, selectedJobId])

  useEffect(() => {
    if (!selectedJob || !selectedJob.id) return

    const skillLabel = selectedJob.job_skills?.map((skill) => skill?.skills?.name || skill?.name || '').filter(Boolean) || []
    aiService.getInterviewPreparation(userId, {
      jobId: selectedJob.id,
      candidateSkills: skillLabel.length ? skillLabel : ['communication', 'problem solving'],
      jobRequirements: selectedJob,
    })
      .then((result) => setPrep(result))
      .catch(() => setPrep(null))
      .finally(() => setLoading(false))
  }, [selectedJob, userId])

  const submitPractice = async () => {
    if (!practice.trim()) return
    const result = await aiService.submitInterviewFeedback({
      studentId: userId,
      jobId: selectedJob?.id,
      question: prep?.technicalQuestions?.[0]?.question || 'Tell us about a recent project and the results.',
      answer: practice,
      skill: prep?.requiredSkills?.[0] || 'job preparedness',
    })
    setFeedback(result)
  }

  if (loading && !prep) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Interview prep</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">Practice for realistic interview scenarios</h2>
        </div>
        <Link to="/student/jobs" className="inline-flex items-center text-sm font-semibold text-sky-700"><ArrowRight size={15} className="mr-1" />Explore jobs</Link>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Current focus</p>
            <h3 className="text-xl font-semibold text-slate-900">{selectedJob?.title || 'Select a role'}</h3>
          </div>
          <select
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
          >
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </div>
      </Card>

      {prep ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <SectionHeader title="Preparation summary" description="AI-generated guidance based on your skills and role requirements." icon={Sparkles} />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Readiness score</span>
                  <strong className="text-2xl font-bold text-slate-900">{prep.readinessScore || 0}%</strong>
                </div>
                <ProgressBar value={prep.readinessScore || 0} tone="blue" />
                <p className="text-sm leading-6 text-slate-600">{prep.summary}</p>
                <div className="flex flex-wrap gap-2">
                  {(prep.requiredSkills || []).slice(0, 5).map((skill) => <Badge key={skill} tone="blue">{skill}</Badge>)}
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Ready-to-practice checklist" description="Prioritize these core areas before the interview." icon={Target} />
              <ul className="space-y-3 text-sm text-slate-600">
                {(prep.revisionTopics || []).slice(0, 5).map((topic) => <li key={topic} className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-sky-600" />{topic}</li>)}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-5">
              <SectionHeader title="Interview questions" description="A mix of technical, behavioural and role-specific prompts." icon={MessageSquareText} />
              <div className="space-y-4">
                {(prep.technicalQuestions || []).slice(0, 3).map((question, index) => (
                  <div key={question.id || `${question.skill}-${index}`} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">{question.category}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{question.question}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Practice response" description="Draft an answer and get instant feedback." icon={Gauge} />
              <textarea
                value={practice}
                onChange={(event) => setPractice(event.target.value)}
                placeholder="Write a concise answer using the STAR format."
                className="min-h-32 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-sky-400"
              />
              <div className="mt-4 flex justify-end"><Button onClick={submitPractice}>Get feedback</Button></div>
              {feedback ? (
                <div className="mt-4 rounded-xl bg-sky-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{feedback.label}</p>
                  <p className="mt-2">Overall score: <strong>{feedback.scores?.overall || 0}%</strong></p>
                  <p className="mt-2">{feedback.suggestedImprovement}</p>
                </div>
              ) : null}
            </Card>
          </div>
        </>
      ) : (
        <EmptyState>Job data is not available yet, so interview preparation cannot be generated until a role is published.</EmptyState>
      )}
    </div>
  )
}

function EvidenceGraphView({ userId }) {
  const [graphState, setGraphState] = useState({ requestKey: '', graph: null, error: '' })
  const [retry, setRetry] = useState(0)
  const requestKey = `${userId}:${retry}`
  const loading = graphState.requestKey !== requestKey
  const graph = loading ? null : graphState.graph
  const error = loading ? '' : graphState.error

  useEffect(() => {
    let active = true
    aiService.getEvidenceGraph(userId)
      .then((result) => {
        if (active) setGraphState({ requestKey, graph: result, error: '' })
      })
      .catch((loadError) => {
        if (active) setGraphState({ requestKey, graph: null, error: loadError })
      })

    return () => { active = false }
  }, [requestKey, userId])

  const evidence = Array.isArray(graph?.skills) ? graph.skills : []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Evidence trust</p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900">Competency evidence graph</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {loading ? <div className="h-48 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading competency evidence" />
          : error ? <div className="lg:col-span-2"><RequestError error={error} fallback="We could not load competency evidence." kind="ai" onRetry={() => setRetry((value) => value + 1)} /></div>
            : !evidence.length ? <div className="lg:col-span-2"><EmptyState>No skills or supporting evidence are recorded yet. Add skills to your profile and link assessments or portfolio items as you build your evidence.</EmptyState></div>
              : evidence.map((entry) => {
                const score = entry.trust?.score
                const tone = score === null || score === undefined ? 'amber' : score >= 75 ? 'green' : score >= 50 ? 'blue' : 'amber'
                return (
          <Card key={entry.skillName} className="p-5">
            <SectionHeader title={entry.skillName} description={`${entry.evidence.length} evidence records`} icon={ChartColumnBig} />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Trust score</span>
              <Badge tone={tone}>{score === null || score === undefined ? 'Not scored' : `${score}%`}</Badge>
            </div>
            {score !== null && score !== undefined ? <ProgressBar value={score} tone={tone === 'green' ? 'green' : 'blue'} /> : <p className="text-sm text-slate-600">{entry.trust?.label || 'Supporting evidence only'}</p>}
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {entry.evidence.map((item, index) => (
                <li key={`${entry.skillName}-${item.type}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3"><span className="font-medium capitalize">{String(item.type || 'Evidence').replaceAll('_', ' ')}</span><span>{item.score === null || item.score === undefined ? item.evidenceStatus?.replaceAll('_', ' ') || 'Supporting only' : `${item.score}%`}</span></div>
                  {item.title ? <p className="mt-1 text-xs text-slate-500">{item.title}</p> : null}
                </li>
              ))}
            </ul>
            {entry.trust?.reasons?.length ? <p className="mt-3 text-xs leading-5 text-slate-500">{entry.trust.reasons.join(' ')}</p> : null}
          </Card>
                )
              })}
      </div>
    </div>
  )
}

function CareerDecisionSimulatorView({ userId }) {
  const [careers, setCareers] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [selected, setSelected] = useState([])
  const [scenario, setScenario] = useState('Improve my technical confidence and add evidence for project delivery.')

  useEffect(() => {
    let active = true
    Promise.all([
      careerService.listCareers(),
      studentService.getDashboard(userId),
    ])
      .then(([careerList, profileData]) => {
        if (!active) {
          return
        }
        setCareers(careerList)
        setDashboard(profileData)
        setSelected(careerList.slice(0, 3).map((entry) => entry.id))
      })
      .catch(() => {})

    return () => { active = false }
  }, [userId])

  const simulatedCareers = useMemo(() => {
    if (!careers.length) return []
    const skillCount = Array.isArray(dashboard?.skills) ? dashboard.skills.length : 0
    return careers
      .filter((career) => selected.includes(career.id))
      .map((career, index) => {
        const base = 50 + (skillCount * 6) + index * 8
        const scenarioBoost = scenario.toLowerCase().includes('project') ? 8 : 0
        const projected = Math.min(98, base + scenarioBoost)
        return {
          ...career,
          currentScore: Math.min(98, Math.max(38, base - 8)),
          projectedScore: projected,
          insight: `${career.title} becomes more attractive when the student adds portfolio evidence and improves practical confidence.`,
        }
      })
  }, [careers, dashboard, scenario, selected])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Career simulation</p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900">Evaluate realistic decision scenarios</h2>
      </div>

      <Card className="p-5">
        <SectionHeader title="Decision scenario" description="Illustrative profile scenario only—not an employment forecast or national statistic." icon={TrendingUp} />
        <textarea
          value={scenario}
          onChange={(event) => setScenario(event.target.value)}
          className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {simulatedCareers.map((career) => (
          <Card key={career.id} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{career.title}</h3>
              <Badge tone="green">{career.currentScore}%</Badge>
            </div>
            <p className="text-sm leading-6 text-slate-600">{career.insight}</p>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Now</span><span>{career.currentScore}%</span></div>
                <ProgressBar value={career.currentScore} tone="blue" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Illustrative scenario</span><span>{career.projectedScore}%</span></div>
                <ProgressBar value={career.projectedScore} tone="green" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function JobReadinessView({ userId }) {
  const { id } = useParams()
  const [result, setResult] = useState({ key: '', job: null, readiness: null, error: '' })
  const [retryCount, setRetryCount] = useState(0)
  const requestKey = `${id}:${userId}:${retryCount}`
  const loading = result.key !== requestKey

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const profile = await studentService.getProfile(userId)
        const candidateType = Array.isArray(profile.student_profiles) ? profile.student_profiles[0]?.candidate_type : profile.student_profiles?.candidate_type
        const [job, skills, assessments] = await Promise.all([
          id ? jobService.getJob(id, candidateType === 'graduate' ? 'graduate' : 'student') : Promise.resolve(null),
          skillService.getSkillProfile(userId),
          assessmentService.getResults(userId),
        ])
        const candidateSkills = skills.map((item) => item?.skills?.name || item?.name || '').filter(Boolean)
        const requiredSkills = (job?.job_skills || []).map((item) => item?.skills?.name || item?.name || '').filter(Boolean)
        const candidateSkillSet = new Set(candidateSkills.map((skill) => skill.toLowerCase()))
        const matchedSkills = requiredSkills.filter((skill) => candidateSkillSet.has(skill.toLowerCase()))
        const missingSkills = requiredSkills.filter((skill) => !candidateSkillSet.has(skill.toLowerCase()))
        const completedAssessments = assessments.filter((assessment) => assessment.completed_at || assessment.percentage !== null)
        const assessmentAverage = completedAssessments.length
          ? Math.round(completedAssessments.reduce((total, assessment) => total + Number(assessment.percentage ?? assessment.score ?? 0), 0) / completedAssessments.length)
          : null
        if (active) setResult({
          key: requestKey,
          job,
          readiness: { matchedSkills, missingSkills, requiredSkills, candidateSkills, assessmentAverage, assessmentCount: completedAssessments.length },
          error: '',
        })
      } catch (error) {
        if (active) setResult({ key: requestKey, job: null, readiness: null, error })
      }
    }
    void load()

    return () => { active = false }
  }, [id, requestKey, userId])

  const { job, readiness, error } = result

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Job readiness</p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900">Measure your fit for the role</h2>
      </div>

      {loading ? <div className="grid gap-6 lg:grid-cols-2" aria-label="Loading job readiness"><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /></div> : error ? (
        <RequestError error={error} fallback="We could not load readiness for this opportunity." onRetry={() => setRetryCount((count) => count + 1)} />
      ) : readiness ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeader title={job?.title || 'Role readiness'} description={`${job?.employer_profiles?.company_name || 'Published opportunity'} · ${job?.location || 'Location not listed'}`} icon={BriefcaseBusiness} />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">Required-skills match</span>
              <strong className="text-3xl font-bold text-slate-900">{readiness.requiredSkills.length ? `${Math.round((readiness.matchedSkills.length / readiness.requiredSkills.length) * 100)}%` : 'N/A'}</strong>
            </div>
            {readiness.requiredSkills.length ? <ProgressBar value={(readiness.matchedSkills.length / readiness.requiredSkills.length) * 100} tone="green" /> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">This listing does not specify skills, so a skill-match percentage cannot be calculated.</p>}
            <p className="mt-4 text-sm text-slate-600">Your profile matches {readiness.matchedSkills.length} of {readiness.requiredSkills.length} listed skills. This is a skills comparison, not an overall hiring prediction.</p>
            {readiness.assessmentCount ? <p className="mt-2 text-sm text-slate-600">Assessment average: {readiness.assessmentAverage}% across {readiness.assessmentCount} completed assessment(s).</p> : <Link to="/student/assessments" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Complete an assessment<ArrowRight size={14} /></Link>}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Skills to develop" description="Listed role requirements not yet in your skills profile." icon={Target} />
            {readiness.missingSkills.length ? <ul className="space-y-3 text-sm text-slate-600">{readiness.missingSkills.map((skill) => <li key={skill} className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />{skill}</li>)}</ul> : readiness.requiredSkills.length ? <p className="text-sm leading-6 text-slate-600">All listed role skills are in your profile. Keep your evidence up to date and prepare to discuss examples in an interview.</p> : <p className="text-sm leading-6 text-slate-600">No required skills were listed for this opportunity. Review the <Link to="/student/jobs" className="font-semibold text-sky-700">job details</Link> and keep your skills profile up to date.</p>}
            <Link to="/student/skills" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Review your skills<ArrowRight size={14} /></Link>
          </Card>
        </div>
      ) : <EmptyState>The selected opportunity is unavailable. It may have closed or expired.</EmptyState>}
    </div>
  )
}

export default function AdvancedCareerIntelligence({ mode, userId }) {
  if (mode === 'interview-prep') return <InterviewPrepView userId={userId} />
  if (mode === 'evidence') return <EvidenceGraphView userId={userId} />
  if (mode === 'simulator') return <CareerDecisionSimulatorView userId={userId} />
  if (mode === 'readiness') return <JobReadinessView userId={userId} />

  return <CareerDecisionSimulatorView userId={userId} />
}
