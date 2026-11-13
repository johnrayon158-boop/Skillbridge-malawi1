import { ArrowRight, BriefcaseBusiness, CalendarDays, GraduationCap, Search, Target, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { studentService } from '../../services/studentService'
import { calculateStudentProfileCompletion } from '../../utils/educationValidation'
import { calculateStudentDashboardMetrics } from '../../utils/studentDashboardMetrics'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ProgressBar } from '../ui/ProgressBar'
import { LastUpdated, RequestError } from '../ui/RequestState'
import { StudentJourney } from '../student/StudentJourney'

function LoadingBlock() {
  return <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
}

function EmptyState({ children, to, action }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">{children}{to ? <Link to={to} className="mt-3 inline-flex font-semibold text-sky-700">{action} <ArrowRight size={15} className="ml-1" /></Link> : null}</div>
}

export function StudentDashboard() {
  const { user, profile } = useAuth()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const initialStudentProfile = Array.isArray(profile?.student_profiles) ? profile.student_profiles[0] : profile?.student_profiles
  const [candidateType, setCandidateType] = useState(initialStudentProfile?.candidate_type || 'student')
  const [savingCandidateType, setSavingCandidateType] = useState(false)

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return null
      setLoading(true)
      setLoadError('')
      return studentService.getDashboard(user.id, profile, candidateType)
    }).then((result) => {
      if (!active || !result) return
      setData(result)
      setUpdatedAt(new Date())
    }).catch((loadError) => {
      if (active) setLoadError(loadError)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [user.id, profile, candidateType, retry])

  const changeCandidateType = async (nextCandidateType) => {
    setSavingCandidateType(true)
    setActionError('')
    try {
      const savedProfile = await studentService.saveStudentProfile(user.id, { candidate_type: nextCandidateType })
      setCandidateType(savedProfile.candidate_type)
      setData((current) => {
        if (!current) return current
        const studentProfiles = current.profile?.student_profiles
        const updatedStudentProfiles = Array.isArray(studentProfiles)
          ? studentProfiles.map((item) => item.id === savedProfile.id ? { ...item, ...savedProfile } : item)
          : { ...studentProfiles, ...savedProfile }
        return { ...current, profile: { ...current.profile, student_profiles: updatedStudentProfiles } }
      })
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to update your student or graduate status.')
    } finally {
      setSavingCandidateType(false)
    }
  }

  if (loading && !data) return <div className="space-y-6" aria-label="Loading dashboard"><LoadingBlock /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><LoadingBlock /><LoadingBlock /><LoadingBlock /><LoadingBlock /></div></div>
  if (loadError && !data) return <RequestError error={loadError} fallback="We could not load your dashboard." onRetry={() => setRetry((count) => count + 1)} />
  if (!data) return null

  const student = Array.isArray(data.profile?.student_profiles) ? data.profile.student_profiles[0] : data.profile?.student_profiles
  const readiness = data.careerProgress?.[0]
  const name = profile?.full_name || data.profile?.full_name || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const skills = data.skills || []
  const applications = data.applications || []
  const interviews = data.interviews || []
  const { percentage: profileCompletion } = calculateStudentProfileCompletion({
    fullName: data.profile?.full_name,
    phone: student?.phone,
    bio: student?.bio,
    targetRole: student?.target_role,
    interests: student?.interests,
    institution: student?.institution,
    programme: student?.programme,
    educationLevel: student?.education_level,
    educationRecords: data.education,
  })
  const currentStage = Number.isFinite(readiness?.readiness_score)
    ? readiness.readiness_score >= 80 ? 6 : readiness.readiness_score >= 50 ? 4 : 2
    : 0
  const stats = calculateStudentDashboardMetrics({
    profileCompletion,
    readiness,
    readinessUnavailable: Boolean(data.readinessWarnings?.length),
    skills,
    projects: data.projects || [],
    certificates: data.certificates || [],
    applications,
    upcomingInterviewCount: data.interviewCount,
    recommendations: data.recommendations || [],
    learningProgress: data.learningProgress || [],
  })
  const activities = [
    ...interviews.map((item) => ({ title: item.applications?.jobs?.title ? `Interview · ${item.applications.jobs.title}` : 'Interview', date: item.scheduled_at, icon: CalendarDays })),
    ...(data.reminders || []).map((item) => ({ title: item.title, date: item.reminder_date, icon: Search })),
  ].filter((item) => item.date && Number.isFinite(new Date(item.date).getTime()))
    .sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime())
    .slice(0, 4)

  return (
    <div className="min-w-0 space-y-6">
      <Card className="overflow-hidden bg-slate-900 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-medium text-sky-300">{greeting}, {name.split(' ')[0]}</p><h2 className="mt-2 text-2xl font-bold sm:text-3xl">Your career journey, grounded in evidence.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Move from discovery to meaningful work one verified step at a time.</p></div>
          <label className="flex flex-col gap-2 text-sm font-medium text-white sm:min-w-48"><span>I'm a</span><select aria-label="Choose student or graduate opportunities" className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white" value={candidateType} disabled={savingCandidateType} onChange={(event) => changeCandidateType(event.target.value)}><option value="student">Student</option><option value="graduate">Graduate</option></select><span className="text-xs font-normal text-slate-300">{savingCandidateType ? 'Saving your preference...' : candidateType === 'graduate' ? 'Showing jobs and internships' : 'Showing internships only'}</span></label>
          {profileCompletion < 100 ? <Link to="/student/profile"><Button variant="primary" size="sm" className="bg-sky-500 hover:bg-sky-400">Complete profile <ArrowRight size={15} /></Button></Link> : null}
        </div>
        <div className="mt-7 min-w-0 rounded-2xl bg-white/10 p-4"><StudentJourney currentStage={currentStage} /></div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LastUpdated value={updatedAt} />
        {loadError ? <div className="min-w-0 flex-1"><RequestError error={loadError} fallback="We could not refresh your dashboard." stale onRetry={() => setRetry((count) => count + 1)} /></div> : null}
      </div>
      {actionError ? <RequestError error={actionError} fallback="We could not update your opportunity preference." /> : null}
      {loading ? <p role="status" className="text-sm text-slate-500">Refreshing dashboard…</p> : null}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{stats.map(({ label, value, to, explanation }) => <Card key={label} className="h-full min-w-0 p-5 transition hover:border-sky-300"><Link to={to} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-2 text-xs font-medium text-sky-700">View details <ArrowRight size={13} className="inline" /></p></Link><details className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium text-slate-700">How is this calculated?</summary><p className="mt-2 leading-5">{explanation}</p></details></Card>)}</div>

      <Link to="/student/internships" className="block rounded-2xl border border-sky-200 bg-sky-50 p-5 transition hover:border-sky-400 hover:bg-sky-100"><p className="font-semibold text-sky-950">Internships & Industrial Attachments</p><p className="mt-1 text-sm text-sky-800">Explore published practical placements matched to your profile.</p></Link>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="min-w-0 p-5 sm:p-6"><div className="flex items-center justify-between"><div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-[0.15em] text-sky-700">Career recommendations</p><h3 className="mt-1 text-xl font-bold text-slate-900">Paths that fit your evidence</h3></div><Target className="shrink-0 text-sky-600" size={20} /></div><div className="mt-5 space-y-4">{data.recommendations?.length ? data.recommendations.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-semibold text-slate-900">{item.careers?.title || 'Career recommendation'}</h4><p className="mt-1 text-sm text-slate-600">{item.reason}</p></div><Badge tone="green">{Math.round(item.match_score)}% match</Badge></div><div className="mt-3 flex flex-wrap gap-2">{(item.strong_skills || []).slice(0, 3).map((skill) => <Badge key={skill} tone="green">{skill}</Badge>)}{(item.missing_skills || []).slice(0, 2).map((skill) => <Badge key={skill} tone="amber">Gap: {skill}</Badge>)}</div><div className="mt-4 flex flex-wrap gap-2"><Link to={`/student/career/${item.career_id}`}><Button variant="secondary" size="sm">View Career</Button></Link><Link to={`/student/career/roadmap?career=${item.career_id}`}><Button variant="outline" size="sm">View Roadmap</Button></Link><Link to={`/student/readiness?career=${item.career_id}`}><Button variant="primary" size="sm">Check Readiness</Button></Link></div></div>) : <EmptyState to="/student/career/discovery" action="Explore careers">Complete your profile and skills assessment to receive personalized career recommendations.</EmptyState>}</div></Card>
        <Card className="min-w-0 p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.15em] text-sky-700">Evidence readiness</p><h3 className="mt-1 text-xl font-bold text-slate-900">Evidence snapshot</h3></div><GraduationCap className="shrink-0 text-emerald-600" size={20} /></div>{readiness?.has_evidence && Number.isFinite(readiness.readiness_score) ? <><div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs leading-5 text-slate-600">Weighted evidence indicator; missing categories contribute zero. It is not a hiring prediction.</p><p className="mt-1 text-2xl font-bold text-slate-900">{readiness.readiness_score}%</p></div><div className="mt-5 space-y-4">{[['Skills', readiness.skills_score, readiness.evidence_availability.skills], ['Assessments', readiness.assessment_score, readiness.evidence_availability.assessments], ['Projects', readiness.projects_score, readiness.evidence_availability.projects], ['Verified certificates', readiness.certificate_score, readiness.evidence_availability.certificates], ['Learning', readiness.learning_score, readiness.evidence_availability.learning]].map(([label, value, available]) => <div key={label}><div className="mb-1 flex justify-between text-sm text-slate-600"><span>{label}</span><strong className="text-slate-900">{available ? `${Math.round(value)}%` : 'No data'}</strong></div>{available ? <ProgressBar value={value} tone={value >= 70 ? 'green' : value >= 40 ? 'blue' : 'amber'} /> : null}</div>)}</div></> : <div className="mt-5"><EmptyState to={data.readinessWarnings?.length ? '/student/readiness' : '/student/skills'} action={data.readinessWarnings?.length ? 'Review readiness details' : 'Start building evidence'}>{data.readinessWarnings?.length ? 'Evidence readiness is temporarily unavailable because some records could not be loaded.' : 'No measurable skills, assessment, project, certificate, or learning evidence is recorded yet, so a percentage would be misleading.'}</EmptyState></div>}</Card>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-3">
        <Card className="min-w-0 p-5 sm:p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">Recommended learning</h3><GraduationCap className="shrink-0 text-amber-500" size={18} /></div><div className="mt-4 space-y-3">{data.resources?.length ? data.resources.map((resource) => <Link to="/student/learning" key={resource.id} className="block min-w-0 rounded-xl border border-slate-200 p-3 hover:border-sky-300"><p className="font-medium text-slate-800">{resource.title}</p><p className="mt-1 text-xs text-slate-500">{resource.skills?.name || 'General'} · {resource.difficulty || 'All levels'} · {resource.duration_minutes ? `${resource.duration_minutes} min` : 'Self-paced'}</p><div className="mt-2"><ProgressBar value={resource.progress?.progress || 0} tone="amber" /></div></Link>)  : <EmptyState to="/student/learning" action="Browse learning">Learning recommendations will appear when skill gaps are available.</EmptyState>}</div></Card>
        <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">{candidateType === 'graduate' ? 'Recommended jobs and internships' : 'Recommended internships'}</h3><BriefcaseBusiness className="text-sky-600" size={18} /></div><div className="mt-4 space-y-3">{data.jobs?.length ? data.jobs.map((job) => <Link to={`/student/jobs/${job.id}`} key={job.id} className="block rounded-xl border border-slate-200 p-3 hover:border-sky-300"><div className="flex justify-between gap-2"><p className="font-medium text-slate-800">{job.title}</p><Badge tone="blue">Published</Badge></div><p className="mt-1 text-sm text-slate-500">{job.employer_profiles?.company_name || 'Employer'} · {job.location || 'Malawi'}</p><p className="mt-2 text-xs capitalize text-slate-500">{(job.employment_type || 'opportunity').replace(/_/g, ' ')} · {job.work_mode || 'Flexible'}</p></Link>) : <EmptyState to="/student/jobs" action="Browse opportunities">No matching opportunities found. Try changing your student or graduate selection.</EmptyState>}</div></Card>
        <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">Upcoming activities</h3><CalendarDays className="text-slate-500" size={18} /></div><div className="mt-4 space-y-3">{activities.length ? activities.map((item, index) => <div key={`${item.title}-${item.date}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><item.icon size={17} className="shrink-0 text-sky-600" /><div className="min-w-0"><p className="font-medium text-slate-800">{item.title}</p><p className="text-xs text-slate-500">{new Date(item.date).toLocaleString()}</p></div></div>) : <EmptyState to="/student/notifications" action="View notifications">No upcoming activities yet.</EmptyState>}</div></Card>
      </div>

      {profileCompletion < 100 ? <Card className="flex flex-col gap-4 border-sky-200 bg-sky-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><UserRound className="text-sky-700" /><div><p className="font-semibold text-slate-900">Complete your profile · {profileCompletion}%</p><p className="text-sm text-slate-600">Add key details to improve your recommendations and opportunity matching.</p></div></div><Link to="/student/profile"><Button variant="primary" size="sm">Update profile</Button></Link></Card> : null}
    </div>
  )
}
