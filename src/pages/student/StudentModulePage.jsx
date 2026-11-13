import { ArrowLeft, ArrowRight, Bell, BookOpen, BriefcaseBusiness, CalendarDays, Camera, CheckCircle2, Clock3, ExternalLink, FileText, GraduationCap, Layers3, Plus, RefreshCw, Search, Settings, Target, Upload, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LowBandwidthToggle } from '../../components/ui/LowBandwidthToggle'
import { assessmentService } from '../../services/assessmentService'
import { aiService } from '../../services/aiService'
import { applicationService, formatApplicationStatus, normalizeApplicationStatus } from '../../services/applicationService'
import { careerService } from '../../services/careerService'
import { employmentService } from '../../services/employmentService'
import { feedbackService } from '../../services/feedbackService'
import { learningService } from '../../services/learningService'
import { matchingService } from '../../services/matchingService'
import { notificationService } from '../../services/notificationService'
import { portfolioService } from '../../services/portfolioService'
import { profileService } from '../../services/profileService'
import { skillService } from '../../services/skillService'
import { studentService } from '../../services/studentService'
import { jobService } from '../../services/jobService'
import { offerService } from '../../services/offerService'
import { interviewService } from '../../services/interviewService'
import { applySavedLearningProgress, buildLearningProgressUpdate } from '../../utils/learningProgress.js'
import { applicationStatusTone, isApplicationInProgress, isApplicationOpen, isApplicationTerminal, summarizeApplications } from '../../utils/applicationStatus.js'
import { normalizeCareerInterests, normalizeTargetRole } from '../../utils/careerInterests.js'
import { getEmploymentListingTypes } from '../../utils/candidateType.js'
import { calculateStudentProfileCompletion, isValidEducationRecord, validateEducationRecord } from '../../utils/educationValidation.js'
import { calculateAssessmentAverage, getLatestAssessmentResults } from '../../algorithms/careerReadiness.js'
import { isCertificateIndependentlyVerified } from '../../utils/certificateVerification.js'
import { canResubmitCertificate, getCertificateStatusLabel } from '../../utils/certificateWorkflow.js'
import { calculateLearningProgressMetrics } from '../../utils/studentProgressMetrics.js'
import { AppShell } from '../../components/layout/AppShell'
import { CareerGoalSummary } from '../../components/student/CareerGoalSummary'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ProfilePictureUploader } from '../../components/ui/ProfilePictureUploader'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { RequestError } from '../../components/ui/RequestState'
import { InterviewConductNotice } from '../../components/interviews/InterviewConductNotice'
import { InterviewPolicyReport } from '../../components/interviews/InterviewPolicyReport'
import { formatInterviewDateTime, getSafeMeetingUrl, normalizeInterviewReport } from '../../utils/interviewPolicy'
import { filterSkillCatalog, SKILL_CATEGORIES } from '../../utils/skillCatalog'
import AdvancedCareerIntelligence from './AdvancedCareerIntelligence'
import StudentSkillInsights from './StudentSkillInsights'
import StudentMarketPage from './StudentMarketPage'

const CONFIG = {
  career: ['My Career', 'Explore career recommendations and your roadmap.'],
  skills: ['Skills', 'Build a competency profile supported by evidence.'],
  assessments: ['Assessments', 'Measure your current skills and identify next steps.'],
  learning: ['Learning', 'Turn skill gaps into a practical learning path.'],
  jobs: ['Jobs', 'Browse employment jobs by default, or include all relevant opportunities.'],
  applications: ['Applications', 'Track every application stage from discovery to decision.'],
  interviews: ['Interviews', 'See upcoming and past interviews connected to your applications.'],
  portfolio: ['Portfolio', 'Build evidence through projects and certificates.'],
  readiness: ['Career Readiness', 'See which evidence supports your next move.'],
  progress: ['Progress', 'Review real improvements across your career journey.'],
  notifications: ['Notifications', 'Stay on top of updates and reminders.'],
  employment: ['Employment', 'Track your employment journey and development.'],
  settings: ['Settings', 'Manage your profile and account preferences.'],
  profile: ['My Profile', 'Complete your profile to improve recommendations and matching.'],
  market: ['Career Market', 'See the labour-market demand behind your target career and key skills.'],
  demand: ['Skills Demand', 'Compare your current skills with the most frequently requested market skills.'],
  interviewPrep: ['Interview Preparation', 'Run realistic interview practice using your actual profile evidence and role requirements.'],
  evidence: ['Evidence Graph', 'Visualize confidence and trust in each skill based on assessments, projects, and portfolio signal.'],
  simulator: ['Career Simulation', 'Compare the likely impact of improving evidence, confidence, and skills over time.'],
  feedback: ['Feedback', 'Review competency feedback shared with you by verified employers and hiring partners.'],
}

const TARGET_ROLE_SUGGESTIONS = [
  'Software Developer',
  'Graphic Designer',
  'Accountant',
  'Teacher',
  'Nurse',
  'Agricultural Officer',
  'Data Analyst',
  'Civil Engineer',
  'Marketing Specialist',
  'Public Health Officer',
  'Electrician',
  'Entrepreneur',
]

const EMPTY_EDUCATION_FORM = { institution: '', programme: '', qualification: '', education_level: '', field_of_study: '', start_year: '', end_year: '', grade: '' }

function JobMatchRecommendations({ userId }) {
  const [data, setData] = useState({ key: '', matches: [], error: '' })
  const [retry, setRetry] = useState(0)
  const requestKey = `${userId}:${retry}`
  const loading = data.key !== requestKey

  useEffect(() => {
    let active = true
    matchingService.refreshMatches(userId)
      .then((matches) => {
        if (active) setData({ key: requestKey, matches, error: '' })
      })
      .catch((error) => {
        if (active) setData({ key: requestKey, matches: [], error })
      })
    return () => { active = false }
  }, [requestKey, userId])

  const matches = loading ? [] : data.matches
  const error = loading ? '' : data.error

  return <SectionCard title="Employment matches" icon={BriefcaseBusiness}>
    <p className="mb-4 text-sm text-slate-600">Deterministic compatibility scores compare your recorded skills, qualifications, assessment results and available project, certificate, portfolio and experience evidence with published opportunities. They are guidance, not hiring decisions.</p>
    {loading ? <div role="status" className="animate-pulse space-y-3"><div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /></div> : error ? <RequestError error={error} fallback="Employment matches could not be calculated." onRetry={() => setRetry((value) => value + 1)} /> : matches.length ? <div className="space-y-4">{matches.map((match) => {
      const completed = match.calculation_status === 'completed'
      return <article key={match.job_id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="font-semibold text-slate-900">{match.title}</h4><p className="mt-1 text-sm text-slate-600">{match.employer}{match.location ? ` · ${match.location}` : ''}{match.employment_type ? ` · ${match.employment_type.replaceAll('_', ' ')}` : ''}</p></div>
          <Badge tone={completed ? 'green' : 'amber'}>{completed ? `${Math.round(match.match_score)}% compatibility` : match.calculation_status === 'unavailable' ? 'Analysis unavailable' : 'Analysis pending'}</Badge>
        </div>
        <p className="mt-3 text-sm text-slate-600">{completed ? match.explanation : match.calculation_reason || 'Match analysis will refresh when current profile and job data are available.'}</p>
        {completed ? <>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(match.factors || {}).map(([factor, score]) => <div key={factor} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><dt className="capitalize text-slate-500">{factor.replaceAll('_', ' ')}</dt><dd className="font-medium text-slate-800">{score}%</dd></div>)}</dl>
          <div className="mt-3 flex flex-wrap gap-2">{(match.strong_matches || []).map((skill) => <Badge key={`matched-${skill}`} tone="green">Matched: {skill}</Badge>)}{(match.developing_skills || []).map((skill) => <Badge key={`developing-${skill}`} tone="blue">Develop: {skill}</Badge>)}{(match.missing_requirements || []).map((skill) => <Badge key={`missing-${skill}`} tone="amber">Missing: {skill}</Badge>)}</div>
        </> : null}
        <Link to={`/student/jobs/${match.job_id}`} className="mt-4 inline-flex text-sm font-semibold text-sky-800 underline">View published opportunity</Link>
      </article>
    })}</div> : <EmptyState>No currently published opportunities are available for matching. Check back when employers publish relevant vacancies.</EmptyState>}
  </SectionCard>
}

function EmptyState({ children, to, action = 'Get started' }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">{children}{to ? <Link to={to} className="mt-3 inline-flex items-center font-semibold text-sky-700">{action}<ArrowRight size={15} className="ml-1" /></Link> : null}</div>
}

function ModuleHeader({ title, description, back }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{back ? <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"><ArrowLeft size={15} /> Back</Link> : null}<p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Student workspace</p><h2 className="mt-1 text-3xl font-bold text-slate-900">{title}</h2><p className="mt-2 text-slate-600">{description}</p></div></div>
}

function SectionCard({ title, icon: Icon, children, action }) {
  return <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon size={19} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">{title}</h3></div>{action}</div>{children}</Card>
}

function ProfileEditor({ userId, onSaved }) {
  const [profile, setProfile] = useState(null)
  const [education, setEducation] = useState([])
  const [form, setForm] = useState({})
  const [educationForm, setEducationForm] = useState(EMPTY_EDUCATION_FORM)
  const [educationFieldErrors, setEducationFieldErrors] = useState({})
  const [editingEducationId, setEditingEducationId] = useState('')
  const [loadRetry, setLoadRetry] = useState(0)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingEducation, setSavingEducation] = useState(false)
  const requestKey = `${userId}:${loadRetry}`
  const [loadedKey, setLoadedKey] = useState('')
  const loading = loadedKey !== requestKey
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([studentService.getProfile(userId), studentService.listEducation(userId)]).then(([loadedProfile, loadedEducation]) => {
      if (!active) return
      const student = Array.isArray(loadedProfile.student_profiles) ? loadedProfile.student_profiles[0] : loadedProfile.student_profiles
      setProfile(loadedProfile)
      setForm({ full_name: loadedProfile.full_name || '', phone: student?.phone || '', district: student?.district || '', city: student?.city || '', country: student?.country || 'Malawi', bio: student?.bio || '', target_role: student?.target_role || '', career_goal: student?.career_goal || '', interests: (student?.interests || []).join(', '), institution: student?.institution || '', programme: student?.programme || '', education_level: student?.education_level || '', current_year_of_study: student?.current_year_of_study || '', preferred_location: student?.preferred_location || '', available_from: student?.available_from || '', available_to: student?.available_to || '' })
      setEducation(loadedEducation || [])
      setEducationForm(EMPTY_EDUCATION_FORM)
      setEducationFieldErrors({})
      setEditingEducationId('')
      setError('')
      setLoadedKey(requestKey)
    }).catch((loadError) => {
      if (active) {
        setError(loadError.message || 'Unable to load your profile.')
        setLoadedKey(requestKey)
      }
    })
    return () => { active = false }
  }, [requestKey, userId])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateEducationField = (field, value) => {
    setEducationForm((current) => ({ ...current, [field]: value }))
    setError('')
    setEducationFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      if (field === 'start_year' || field === 'end_year') {
        delete next.start_year
        delete next.end_year
      }
      return next
    })
  }
  const save = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (form.available_from && form.available_to && form.available_from > form.available_to) {
      setError('The availability end date must be on or after the start date.')
      return
    }
    let interests
    let targetRole
    try {
      interests = normalizeCareerInterests(form.interests)
      targetRole = normalizeTargetRole(form.target_role)
    } catch (validationError) {
      setError(validationError.message)
      return
    }
    setSavingProfile(true)
    try {
      await profileService.updateProfile(userId, { full_name: form.full_name })
      try {
        await studentService.saveStudentProfile(userId, { phone: form.phone, district: form.district, city: form.city, country: form.country, bio: form.bio, target_role: targetRole, career_goal: form.career_goal, interests, institution: form.institution, programme: form.programme, education_level: form.education_level, current_year_of_study: form.current_year_of_study ? Number(form.current_year_of_study) : null, preferred_location: form.preferred_location || null, available_from: form.available_from || null, available_to: form.available_to || null })
      } catch (studentSaveError) {
        throw new Error(`Your name was updated, but the rest of your profile could not be saved: ${studentSaveError.message}`, { cause: studentSaveError })
      }
      setProfile((current) => ({ ...current, full_name: form.full_name }))
      setMessage('Profile saved successfully.')
      onSaved?.()
    } catch (saveError) { setError(saveError.message || 'Unable to save your profile.') } finally { setSavingProfile(false) }
  }
  const addEducation = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const changes = {
      ...educationForm,
      institution: educationForm.institution.trim(),
      programme: educationForm.programme.trim(),
      qualification: educationForm.qualification.trim(),
      education_level: educationForm.education_level.trim(),
      start_year: educationForm.start_year ? Number(educationForm.start_year) : null,
      end_year: educationForm.end_year ? Number(educationForm.end_year) : null,
    }
    const validationErrors = validateEducationRecord(changes)
    setEducationFieldErrors(validationErrors)
    if (Object.keys(validationErrors).length) {
      setError('Review the highlighted education fields.')
      return
    }
    setSavingEducation(true)
    try {
      const record = editingEducationId
        ? await studentService.updateEducation(editingEducationId, userId, changes)
        : await studentService.saveEducation({ ...changes, student_id: userId })
      setEducation((current) => editingEducationId ? current.map((item) => item.id === record.id ? record : item) : [record, ...current])
      setEducationForm(EMPTY_EDUCATION_FORM)
      setEducationFieldErrors({})
      setEditingEducationId('')
      setMessage(editingEducationId ? 'Education record updated.' : 'Education record added.')
    } catch (saveError) { setError(saveError.message || 'Unable to save education.') } finally { setSavingEducation(false) }
  }
  const editEducation = (item) => {
    setEditingEducationId(item.id)
    setEducationForm({
      institution: item.institution || '',
      programme: item.programme || '',
      qualification: item.qualification || '',
      education_level: item.education_level || '',
      field_of_study: item.field_of_study || '',
      start_year: item.start_year || '',
      end_year: item.end_year || '',
      grade: item.grade || '',
    })
    setEducationFieldErrors({})
    setError('')
    setMessage('')
  }
  const cancelEducationEdit = () => {
    setEditingEducationId('')
    setEducationForm(EMPTY_EDUCATION_FORM)
    setEducationFieldErrors({})
  }
  const removeEducation = async (item) => {
    if (!window.confirm(`Delete the education record for ${item.institution}?`)) return
    setError('')
    setMessage('')
    try {
      await studentService.deleteEducation(item.id, userId)
      setEducation((current) => current.filter((record) => record.id !== item.id))
      if (editingEducationId === item.id) cancelEducationEdit()
      setMessage('Education record deleted.')
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete education record.')
    }
  }

  if (loading) return <div className="grid gap-6 lg:grid-cols-2" aria-label="Loading profile"><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (error && !profile) return <RequestError error={error} fallback="We could not load your profile." onRetry={() => setLoadRetry((count) => count + 1)} />
  const student = Array.isArray(profile.student_profiles) ? profile.student_profiles[0] : profile.student_profiles
  const { items: completionItems, percentage: completion } = calculateStudentProfileCompletion({
    fullName: form.full_name,
    phone: form.phone,
    bio: form.bio,
    targetRole: form.target_role,
    interests: form.interests,
    institution: form.institution,
    programme: form.programme,
    educationLevel: form.education_level,
    educationRecords: education,
  })
  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'
  const educationFieldClass = (field) => `${inputClass}${educationFieldErrors[field] ? ' border-rose-500' : ''}`
  const educationFieldError = (field) => educationFieldErrors[field]
    ? <span id={`education-${field}-error`} className="mt-1 block text-xs text-rose-700">{educationFieldErrors[field]}</span>
    : null
  const renderEducationField = (field, label, options = {}) => (
    <label key={field} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{options.required ? ' *' : ''}</span>
      <input
        id={`education-${field}`}
        type={options.type || 'text'}
        min={options.min}
        max={options.max}
        step={options.step}
        maxLength={options.maxLength}
        aria-invalid={Boolean(educationFieldErrors[field])}
        aria-describedby={educationFieldErrors[field] ? `education-${field}-error` : undefined}
        className={educationFieldClass(field)}
        placeholder={options.placeholder}
        value={educationForm[field] ?? ''}
        onChange={(event) => updateEducationField(field, event.target.value)}
      />
      {educationFieldError(field)}
    </label>
  )

  return <div className="space-y-6">
    <Card className="overflow-hidden bg-gradient-to-r from-slate-900 to-sky-900 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.15em] text-sky-200">Profile workspace</p><h3 className="mt-1 text-2xl font-bold">{form.full_name || 'Build your profile'}</h3><p className="mt-1 text-sm text-slate-200">Keep your personal details and education current to improve recommendations and matching.</p></div>
        <Badge tone="blue">{student?.candidate_type === 'graduate' ? 'Graduate profile' : 'Student profile'}</Badge>
      </div>
    </Card>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
    <div className="space-y-6">
      <ProfilePictureUploader profile={profile} onUpdated={(nextProfile) => setProfile((current) => ({ ...current, avatar_url: nextProfile?.avatar_url || current?.avatar_url }))} />
      <form onSubmit={save} className="space-y-6">
        <SectionCard title="Personal information" icon={UserRound}>
          <p className="mb-4 text-sm text-slate-600">These details are private to your account unless you share them through an application or portfolio.</p>
          <div className="grid gap-4 sm:grid-cols-2">{[['full_name', 'Full name'], ['phone', 'Phone'], ['district', 'District'], ['city', 'City'], ['country', 'Country'], ['institution', 'Institution'], ['programme', 'Programme'], ['education_level', 'Education level'], ['preferred_location', 'Preferred placement location']].map(([field, label]) => <label key={field} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input required={field === 'full_name'} maxLength={field === 'full_name' ? 120 : 160} autoComplete={field === 'full_name' ? 'name' : field === 'phone' ? 'tel' : 'off'} className={inputClass} value={form[field] || ''} onChange={(event) => update(field, event.target.value)} /></label>)}<label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Current year of study</span><input type="number" min="1" max="20" className={inputClass} value={form.current_year_of_study || ''} onChange={(event) => update('current_year_of_study', event.target.value)} /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Available from</span><input type="date" max={form.available_to || undefined} className={inputClass} value={form.available_from || ''} onChange={(event) => update('available_from', event.target.value)} /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Available through</span><input type="date" min={form.available_from || undefined} className={inputClass} value={form.available_to || ''} onChange={(event) => update('available_to', event.target.value)} /></label></div>
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Bio</span><textarea maxLength={2000} className={`${inputClass} min-h-24`} value={form.bio || ''} onChange={(event) => update('bio', event.target.value)} /><span className="mt-1 block text-right text-xs text-slate-500">{(form.bio || '').length}/2000</span></label>
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Target occupation or role</span><input list="target-occupation-examples" maxLength={120} className={inputClass} value={form.target_role || ''} onChange={(event) => update('target_role', event.target.value)} placeholder="Choose or enter any occupation" /><datalist id="target-occupation-examples">{TARGET_ROLE_SUGGESTIONS.map((role) => <option key={role} value={role} />)}</datalist><span className="mt-1 block text-xs text-slate-500">Used as the main role title for Career Market searches, recommendations, and matching. Enter any occupation or sector.</span></label>
          <CareerGoalSummary
            className="mt-4"
            targetRole={form.target_role}
            careerGoal={form.career_goal}
            inputClass={inputClass}
            onCareerGoalChange={(value) => update('career_goal', value)}
          />
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Career interests</span><textarea maxLength={1600} className={`${inputClass} min-h-20`} placeholder="e.g. data science, public health, renewable energy" value={form.interests || ''} onChange={(event) => update('interests', event.target.value)} /><span className="mt-1 block text-xs text-slate-500">Separate interests with commas. These support recommendations alongside your target occupation.</span></label>
        </SectionCard>
        <div className="flex flex-wrap items-center gap-3">{message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}<Button type="submit" disabled={savingProfile}>{savingProfile ? 'Saving profile…' : 'Save changes'}</Button></div>
      </form>
    </div>

    <div className="space-y-6">
      <SectionCard title="Profile completion" icon={Target}>
        <div className="flex items-end justify-between"><p className="text-4xl font-bold text-slate-900">{completion}%</p><span className="text-sm text-slate-500">Key details provided</span></div>
        <div className="mt-4"><ProgressBar value={completion} tone="green" /></div>
        <ul className="mt-4 space-y-2 text-sm">{completionItems.map((item) => <li key={item.label} className={`flex items-center gap-2 ${item.complete ? 'text-emerald-800' : 'text-slate-600'}`}><CheckCircle2 size={15} className={item.complete ? 'text-emerald-600' : 'text-slate-300'} />{item.label}</li>)}</ul>
        <p className="mt-4 text-xs leading-5 text-slate-500">This checklist is calculated from the details shown here; it is not an employer rating.</p>
      </SectionCard>
      <LowBandwidthToggle />
      <SectionCard title="Education" icon={GraduationCap}>
        <div className="space-y-3">{education.length ? education.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${isValidEducationRecord(item) ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{item.institution || 'Institution not provided'}</p><p className="mt-1 text-sm text-slate-600">{item.programme || item.qualification || item.field_of_study || 'Programme not provided'}</p><p className="mt-1 text-xs text-slate-500">{item.education_level || 'Education level not provided'} · {item.start_year || 'Start'} - {item.end_year || 'Ongoing'}{item.grade ? ` · Grade: ${item.grade}` : ''}</p>{!isValidEducationRecord(item) ? <p role="status" className="mt-2 text-xs text-amber-900">Incomplete legacy record. Edit or remove it; it does not count toward profile completion.</p> : null}</div><div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => editEducation(item)}>Edit</Button><Button type="button" variant="ghost" size="sm" className="text-rose-700" onClick={() => void removeEducation(item)}>Delete</Button></div></div></div>) : <EmptyState>No education history has been added yet.</EmptyState>}</div>
        <form noValidate onSubmit={addEducation} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <h4 className="font-semibold text-slate-900">{editingEducationId ? 'Edit education record' : 'Add education'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">{renderEducationField('institution', 'Institution', { required: true, maxLength: 160 })}{renderEducationField('programme', 'Programme', { required: true, maxLength: 160 })}</div>
          <div className="grid gap-3 sm:grid-cols-2">{renderEducationField('qualification', 'Qualification', { required: true, maxLength: 160 })}{renderEducationField('education_level', 'Education level', { required: true, maxLength: 100 })}</div>
          <div className="grid gap-3 sm:grid-cols-3">{renderEducationField('start_year', 'Start year', { type: 'number', min: 1900, max: 2200, step: 1 })}{renderEducationField('end_year', 'End year', { type: 'number', min: 1900, max: 2200, step: 1 })}{renderEducationField('grade', 'Grade', { maxLength: 40 })}</div>
          <p className="text-xs text-slate-500">Leave end year blank if your education is ongoing.</p>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={savingEducation}>{savingEducation ? 'Saving…' : editingEducationId ? 'Save education' : 'Add education'}</Button>{editingEducationId ? <Button type="button" variant="outline" disabled={savingEducation} onClick={cancelEducationEdit}>Cancel edit</Button> : null}</div>
        </form>
      </SectionCard>
    </div>
  </div>
  </div>
}

function CareerRecommendationCard({ item, feedback, draft, onDraftChange, onSave, onSetInteraction }) {
  const recommendationId = item.recommendation_id
  return <div className="rounded-2xl border border-slate-200 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h4 className="font-semibold text-slate-900">{item.careers?.title || item.title || 'Career'}</h4><p className="mt-2 text-sm text-slate-600">{item.reason}</p></div>
      <Badge tone="green">{Math.round(item.match_score)}%</Badge>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.entries(item.factors || {}).map(([factor, score]) => <div key={factor} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><dt className="capitalize text-slate-500">{factor}</dt><dd className="font-medium text-slate-800">{score}%</dd></div>)}
    </dl>
    <div className="mt-3 flex flex-wrap gap-2">
      {(item.strong_skills || []).map((skill) => <Badge key={`strong-${skill}`} tone="green">Matched: {skill}</Badge>)}
      {(item.developing_skills || []).map((skill) => <Badge key={`developing-${skill}`} tone="blue">Developing: {skill}</Badge>)}
      {(item.missing_skills || []).map((skill) => <Badge key={`missing-${skill}`} tone="amber">Missing: {skill}</Badge>)}
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link to={`/student/career/${item.career_id}`}><Button variant="secondary" size="sm">View Career</Button></Link>
      <Link to={`/student/career/roadmap?career=${item.career_id}`}><Button variant="outline" size="sm">View Roadmap</Button></Link>
    </div>
    {recommendationId ? <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-800">What did you do with this recommendation?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={item.interaction_status === 'explored' ? 'primary' : 'outline'} onClick={() => void onSetInteraction(recommendationId, 'explored')}>Explored</Button>
        <Button type="button" size="sm" variant={item.interaction_status === 'accepted' ? 'primary' : 'outline'} onClick={() => void onSetInteraction(recommendationId, 'accepted')}>Accepted</Button>
        <Button type="button" size="sm" variant={item.interaction_status === 'dismissed' ? 'primary' : 'outline'} onClick={() => void onSetInteraction(recommendationId, 'dismissed')}>Dismissed</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Your latest response: {item.interaction_status || 'not recorded'}.</p>
    </div> : null}
    {recommendationId ? <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(event) => { event.preventDefault(); void onSave(recommendationId) }}>
      <h5 className="font-semibold text-slate-900">Rate this recommendation</h5>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-700">How relevant is this career?
          <select required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={draft?.relevance_rating || ''} onChange={(event) => onDraftChange(recommendationId, 'relevance_rating', Number(event.target.value))}>
            <option value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} — {rating === 1 ? 'Not relevant' : rating === 5 ? 'Very relevant' : 'Somewhat relevant'}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">How suitable is it for you?
          <select required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={draft?.suitability_rating || ''} onChange={(event) => onDraftChange(recommendationId, 'suitability_rating', Number(event.target.value))}>
            <option value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} — {rating === 1 ? 'Not suitable' : rating === 5 ? 'Very suitable' : 'Somewhat suitable'}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm text-slate-700">Optional reason<textarea maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows="2" value={draft?.reason || ''} onChange={(event) => onDraftChange(recommendationId, 'reason', event.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" disabled={!draft?.relevance_rating || !draft?.suitability_rating}>Save rating</Button>{feedback ? <span role="status" className="text-sm text-emerald-700">Your rating is saved and can be updated.</span> : null}</div>
    </form> : null}
  </div>
}

function CareerDefinitionDetails({ career }) {
  const skillGroups = [
    ['Required skills', career.career_skills?.filter((item) => item.is_required !== false) || []],
    ['Preferred skills', career.career_skills?.filter((item) => item.is_required === false) || []],
  ].filter(([, skills]) => skills.length)
  const listSections = [
    ['Related academic programmes', career.academic_programmes],
    ['Required qualifications', career.required_qualifications],
    ['Responsibilities', career.responsibilities],
    ['Career opportunities and work settings', career.opportunity_areas],
  ].filter(([, items]) => items?.length)

  return <>
    <SectionCard title="About this career" icon={Target}>
      <p className="leading-7 text-slate-600">{career.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><Badge tone="blue">Entry: {career.entry_level || 'Not specified'}</Badge><Badge tone="slate">Growth: {career.growth_path || 'To be defined'}</Badge></div>
    </SectionCard>
    {listSections.length ? <SectionCard title="Career pathway details" icon={GraduationCap}>
      <div className="grid gap-5 sm:grid-cols-2">{listSections.map(([title, items]) => <div key={title}><h3 className="font-semibold text-slate-800">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
    </SectionCard> : null}
    {skillGroups.length ? <SectionCard title="Career skills" icon={Layers3}>
      <div className="space-y-5">{skillGroups.map(([title, skills]) => <div key={title}><h3 className="font-semibold text-slate-800">{title}</h3><div className="mt-2 space-y-2">{skills.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"><span className="font-medium text-slate-800">{item.skills?.name}</span><span className="text-sm text-slate-500">{item.required_level} · Importance {item.importance}</span></div>)}</div></div>)}</div>
    </SectionCard> : <SectionCard title="Career skills" icon={Layers3}><EmptyState>Skills have not been configured for this career yet.</EmptyState></SectionCard>}
    {career.career_learning_resources?.length ? <SectionCard title="Related learning resources" icon={BookOpen}>
      <div className="space-y-3">{career.career_learning_resources.map(({ id, learning_resources: resource }) => <div key={id} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-slate-800">{resource?.title || 'Learning resource'}</p><p className="text-sm text-slate-500">{[resource?.provider, resource?.resource_type].filter(Boolean).join(' · ')}</p>{resource?.url?.startsWith('https://') ? <a href={resource.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-sky-700">Open resource</a> : null}</div>)}</div>
    </SectionCard> : null}
    {career.outlook_verified_at && career.outlook_summary ? <SectionCard title="Employment outlook" icon={BriefcaseBusiness}>
      <p className="leading-6 text-slate-700">{career.outlook_summary}</p>
      <p className="mt-2 text-xs text-slate-500">The source was reviewed by SkillBridge; this information is not presented as a national or official statistic.</p>
      <p className="mt-2 text-sm text-slate-600">{career.outlook_source}{career.outlook_source_url?.startsWith('https://') ? <> · <a href={career.outlook_source_url} target="_blank" rel="noreferrer" className="font-medium text-sky-700">View source</a></> : null}</p>
    </SectionCard> : null}
  </>
}

function CareerView({ userId, detailId }) {
  const [feedback, setFeedback] = useState({})
  const [ratingDrafts, setRatingDrafts] = useState({})
  const [careerData, setCareerData] = useState({ key: '', career: null, recommendations: [], error: '' })
  const [actionError, setActionError] = useState('')
  const [retry, setRetry] = useState(0)
  const requestKey = `${userId}:${detailId || 'recommendations'}:${retry}`
  const loading = careerData.key !== requestKey
  const error = loading ? '' : careerData.error
  const career = loading ? null : careerData.career
  const recommendations = loading ? [] : careerData.recommendations
  const aiOverview = recommendations[0] || null

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (detailId) {
          const loadedCareer = await careerService.getCareer(detailId)
          if (active) setCareerData({ key: requestKey, career: loadedCareer, recommendations: [], error: '' })
          return
        }

        const [generated, saved, feedback] = await Promise.allSettled([
          aiService.getCareerRecommendations(userId),
          careerService.getRecommendations(userId),
          careerService.getFeedback(userId),
        ])
        if (!active) return
        if (generated.status === 'rejected') throw generated.reason
        const generatedResult = generated.value
        const savedResult = saved.status === 'fulfilled' ? saved.value : []
        const feedbackResult = feedback.status === 'fulfilled' ? feedback.value : []

        const savedByCareer = new Map((savedResult || []).map((item) => [item.career_id, item]))
        const currentRecommendations = (generatedResult?.recommendations || []).map((item) => {
          const savedRecommendation = savedByCareer.get(item.career_id)
          return {
            ...item,
            id: savedRecommendation?.id || item.career_id,
            recommendation_id: savedRecommendation?.id || null,
            interaction_status: savedRecommendation?.interaction_status || null,
            careers: savedRecommendation?.careers || { title: item.title, sector: item.sector },
            match_score: item.overall_score,
            strong_skills: item.strengths || [],
          }
        })
        setCareerData({ key: requestKey, career: null, recommendations: currentRecommendations, error: '' })
        setFeedback(Object.fromEntries((feedbackResult || []).map((item) => [item.career_recommendation_id, item])))
        setRatingDrafts(Object.fromEntries((feedbackResult || []).map((item) => [item.career_recommendation_id, {
          relevance_rating: item.relevance_rating || 0,
          suitability_rating: item.suitability_rating || 0,
          reason: item.reason || '',
        }])))
        setActionError(saved.status === 'rejected' || feedback.status === 'rejected'
          ? 'Career matches are available, but saved ratings could not be loaded.'
          : '')
      } catch (loadError) {
        if (active) setCareerData({
          key: requestKey,
          career: null,
          recommendations: [],
          error: loadError,
        })
      }
    }

    void load()
    return () => { active = false }
  }, [userId, detailId, retry, requestKey])

  const saveRecommendationRating = async (recommendationId) => {
    const draft = ratingDrafts[recommendationId]
    setActionError('')
    try {
      const saved = await careerService.saveFeedback({
        student_id: userId,
        career_recommendation_id: recommendationId,
        relevance_rating: draft?.relevance_rating,
        suitability_rating: draft?.suitability_rating,
        reason: draft?.reason || '',
      })
      setFeedback((current) => ({ ...current, [recommendationId]: saved }))
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to save your recommendation rating.')
    }
  }
  const setRecommendationInteraction = async (recommendationId, interactionStatus) => {
    setActionError('')
    try {
      const saved = await careerService.setRecommendationInteraction(userId, recommendationId, interactionStatus)
      setCareerData((current) => ({
        ...current,
        recommendations: current.recommendations.map((item) => item.recommendation_id === recommendationId
          ? { ...item, interaction_status: saved.interaction_status }
          : item),
      }))
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to save your recommendation response.')
    }
  }
  const updateRatingDraft = (recommendationId, field, value) => setRatingDrafts((current) => ({
    ...current,
    [recommendationId]: { ...(current[recommendationId] || {}), [field]: value },
  }))

  if (detailId) return <div className="space-y-6"><ModuleHeader title={career?.title || 'Career details'} description={career?.sector || 'Career pathway information.'} back="/student/career" />{loading ? <div className="h-48 animate-pulse rounded-2xl bg-slate-100" /> : error ? <RequestError error={error} fallback="Career details could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : career ? <CareerDefinitionDetails career={career} /> : <EmptyState>Career not found or unavailable.</EmptyState>}</div>

  return <div className="space-y-6">
    <ModuleHeader title="My Career" description="Explore career paths scored from your target occupation, skills, education, assessments, interests, and supporting career-goal description. Scores use transparent deterministic rules, not machine learning." />
    {error ? <RequestError error={error} fallback="Career recommendations could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : null}
    {actionError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p> : null}
    {loading ? <div className="grid gap-4 md:grid-cols-2" aria-label="Loading career recommendations"><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div> : null}
    {!loading && !error && aiOverview ? <SectionCard title="Top career match" icon={Target}><p className="text-sm text-slate-600">{aiOverview.reason}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-2xl font-bold text-slate-900">{aiOverview.careers?.title}</p><Badge tone="green">{Math.round(aiOverview.match_score)}% match</Badge></div><p className="mt-3 text-sm text-slate-600">Next step: {aiOverview.next_step}</p></SectionCard> : null}
    {!loading && !error ? <SectionCard title="Recommended careers" icon={Target}><div className="grid gap-4 lg:grid-cols-2">{recommendations.length ? recommendations.map((item) => <CareerRecommendationCard key={item.career_id} item={item} feedback={feedback[item.recommendation_id]} draft={ratingDrafts[item.recommendation_id]} onDraftChange={updateRatingDraft} onSave={saveRecommendationRating} onSetInteraction={setRecommendationInteraction} />) : <EmptyState to="/student/profile" action="Complete your profile">No career recommendations are available yet. Complete your profile and add a target occupation, skills, or education, then try again.</EmptyState>}</div></SectionCard> : null}
  </div>
}

function CareerRoadmapView({ careerId, userId }) {
  const [roadmapResult, setRoadmapResult] = useState({ key: '', roadmap: null, error: '' })
  const requestKey = `${userId}:${careerId || 'missing'}`
  const loading = Boolean(careerId) && roadmapResult.key !== requestKey
  const roadmap = loading ? null : roadmapResult.roadmap
  const error = !careerId
    ? 'Choose a career from My Career to view its roadmap.'
    : loading ? '' : roadmapResult.error

  useEffect(() => {
    let active = true
    if (!careerId) return () => { active = false }

    Promise.all([
      careerService.getCareer(careerId),
      skillService.getSkillProfile(userId),
    ])
      .then(([career, skills]) => {
        if (!active) return
        const skillByName = new Map((skills || []).map((item) => [
          item.skills?.name?.trim().toLowerCase(),
          item,
        ]))
        const levelValue = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }
        const steps = (career.career_skills || []).map((item) => {
          const name = item.skills?.name || 'Career skill'
          const existingSkill = skillByName.get(name.trim().toLowerCase())
          const hasLevel = existingSkill
            && (levelValue[existingSkill.level] || 0) >= (levelValue[item.required_level] || 1)
          return {
            name,
            requiredLevel: item.required_level,
            currentLevel: existingSkill?.level || null,
            complete: Boolean(hasLevel),
          }
        })
        setRoadmapResult({ key: requestKey, roadmap: { career, steps }, error: '' })
      })
      .catch((loadError) => {
        if (active) setRoadmapResult({
          key: requestKey,
          roadmap: null,
          error: loadError.message || 'Unable to load this career roadmap.',
        })
      })

    return () => { active = false }
  }, [careerId, userId, requestKey])

  if (error) return <div className="space-y-6"><ModuleHeader title="Career roadmap" description="A practical next-step plan based on career requirements and your current skills." back="/student/career" /><EmptyState>{error}</EmptyState></div>
  if (!roadmap) return <div className="space-y-6"><ModuleHeader title="Career roadmap" description="A practical next-step plan based on career requirements and your current skills." back="/student/career" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>

  const completedCount = roadmap.steps.filter((step) => step.complete).length
  const progress = roadmap.steps.length ? Math.round((completedCount / roadmap.steps.length) * 100) : 0
  return <div className="space-y-6">
    <ModuleHeader title={`${roadmap.career.title} roadmap`} description="A practical development plan based on this career’s required skills and your recorded profile." back="/student/career" />
    <SectionCard title="Current readiness" icon={Target}>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{completedCount} of {roadmap.steps.length} required skills are already at the target level.</p><Badge tone={progress >= 70 ? 'green' : 'blue'}>{progress}% skill coverage</Badge></div>
      <div className="mt-4"><ProgressBar value={progress} tone="blue" /></div>
    </SectionCard>
    <SectionCard title="Recommended development steps" icon={Layers3}>
      {roadmap.steps.length ? <ol className="space-y-3">{roadmap.steps.map((step, index) => <li key={`${step.name}-${index}`} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.complete ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{step.complete ? '✓' : index + 1}</span><div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{step.name}</p><p className="mt-1 text-sm text-slate-600">{step.complete ? `Recorded at ${step.currentLevel} level; target ${step.requiredLevel}.` : step.currentLevel ? `Develop from ${step.currentLevel} to ${step.requiredLevel}.` : `Build and record this skill to the ${step.requiredLevel} level.`}</p></div>{!step.complete ? <Link className="shrink-0 text-sm font-semibold text-sky-800 underline" to="/student/skills">Update skill</Link> : null}</li>)}</ol> : <EmptyState>No required skills have been configured for this career yet.</EmptyState>}
    </SectionCard>
  </div>
}

function SkillsView({ userId }) {
  const { pathname } = useLocation()
  const isGapRoute = pathname === '/student/skills/gaps' || pathname.startsWith('/student/skills/gaps/')
  const [skillsData, setSkillsData] = useState({ key: '', skills: [], catalog: [], jobDemandSkills: [], error: '', demandError: '' })
  const [selected, setSelected] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogCategory, setCatalogCategory] = useState('')
  const [level, setLevel] = useState('beginner')
  const [levelChanges, setLevelChanges] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingSkillId, setSavingSkillId] = useState('')
  const [deletingSkillId, setDeletingSkillId] = useState('')
  const [retry, setRetry] = useState(0)
  const [scanRetry, setScanRetry] = useState(0)
  const [detectionData, setDetectionData] = useState({ key: '', skills: [], error: '' })
  const requestKey = `${userId}:${retry}`
  const detectionKey = `${userId}:${scanRetry}`
  const loading = skillsData.key !== requestKey
  const detectionLoading = detectionData.key !== detectionKey
  const skills = loading ? [] : skillsData.skills
  const catalog = loading ? [] : skillsData.catalog
  const jobDemandSkills = loading ? [] : skillsData.jobDemandSkills
  const loadError = loading ? '' : skillsData.error
  const demandError = loading ? '' : skillsData.demandError
  const detectedSkills = detectionLoading
    ? []
    : detectionData.skills.filter((suggestion) => !skills.some((item) => item.skill_id === suggestion.id))

  useEffect(() => {
    let active = true
    Promise.allSettled([
      skillService.getSkillProfile(userId),
      skillService.listSkills(),
    ]).then(([profileResult, catalogResult]) => {
      if (!active) return
      const errors = [profileResult, catalogResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Unable to load skill information.')
      setSkillsData({
        key: requestKey,
        skills: profileResult.status === 'fulfilled' ? profileResult.value || [] : [],
        catalog: catalogResult.status === 'fulfilled' ? catalogResult.value || [] : [],
        jobDemandSkills: [],
        error: errors.join(' '),
        demandError: '',
      })
      skillService.getJobDemandSkills()
        .then((demand) => {
          if (active) setSkillsData((current) => current.key === requestKey
            ? { ...current, jobDemandSkills: demand || [], demandError: '' }
            : current)
        })
        .catch(() => {
          if (active) setSkillsData((current) => current.key === requestKey
            ? { ...current, demandError: 'Job-demand data is temporarily unavailable.' }
            : current)
        })
    })
    return () => { active = false }
  }, [userId, requestKey])

  useEffect(() => {
    let active = true
    skillService.detectProfileSkills(userId)
      .then((result) => {
        if (active) setDetectionData({ key: detectionKey, skills: result.skills, error: '', warning: result.warning })
      })
      .catch((scanError) => {
        if (active) setDetectionData({
          key: detectionKey,
          skills: [],
          error: scanError.message || 'Unable to detect skills from your profile and portfolio.',
          warning: '',
        })
      })
    return () => { active = false }
  }, [userId, detectionKey])

  const addSkill = async (skillId, skillLevel = level) => {
    setError('')
    if (!skillId) {
      setError('Please select a skill to add.')
      return false
    }

    if (loadError) {
      setError('Your existing skills could not be verified. Reload the page before adding a skill.')
      return false
    }

    if (skills.some((item) => item.skill_id === skillId)) {
      setError('This skill is already on your profile.')
      return false
    }

    setSaving(true)
    try {
      await skillService.upsertUserSkill({ user_id: userId, skill_id: skillId, level: skillLevel, confidence: 0, verified: false })
      setRetry((current) => current + 1)
      setScanRetry((current) => current + 1)
      return true
    } catch (saveError) {
      setError(saveError.message || 'Unable to save that skill.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    if (await addSkill(selected)) {
      setSelected('')
      setLevel('beginner')
    }
  }

  const updateSkillLevel = async (item) => {
    const nextLevel = levelChanges[item.id] || item.level
    setError('')
    if (nextLevel === item.level) return
    setSavingSkillId(item.id)
    try {
      await skillService.updateUserSkillLevel(item.id, userId, nextLevel)
      setLevelChanges((current) => {
        const updated = { ...current }
        delete updated[item.id]
        return updated
      })
      setRetry((current) => current + 1)
    } catch (saveError) {
      setError(saveError.message || 'Unable to update this skill level.')
    } finally {
      setSavingSkillId('')
    }
  }

  const removeSkill = async (userSkillId) => {
    setError('')
    setDeletingSkillId(userSkillId)
    try {
      await skillService.deleteUserSkill(userSkillId)
      setRetry((current) => current + 1)
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove that skill.')
    } finally {
      setDeletingSkillId('')
    }
  }

  const availableSkills = catalog.filter((item) => !skills.some((studentSkill) => studentSkill.skill_id === item.id))
  const filteredAvailableSkills = filterSkillCatalog(availableSkills, {
    query: catalogSearch,
    category: catalogCategory,
  })

  return <div className="space-y-6"><ModuleHeader title="Skills" description="Track the skills you are building and the evidence that supports them." />
    {isGapRoute ? <StudentSkillInsights userId={userId} mode="gaps" /> : null}
    <SectionCard title="Add a skill" icon={Plus}>
      {error ? <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {demandError ? <p role="status" className="mb-3 text-sm text-amber-800">{demandError}</p> : null}
      {loadError ? <RequestError error={loadError} fallback="Your skills could not be loaded." onRetry={() => setRetry((current) => current + 1)} retryLabel="Reload skills" /> : null}
      {loading ? <p role="status" className="mb-3 text-sm text-slate-500">Loading your skills and the catalog…</p> : null}
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="catalog-skill-search" className="block text-sm font-medium text-slate-700">Find a skill in the catalog</label>
            <input
              id="catalog-skill-search"
              type="search"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
              placeholder="Search names or aliases"
              value={catalogSearch}
              onChange={(event) => { setCatalogSearch(event.target.value); setSelected('') }}
              disabled={loading || Boolean(loadError) || !availableSkills.length}
            />
          </div>
          <label className="space-y-2 text-sm font-medium text-slate-700">Category
            <select className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" value={catalogCategory} onChange={(event) => { setCatalogCategory(event.target.value); setSelected('') }} disabled={loading || Boolean(loadError) || !availableSkills.length}>
              <option value="">All professional categories</option>
              {SKILL_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <select required aria-label="Choose a catalog skill" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={loading || Boolean(loadError) || !filteredAvailableSkills.length}>
            <option value="">Choose a skill</option>
            {[...filteredAvailableSkills].sort((left, right) =>
            (jobDemandSkills.find((item) => item.id === right.id)?.job_count || 0)
            - (jobDemandSkills.find((item) => item.id === left.id)?.job_count || 0),
          ).map((item) => {
            const demand = jobDemandSkills.find((skill) => skill.id === item.id)?.job_count
            return <option key={item.id} value={item.id}>{item.name} · {item.category}{demand ? ` · requested by ${demand} published ${demand === 1 ? 'job' : 'jobs'}` : ''}</option>
          })}
          </select>
          {!loading && !loadError && !catalog.length ? <p role="status" className="text-sm text-amber-800">The skill catalog is empty. Please ask an administrator to add skills before you try again.</p> : null}
          {!loading && !loadError && catalog.length > 0 && !availableSkills.length ? <p role="status" className="text-sm text-slate-600">You have added every skill currently available in the catalog.</p> : null}
          {!loading && !loadError && availableSkills.length > 0 && !filteredAvailableSkills.length ? <p role="status" className="text-sm text-slate-600">No available skills match the current search and category. Clear the filters or choose another category.</p> : null}
        </div>
        <label className="space-y-2 text-sm font-medium text-slate-700">Proficiency
          <select className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" value={level} onChange={(event) => setLevel(event.target.value)}>
          {['beginner', 'intermediate', 'advanced', 'expert'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={saving || loading || Boolean(loadError) || !selected}>{saving ? 'Saving...' : 'Add skill'}</Button>
      </form>
      <p className="mt-3 text-xs leading-5 text-slate-500">Choose a skill from the shared catalog; new catalog entries are managed by administrators so matching stays consistent.</p>
    </SectionCard>

    <SectionCard title="Skills detected from your profile and portfolio" icon={Target}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">We scan your bio, career goal, education, project descriptions, portfolio and certificates. Review suggestions before adding them; detected skills are never added without your approval.</p>
        <Button type="button" variant="outline" size="sm" disabled={detectionLoading} onClick={() => setScanRetry((current) => current + 1)}>{detectionLoading ? 'Detecting...' : 'Detect skills'}</Button>
      </div>
      {detectionData.key !== detectionKey ? <div className="h-20 animate-pulse rounded-xl bg-slate-100" /> : detectionData.error ? <RequestError error={detectionData.error} fallback="Skill suggestions could not be loaded." onRetry={() => setScanRetry((current) => current + 1)} /> : <>{detectionData.warning ? <p role="status" className="mb-3 text-sm text-amber-800">{detectionData.warning}</p> : null}{detectedSkills.length ? <div className="grid gap-3 md:grid-cols-2">{detectedSkills.map((item) => <div key={item.id} className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.category}</p></div><Button type="button" size="sm" disabled={saving} onClick={() => addSkill(item.id, level)}>{saving ? 'Adding...' : 'Add as skill'}</Button></div><p className="mt-3 text-xs font-medium text-slate-500">Found in: {item.evidence.join(', ')}</p><p className="mt-1 text-xs text-slate-500">Proficiency will be set to {level}; change the level above before adding if needed.</p></div>)}</div> : <EmptyState>{detectionData.skills.length ? 'All detected skills are already on your profile.' : 'No catalog skills were found in your profile or portfolio yet. You can still add skills from the full list above.'}</EmptyState>}</>}
    </SectionCard>

    <SectionCard title="My skills" icon={Layers3}>
      {loading ? (<div className="grid gap-4 md:grid-cols-2"><div className="h-28 animate-pulse rounded-xl bg-slate-200" /><div className="h-28 animate-pulse rounded-xl bg-slate-200" /></div>) : loadError ? <RequestError error={loadError} fallback="Your skills could not be loaded." onRetry={() => setRetry((current) => current + 1)} retryLabel="Try again" /> : skills.length ? <div className="grid gap-3 md:grid-cols-2">{skills.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4 hover:border-sky-300"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-800">{item.skills?.name}</p><Badge tone={item.level === 'advanced' || item.level === 'expert' ? 'green' : item.level === 'intermediate' ? 'blue' : 'amber'}>{item.level}</Badge></div><p className="mt-2 text-sm text-slate-500">{item.skills?.category || 'Skill category not specified'}</p><div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-sm text-slate-600" htmlFor={`skill-level-${item.id}`}>Proficiency</label><select id={`skill-level-${item.id}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={levelChanges[item.id] || item.level} onChange={(event) => setLevelChanges((current) => ({ ...current, [item.id]: event.target.value }))}>{['beginner', 'intermediate', 'advanced', 'expert'].map((option) => <option key={option}>{option}</option>)}</select><Button size="sm" variant="secondary" disabled={savingSkillId === item.id || (levelChanges[item.id] || item.level) === item.level} onClick={() => updateSkillLevel(item)}>{savingSkillId === item.id ? 'Saving...' : 'Save level'}</Button></div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{item.verified ? 'Verified' : 'Self-reported'}</span><Button variant="ghost" size="sm" disabled={deletingSkillId === item.id} className="text-rose-700 hover:bg-rose-50" onClick={() => removeSkill(item.id)}>{deletingSkillId === item.id ? 'Deleting...' : 'Delete'}</Button></div></div>)}</div> : <div className="space-y-4"><EmptyState action="Add Skill">{catalog.length && !availableSkills.length ? 'You have added all available skills.' : 'You haven’t added any skills yet.'}</EmptyState>{availableSkills.length ? <Button variant="outline" onClick={() => setSelected(availableSkills[0].id)}>Choose a skill to add</Button> : null}</div>}
    </SectionCard>

    <Link to="/student/skills/evidence" className="inline-flex font-semibold text-sky-700">View evidence graph <ArrowRight size={15} className="ml-1" /></Link>
  </div>
}

function AssessmentsView({ userId, detailId }) {
  const [libraryData, setLibraryData] = useState({ userId: '', assessments: [], results: [], error: '' })
  const [assessment, setAssessment] = useState(null)
  const [assessmentError, setAssessmentError] = useState('')
  const [loadingAssessment, setLoadingAssessment] = useState(Boolean(detailId))
  const [result, setResult] = useState(null)
  const [resultError, setResultError] = useState('')
  const [answers, setAnswers] = useState({})
  const [attempt, setAttempt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [retry, setRetry] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const attemptRequestKey = `${userId}:${detailId}`
  // Regenerate the idempotency key for each assessment visit, not on unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attemptRequestId = useMemo(() => globalThis.crypto.randomUUID(), [attemptRequestKey])
  const isResultPage = location.pathname.endsWith('/results')
  const resultId = new URLSearchParams(location.search).get('result')
  const libraryLoading = libraryData.userId !== userId || libraryData.key !== retry
  const assessments = libraryLoading ? [] : libraryData.assessments
  const results = libraryLoading ? [] : libraryData.results
  const libraryError = libraryLoading ? '' : libraryData.error

  useEffect(() => {
    let active = true
    Promise.allSettled([
      assessmentService.getLibrary(userId),
      assessmentService.getResults(userId),
    ]).then(([libraryResult, resultList]) => {
      if (!active) return
      const errors = [libraryResult, resultList]
        .filter((entry) => entry.status === 'rejected')
        .map((entry) => entry.reason?.message || 'Unable to load assessments.')
      setLibraryData({
        userId,
        key: retry,
        assessments: libraryResult.status === 'fulfilled' ? libraryResult.value || [] : [],
        results: resultList.status === 'fulfilled' ? resultList.value || [] : [],
        error: errors.join(' '),
      })
    })
    return () => { active = false }
  }, [userId, retry])

  useEffect(() => {
    let active = true
    setAssessment(null)
    setResult(null)
    setAttempt(null)
    setAnswers({})
    setSubmitError('')
    setAssessmentError('')
    setResultError('')
    if (isResultPage) {
      setLoadingAssessment(false)
      if (!resultId) {
        setResultError('The assessment result link is missing an attempt ID.')
        return () => { active = false }
      }
      assessmentService.getResult(resultId, userId)
        .then((loadedResult) => { if (active) setResult(loadedResult) })
        .catch((loadError) => {
          if (active) setResultError(loadError.message || 'Unable to load this assessment result.')
        })
      return () => { active = false }
    }
    if (!detailId) {
      setLoadingAssessment(false)
      return () => { active = false }
    }
    setLoadingAssessment(true)
    assessmentService.getAssessment(detailId)
      .then(async (loadedAssessment) => {
        const startedAttempt = await assessmentService.startAssessmentAttempt(detailId, attemptRequestId)
        if (!active) return
        setAssessment(loadedAssessment)
        setAttempt(startedAttempt)
      })
      .catch((loadError) => {
        if (active) setAssessmentError(loadError.message || 'Unable to load this assessment.')
      })
      .finally(() => { if (active) setLoadingAssessment(false) })
    return () => { active = false }
  }, [userId, detailId, isResultPage, resultId, retry, attemptRequestId])

  if (isResultPage) return <div className="space-y-6"><ModuleHeader title={result?.assessments?.title || 'Assessment results'} description="Review the result from this assessment attempt." back="/student/assessments" />{resultError ? <RequestError error={resultError} fallback="Assessment results could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : !result ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> : <SectionCard title={result.passed ? 'Assessment passed' : 'Keep building this skill'} icon={CheckCircle2}><div className="flex flex-wrap items-center gap-3"><p className="text-4xl font-bold text-slate-900">{Math.round(Number(result.percentage) || 0)}%</p><Badge tone={result.passed ? 'green' : 'amber'}>{result.passed ? 'Passed' : 'Not passed'}</Badge>{result.level ? <Badge tone="blue">{result.level}</Badge> : null}</div><p className="mt-3 text-sm text-slate-600">Completed {result.completed_at ? new Date(result.completed_at).toLocaleString() : 'date unavailable'}{result.assessments?.skills?.name ? ` · Skill: ${result.assessments.skills.name}` : ''}</p>{result.strengths?.length ? <div className="mt-4"><h3 className="font-medium text-slate-900">Strengths</h3><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{result.weaknesses?.length ? <div className="mt-4"><h3 className="font-medium text-slate-900">Areas to review</h3><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{result.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{result.recommendations?.length ? <div className="mt-4"><h3 className="font-medium text-slate-900">Recommended next steps</h3><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{result.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}</SectionCard>}</div>

  if (detailId) return <div className="space-y-6"><ModuleHeader title={assessment?.title || 'Assessment'} description={assessment?.description || 'Answer each question to record your result.'} back="/student/assessments" />{loadingAssessment ? <div className="h-64 animate-pulse rounded-2xl bg-slate-100" /> : assessmentError ? <RequestError error={assessmentError} fallback="This assessment could not be loaded or started." onRetry={() => setRetry((current) => current + 1)} /> : assessment ? <SectionCard title="Assessment questions" icon={FileText}><div className="space-y-5">{assessment.assessment_questions?.length ? assessment.assessment_questions.map((question, index) => <div key={question.id} className="rounded-xl border border-slate-200 p-4"><p className="font-medium text-slate-900">{index + 1}. {question.question}</p>{Array.isArray(question.options) ? <div className="mt-3 grid gap-2">{question.options.map((option) => <label key={option} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />{option}</label>)}</div> : <textarea className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Write your response" value={answers[question.id] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />}</div>) : <EmptyState>This assessment does not have any questions yet.</EmptyState>}{submitError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{submitError}</p> : null}<Button disabled={submitting || !attempt?.attempt_id || !assessment.assessment_questions?.length} onClick={async () => { const unanswered = assessment.assessment_questions.filter((question) => !String(answers[question.id] || '').trim()); if (unanswered.length) { setSubmitError(`Please answer all ${unanswered.length} remaining question${unanswered.length === 1 ? '' : 's'} before submitting.`); return } setSubmitting(true); setSubmitError(''); try { const response = await assessmentService.submitAssessment(attempt.attempt_id, answers, userId); const submittedResult = Array.isArray(response) ? response[0] : response; if (!submittedResult?.result_id) throw new Error('Assessment was submitted, but no result ID was returned.'); navigate(`/student/assessments/${detailId}/results?result=${encodeURIComponent(submittedResult.result_id)}`) } catch (submissionError) { setSubmitError(submissionError.message || 'Unable to submit this assessment. Please try again.') } finally { setSubmitting(false) } }}>{submitting ? 'Submitting...' : 'Submit assessment'}</Button></div></SectionCard> : <EmptyState>Assessment not found or unavailable.</EmptyState>}</div>

  return <div className="space-y-6"><ModuleHeader title="Assessments" description="Measure your skills without exposing answers before submission." />{libraryError ? <RequestError error={libraryError} fallback="Assessment data could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : null}{libraryLoading ? <div className="grid gap-6 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-slate-100" /><div className="h-72 animate-pulse rounded-2xl bg-slate-100" /></div> : <div className="grid gap-6 lg:grid-cols-2"><SectionCard title="Available assessments" icon={FileText}>{assessments.length ? <div className="space-y-3">{assessments.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.skills?.name || item.assessment_type} · {item.difficulty || 'All levels'} · {item.duration_minutes || 'Flexible'} min</p></div><Badge tone="blue">{item.status}</Badge></div><Link className="mt-3 inline-flex" to={`/student/assessments/${item.id}`}><Button size="sm">Start assessment</Button></Link></div>)}</div> : <EmptyState>There are no published assessments available yet.</EmptyState>}</SectionCard><SectionCard title="Completed assessments" icon={CheckCircle2}>{results.length ? results.map((item) => <Link to={`/student/assessments/${item.assessment_id}/results?result=${encodeURIComponent(item.id)}`} key={item.id} className="mb-3 block rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><p className="font-semibold text-slate-800">{item.assessments?.title}</p><Badge tone={item.passed ? 'green' : 'amber'}>{Math.round(Number(item.percentage) || 0)}%</Badge></div><p className="mt-1 text-sm text-slate-500">{item.passed ? 'Passed' : 'Needs another learning cycle'}</p></Link>) : <EmptyState>Completed results will appear here.</EmptyState>}</SectionCard></div>}</div>
}

function calculateCareerJourneyStage(data = {}) {
  const skills = data.skills?.length || 0
  const studentProfile = Array.isArray(data.profile?.student_profiles) ? data.profile.student_profiles[0] : data.profile?.student_profiles
  const projects = data.projects?.some((project) => project.status === 'completed') || false
  const certificates = data.certificates?.length || 0
  const learning = data.learningProgress?.some((item) => item.status === 'in_progress' || item.status === 'completed') || false
  const applications = data.applications?.some((application) => ['applied', 'under_review', 'shortlisted', 'assessment', 'interview', 'offer', 'accepted'].includes(normalizeApplicationStatus(application.status))) || false
  const interviews = data.interviews?.some((interview) => interview.status !== 'cancelled') || false
  const employment = data.employment?.some((item) => item.status === 'active' || item.status === 'on_leave') || false
  const completedEmployment = data.employment?.some((item) => item.status === 'completed') || false
  const careerProgress = data.readiness || data.careerProgress || null

  if (completedEmployment) return { index: 9, label: 'Career Development' }
  if (employment) return { index: 8, label: 'Employed' }
  if (interviews) return { index: 7, label: 'Interviewing' }
  if (applications) return { index: 6, label: 'Actively Applying' }
  if (careerProgress && Number(careerProgress.readiness_score) >= 70) return { index: 5, label: 'Job Ready' }
  if (studentProfile?.target_role && skills && data.assessments?.length) return { index: 4, label: 'Job Preparation' }
  if (projects || certificates || data.portfolio) return { index: 3, label: 'Developing Evidence' }
  if (skills || data.assessments?.length || learning) return { index: 2, label: 'Building Skills' }
  if (data.profile) return { index: 1, label: 'Exploring' }
  return { index: 0, label: 'Not Started' }
}

function CareerJourneyTimeline({ currentStage = 0, stages = ['Not Started', 'Exploring', 'Building Skills', 'Developing Evidence', 'Job Preparation', 'Job Ready', 'Actively Applying', 'Interviewing', 'Employed', 'Career Development'] }) {
  return <div className="overflow-x-auto pb-2" aria-label={`Career journey. Current stage: ${stages[currentStage]}`}>
    <ol className="flex min-w-[900px] items-start gap-1">
      {stages.map((label, index) => <li key={label} aria-current={index === currentStage ? 'step' : undefined} className="flex min-w-[72px] flex-1 items-start">
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${index < currentStage ? 'border-emerald-500 bg-emerald-500 text-white' : index === currentStage ? 'border-sky-600 bg-sky-600 text-white ring-4 ring-sky-100' : 'border-slate-300 bg-white text-slate-500'}`}>{index < currentStage ? '✓' : index + 1}</span>
          <span className={`text-[11px] font-medium ${index === currentStage ? 'text-sky-700' : 'text-slate-500'}`}>{label}</span>
        </div>
        {index < stages.length - 1 ? <span aria-hidden="true" className={`mt-4 h-0.5 flex-1 ${index < currentStage ? 'bg-emerald-400' : 'bg-slate-200'}`} /> : null}
      </li>)}
    </ol>
  </div>
}

function CareerProgressDashboard({ userId }) {
  const [retry, setRetry] = useState(0)
  const requestKey = `${userId}:${retry}`
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  const loading = result.key !== requestKey

  useEffect(() => {
    let active = true
    studentService.getCareerProgressData(userId).then((data) => {
      if (active) setResult({ key: requestKey, data, error: '' })
    }).catch((loadError) => {
      if (active) setResult({ key: requestKey, data: null, error: loadError.message || 'Unable to load your progress dashboard.' })
    })
    return () => { active = false }
  }, [requestKey, userId])

  if (loading) return <div className="space-y-5" aria-label="Loading career progress"><div className="h-40 animate-pulse rounded-2xl bg-slate-100" /><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /><div className="grid gap-4 md:grid-cols-2"><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /></div></div>
  if (result.error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{result.error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setRetry((count) => count + 1)}>Try again</Button></div>

  const data = result.data
  const journey = calculateCareerJourneyStage(data)
  const applicationsCount = data.applications.length
  const interviews = data.interviews.filter((interview) => interview.status !== 'cancelled')
  const completedLearning = data.learningProgress.filter((item) => item.status === 'completed').length
  const activeLearning = data.learningProgress.filter((item) => item.status === 'in_progress').length
  const completedProjects = data.projects.filter((project) => project.status === 'completed').length
  const completedAssessments = data.assessments.filter((assessment) => assessment.completed_at)
  const recordedReadiness = data.readiness
  const studentProfile = Array.isArray(data.profile?.student_profiles) ? data.profile.student_profiles[0] : data.profile?.student_profiles
  const recommendedActions = [
    ...(!studentProfile?.target_role ? [{ label: 'Set your target occupation', link: '/student/profile' }] : []),
    ...(data.skills.length ? [] : [{ label: 'Record your skills', link: '/student/skills' }]),
    ...(data.assessments.length ? [] : [{ label: 'Complete an assessment', link: '/student/assessments' }]),
    ...(completedProjects || data.certificates.length || data.portfolio ? [] : [{ label: 'Add portfolio evidence', link: '/student/portfolio' }]),
    ...(activeLearning || completedLearning ? [] : [{ label: 'Start a learning resource', link: '/student/learning' }]),
    ...(applicationsCount ? [] : [{ label: 'Explore suitable opportunities', link: '/student/jobs' }]),
  ]
  const activityCards = [
    { title: 'Skills', value: data.skills.length, note: 'Skills in your profile', link: '/student/skills', icon: Layers3 },
    { title: 'Education', value: data.education.length, note: 'Education records', link: '/student/profile', icon: GraduationCap },
    { title: 'Assessments', value: completedAssessments.length, note: 'Completed assessments', link: '/student/assessments', icon: CheckCircle2 },
    { title: 'Learning', value: `${completedLearning} completed`, note: activeLearning ? `${activeLearning} in progress` : 'Tracked learning activity', link: '/student/learning', icon: BookOpen },
    { title: 'Portfolio evidence', value: `${completedProjects} projects · ${data.certificates.length} certificates`, note: data.portfolio ? data.portfolio.title : 'No portfolio created', link: '/student/portfolio', icon: GraduationCap },
    { title: 'Applications', value: applicationsCount, note: 'Applications in your tracker', link: '/student/applications', icon: BriefcaseBusiness },
    { title: 'Interviews', value: interviews.length, note: 'Scheduled or completed', link: '/student/applications', icon: CheckCircle2 },
    { title: 'Employment', value: data.employment.length, note: 'Recorded roles', link: '/student/employment', icon: BriefcaseBusiness },
  ]

  return <div className="space-y-6">
    <ModuleHeader title="Career progress" description="Track real milestones across your skills, learning, portfolio, and job search." />
    <CareerGoalSummary targetRole={studentProfile?.target_role} careerGoal={studentProfile?.career_goal} />
    {data.warnings.map((warning) => <p key={warning} role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}

    <SectionCard title="Your career journey" icon={Target}>
      <CareerJourneyTimeline currentStage={journey.index} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Badge tone="blue">Current stage: {journey.label}</Badge>
        {Number.isFinite(recordedReadiness?.readiness_score) ? <Link to="/student/readiness" className="text-sm font-semibold text-sky-700">Current evidence score: {Math.round(recordedReadiness.readiness_score)}% · Details<ArrowRight size={14} className="ml-1 inline" /></Link> : <Link to="/student/readiness" className="text-sm font-semibold text-sky-700">View readiness checklist<ArrowRight size={14} className="ml-1 inline" /></Link>}
      </div>
    </SectionCard>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {activityCards.map(({ title, value, note, link, icon: Icon }) => <Link key={title} to={link} className="block">
        <Card className="h-full p-4 transition hover:border-sky-300 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div><span className="rounded-xl bg-sky-50 p-2 text-sky-700"><Icon size={18} /></span></div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">View details<ArrowRight size={13} /></span>
        </Card>
      </Link>)}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Recent applications" icon={BriefcaseBusiness}>
        {data.applications.length ? <ul className="divide-y divide-slate-100">{data.applications.slice(0, 5).map((application) => <li key={application.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="truncate font-medium text-slate-900">{application.jobs?.title || 'Opportunity'}</p><p className="mt-1 text-xs text-slate-500">Updated {application.updated_at ? new Date(application.updated_at).toLocaleDateString() : 'date unavailable'}</p></div>
          <Badge tone={['accepted', 'offer'].includes(application.status) ? 'green' : ['rejected', 'withdrawn', 'expired'].includes(application.status) ? 'slate' : 'blue'}>{formatApplicationStatus(application.status)}</Badge>
        </li>)}</ul> : <EmptyState to="/student/jobs" action="Browse jobs">Your applications will appear here after you apply.</EmptyState>}
        {data.applications.length ? <Link to="/student/applications" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Open application tracker<ArrowRight size={14} /></Link> : null}
      </SectionCard>

      <SectionCard title="Recommended next steps" icon={Bell}>
        {recommendedActions.length ? <ul className="space-y-3">{recommendedActions.slice(0, 5).map((action) => <li key={action.label}><Link to={action.link} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"><span>{action.label}</span><ArrowRight size={15} className="shrink-0 text-sky-700" /></Link></li>)}</ul> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">No immediate setup steps are outstanding. Continue building evidence and reviewing opportunities that match your target occupation.</div>}
      </SectionCard>
    </div>
    <p className="text-xs leading-5 text-slate-500">Progress is summarized from records in your SkillBridge account. Journey stages are milestone-based and do not predict employment outcomes.</p>
  </div>
}

function ReadinessView({ userId }) {
  const [retryCount, setRetryCount] = useState(0)
  const requestKey = `${userId}:${retryCount}`
  const [loadResult, setLoadResult] = useState({ key: '', data: null, error: '' })
  const loading = loadResult.key !== requestKey

  useEffect(() => {
    let active = true
    studentService.getCareerReadinessData(userId).then((data) => {
      if (active) setLoadResult({ key: requestKey, data, error: '' })
    }).catch((loadError) => {
      if (active) setLoadResult({ key: requestKey, data: null, error: loadError.message || 'Unable to load your career-readiness information.' })
    })
    return () => { active = false }
  }, [requestKey, userId])

  const data = loading ? null : loadResult.data
  if (loading) return <div className="space-y-4" aria-label="Loading career readiness"><div className="h-36 animate-pulse rounded-2xl bg-slate-100" /><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (loadResult.error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{loadResult.error}</p><Button className="mt-3" variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>Try again</Button></div>

  const studentProfile = Array.isArray(data.profile?.student_profiles) ? data.profile.student_profiles[0] : data.profile?.student_profiles
  const completedAssessments = getLatestAssessmentResults(data.assessments)
  const assessmentAverage = calculateAssessmentAverage(data.assessments)
  const completedProjects = data.projects.filter((project) => project.status === 'completed')
  const learningMetrics = calculateLearningProgressMetrics(data.learningProgress)
  const verifiedCertificates = data.certificates.filter(isCertificateIndependentlyVerified).length
  const readinessChecks = [
    {
      label: 'Target occupation',
      detail: studentProfile?.target_role ? 'Saved on your career profile.' : 'Set a target occupation to make searches and recommendations more relevant.',
      complete: Boolean(studentProfile?.target_role?.trim()),
      to: '/student/profile',
      action: 'Update profile',
    },
    {
      label: 'Skills profile',
      detail: data.skills.length ? `${data.skills.length} skill${data.skills.length === 1 ? '' : 's'} recorded.` : 'Add skills you can demonstrate with experience or evidence.',
      complete: data.skills.length > 0,
      to: '/student/skills',
      action: 'Review skills',
    },
    {
      label: 'Education history',
      detail: data.education.length
        ? `${data.education.length} education record${data.education.length === 1 ? '' : 's'} recorded.`
        : studentProfile?.education_level
          ? `Education level: ${studentProfile.education_level}. Add institution and qualification details for more context.`
          : 'Add your education level and qualification details.',
      complete: data.education.length > 0 || Boolean(studentProfile?.education_level),
      to: '/student/profile',
      action: 'Add education',
    },
    {
      label: 'Assessments',
      detail: completedAssessments.length
        ? `${completedAssessments.length} distinct assessments with results · latest-attempt average ${assessmentAverage}%.`
        : 'Complete an assessment to record demonstrated knowledge.',
      complete: completedAssessments.length > 0,
      to: '/student/assessments',
      action: 'Take assessment',
    },
    {
      label: 'Portfolio evidence',
      detail: `${completedProjects.length} completed project${completedProjects.length === 1 ? '' : 's'} · ${data.certificates.length} certificate${data.certificates.length === 1 ? '' : 's'} (${verifiedCertificates} independently verified).`,
      complete: completedProjects.length > 0 || data.certificates.length > 0 || Boolean(data.portfolio),
      to: '/student/portfolio',
      action: 'Build portfolio',
    },
    {
      label: 'Learning activity',
      detail: learningMetrics.trackedCount
        ? `${learningMetrics.average}% average progress across ${learningMetrics.trackedCount} tracked learning item${learningMetrics.trackedCount === 1 ? '' : 's'}.`
        : 'Start a learning resource to work toward your target occupation.',
      complete: learningMetrics.trackedCount > 0,
      to: '/student/learning',
      action: 'Explore learning',
    },
  ]
  const completedChecks = readinessChecks.filter((check) => check.complete).length
  const readiness = data.readiness
  const recordedScores = [
    [readiness?.target_career ? 'Target-career skill coverage' : 'Self-reported skill levels', readiness?.skills_score, readiness?.evidence_availability.skills],
    ['Assessment average', readiness?.assessment_score, readiness?.evidence_availability.assessments],
    ['Project completion', readiness?.projects_score, readiness?.evidence_availability.projects],
    ['Verified certificates', readiness?.certificate_score, readiness?.evidence_availability.certificates],
    ['Learning progress', readiness?.learning_score, readiness?.evidence_availability.learning],
  ]

  return <div className="space-y-6">
    <ModuleHeader title="Career readiness" description="Review the profile evidence you have recorded and the next steps that can strengthen it." />
    <CareerGoalSummary targetRole={studentProfile?.target_role} careerGoal={studentProfile?.career_goal} />
    {data.warnings.map((warning) => <p key={warning} role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}

    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Card className="flex flex-col justify-between bg-gradient-to-br from-sky-800 to-slate-900 p-5 text-white sm:p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-100">Career setup checklist</p>
          <p className="mt-5 text-4xl font-bold">{completedChecks} of {readinessChecks.length}</p>
          <p className="mt-2 text-sm text-sky-100">setup steps recorded</p>
        </div>
        <details className="mt-4 text-xs leading-5 text-sky-100">
          <summary className="cursor-pointer font-semibold">How is this counted?</summary>
          <p className="mt-2">One step is counted for each recorded target occupation, skills profile, education history, assessment result, portfolio evidence, and tracked learning activity. It is separate from Profile Completion and Evidence Readiness.</p>
        </details>
      </Card>

      <SectionCard title="Your readiness signals" icon={Target}>
        <div className="grid gap-3 sm:grid-cols-2">
          {readinessChecks.map((check) => <div key={check.label} className={`rounded-xl border p-4 ${check.complete ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900">{check.label}</h4>
              <Badge tone={check.complete ? 'green' : 'amber'}>{check.complete ? 'Recorded' : 'Next step'}</Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-600">{check.detail}</p>
            {!check.complete ? <Link to={check.to} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">{check.action}<ArrowRight size={14} /></Link> : null}
          </div>)}
        </div>
      </SectionCard>
    </div>

    <SectionCard title="Evidence Readiness" icon={CheckCircle2}>
      {readiness?.has_evidence ? <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-sky-50 p-4">
          <div><p className="text-sm text-slate-600">Weighted indicator from recorded evidence</p><p className="mt-1 text-3xl font-bold text-slate-900">{readiness.readiness_score}%</p></div>
          <p className="max-w-sm text-sm text-slate-600">Weights: {readiness.target_career ? 'target-career skill coverage' : 'self-reported skill levels'} 30%, assessments 30%, project completion 15%, verified certificates 10%, learning progress 15%. Unrecorded categories contribute zero.</p>
        </div>
        {readiness.target_career ? <p className="mb-4 text-sm text-slate-600">Selected career: <span className="font-medium text-slate-800">{readiness.target_career}</span>. Self-reported skill levels average {readiness.self_reported_skills_score ?? 'No data'}{readiness.self_reported_skills_score !== null ? '%' : ''} and are distinct from assessment evidence.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordedScores.map(([label, value, available]) => <div key={label} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm"><span className="font-medium text-slate-700">{label}</span><span className="font-semibold text-slate-900">{available ? `${Math.round(Number(value))}%` : 'No data'}</span></div>
            {available ? <ProgressBar value={Math.max(0, Math.min(100, Number(value)))} tone={value >= 70 ? 'green' : value >= 45 ? 'blue' : 'amber'} /> : <p className="text-xs text-slate-500">No records to calculate this signal.</p>}
          </div>)}
        </div>
        {readiness.target_career ? <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Competency gaps for {readiness.target_career}</h3>
          {readiness.skill_gaps.length ? <ul className="mt-3 space-y-2 text-sm text-slate-600">{readiness.skill_gaps.map((gap) => <li key={gap.name} className="flex flex-wrap items-center justify-between gap-2"><span>{gap.name}: {gap.currentLevel} recorded, {gap.requiredLevel} required</span><Badge tone={gap.severity === 'high' ? 'amber' : 'blue'}>{gap.severity} gap</Badge></li>)}</ul> : <p className="mt-2 text-sm text-emerald-800">No gaps found in the currently recorded skill profile.</p>}
        </div> : null}
      </> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <p>{data.warnings.length ? 'Evidence readiness is unavailable because some records could not be loaded. Retry to get a complete calculation.' : 'There is not enough measurable evidence to calculate a percentage yet. The checklist above shows setup steps only.'}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>Reload evidence</Button>
        <Link to="/student/career" className="mt-3 inline-flex items-center gap-1 font-semibold text-sky-700">Explore career guidance<ArrowRight size={14} /></Link>
      </div>}
    </SectionCard>
    <p className="text-xs leading-5 text-slate-500">Evidence Readiness is recalculated from current records. Skills, assessments, projects, certificates, and learning evidence are counted once in separate categories; the portfolio container and employment history do not add duplicate score credit. This is not a prediction of employment outcomes.</p>
  </div>
}

function StudentFeedbackView({ userId }) {
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [disputeId, setDisputeId] = useState('')
  const [disputeNotes, setDisputeNotes] = useState('')
  const [savingId, setSavingId] = useState('')
  const [actionErrors, setActionErrors] = useState({})
  const requestKey = `${userId}:${retry}`
  const [result, setResult] = useState({ key: '', feedback: [], error: '' })
  const loading = result.key !== requestKey

  useEffect(() => {
    let active = true
    feedbackService.listForStudent(userId).then((feedback) => {
      if (active) setResult({ key: requestKey, feedback, error: '' })
    }).catch((error) => {
      if (active) setResult({ key: requestKey, feedback: [], error: error.message || 'Unable to load your feedback.' })
    })
    return () => { active = false }
  }, [requestKey, userId])

  const feedback = loading ? [] : result.feedback
  const filteredFeedback = feedback.filter((item) => {
    const text = `${item.employer_profiles?.company_name || ''} ${item.feedback_type || ''} ${item.jobs?.title || ''} ${item.project_name || ''} ${item.overall_summary || ''}`.toLowerCase()
    const matchesSearch = text.includes(search.trim().toLowerCase())
    const acknowledgement = item.employer_feedback_acknowledgements?.find((entry) => entry.student_id === userId)
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'needs-response'
      ? !acknowledgement || acknowledgement.status === 'pending'
      : acknowledgement?.status === statusFilter)
    return matchesSearch && matchesStatus
  })
  const pendingCount = feedback.filter((item) => {
    const acknowledgement = item.employer_feedback_acknowledgements?.find((entry) => entry.student_id === userId)
    return !acknowledgement || acknowledgement.status === 'pending'
  }).length

  const acknowledge = async (feedbackId, status, notes = '') => {
    setSavingId(feedbackId)
    setActionErrors((current) => ({ ...current, [feedbackId]: '' }))
    try {
      await feedbackService.acknowledgeFeedback(feedbackId, userId, status, notes)
      if (status === 'disputed') {
        setDisputeId('')
        setDisputeNotes('')
      }
      setRetry((count) => count + 1)
    } catch (error) {
      setActionErrors((current) => ({ ...current, [feedbackId]: error.message || 'Unable to update your response.' }))
    } finally {
      setSavingId('')
    }
  }

  return <div className="space-y-6">
    <ModuleHeader title="Feedback" description="Review employer and supervisor feedback, competency evidence, and suggested development steps." />

    <div className="grid gap-3 sm:grid-cols-3">
      {[['Feedback received', feedback.length], ['Needs your response', pendingCount], ['Acknowledged or disputed', feedback.length - pendingCount]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{loading ? '—' : value}</p></Card>)}
    </div>

    {result.error ? <RequestError error={result.error} fallback="Your feedback could not be loaded." onRetry={() => setRetry((count) => count + 1)} /> : null}

    <Card className="p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <label><span className="sr-only">Search feedback</span><span className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employer, role or feedback" /></span></label>
        <label><span className="sr-only">Filter by response</span><select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All feedback</option><option value="needs-response">Needs response</option><option value="acknowledged">Acknowledged</option><option value="disputed">Disputed</option></select></label>
        <Button variant="outline" onClick={() => setRetry((count) => count + 1)} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
      </div>
    </Card>

    {loading ? <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading feedback"><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /></div>
      : filteredFeedback.length ? <div className="space-y-4">{filteredFeedback.map((item) => {
        const acknowledgement = item.employer_feedback_acknowledgements?.find((entry) => entry.student_id === userId)
        const competencies = item.employer_feedback_competencies || []
        const ratedCompetencies = competencies.filter((entry) => !entry.not_observed && Number(entry.rating) > 0)
        const averageRating = ratedCompetencies.length ? ratedCompetencies.reduce((total, entry) => total + Number(entry.rating), 0) / ratedCompetencies.length : null
        const status = acknowledgement?.status || 'pending'
        const badgeTone = status === 'acknowledged' ? 'green' : status === 'disputed' ? 'amber' : 'blue'
        const date = item.review_date ? new Date(`${item.review_date}T00:00:00`).toLocaleDateString() : 'Date not provided'
        return <Card key={item.id} className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-900">{item.employer_profiles?.company_name || item.organization || 'Employer'}</h3><Badge tone={badgeTone}>{status === 'pending' ? 'Needs response' : status}</Badge></div>
                <p className="mt-1 text-sm text-slate-600">{item.feedback_type?.replaceAll('_', ' ')}{item.jobs?.title ? ` · ${item.jobs.title}` : item.project_name ? ` · ${item.project_name}` : ''}</p>
                <p className="mt-1 text-xs text-slate-500">{item.reviewer_role || 'Supervisor'} · Reviewed {date}</p>
              </div>
              {averageRating !== null ? <div className="rounded-xl border border-sky-100 bg-white px-4 py-2 text-right"><p className="text-xs text-slate-500">Competency average</p><p className="font-semibold text-slate-900">{averageRating.toFixed(1)}<span className="text-sm font-normal text-slate-500"> / 5</span></p></div> : null}
            </div>
            {item.overall_summary ? <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-700">{item.overall_summary}</p> : <p className="mt-4 text-sm italic text-slate-500">No overall summary was provided.</p>}
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {competencies.length ? <section><h4 className="mb-3 text-sm font-semibold text-slate-900">Competency review</h4><div className="grid gap-3 md:grid-cols-2">{competencies.map((competency) => <div key={competency.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium text-slate-900">{competency.name}</p><Badge tone={competency.not_observed ? 'slate' : Number(competency.rating) >= 4 ? 'green' : Number(competency.rating) >= 3 ? 'blue' : 'amber'}>{competency.not_observed ? 'Not observed' : competency.rating_label || `${competency.rating}/5`}</Badge></div>
              {!competency.not_observed && competency.rating ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${competency.name} rating`} aria-valuenow={Number(competency.rating) * 20} aria-valuemin="0" aria-valuemax="100"><div className="h-full rounded-full bg-sky-600" style={{ width: `${Number(competency.rating) * 20}%` }} /></div> : null}
              {competency.evidence ? <p className="mt-3 text-sm leading-5 text-slate-600">{competency.evidence}</p> : null}
              {competency.comment ? <p className="mt-2 text-sm leading-5 text-slate-600">{competency.comment}</p> : null}
            </div>)}</div></section> : null}

            {(item.strengths || item.improvement_areas) ? <div className="grid gap-3 md:grid-cols-2">
              {item.strengths ? <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Strengths</h4><p className="mt-2 whitespace-pre-line text-sm leading-5 text-slate-700">{item.strengths}</p></section> : null}
              {item.improvement_areas ? <section className="rounded-xl border border-amber-100 bg-amber-50/50 p-4"><h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Areas to develop</h4><p className="mt-2 whitespace-pre-line text-sm leading-5 text-slate-700">{item.improvement_areas}</p></section> : null}
            </div> : null}
            {item.evidence ? <section><h4 className="text-sm font-semibold text-slate-900">Supporting examples</h4><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{item.evidence}</p></section> : null}
            {(item.development_plan || item.next_review_goals) ? <section className="rounded-xl border border-sky-100 bg-sky-50/70 p-4"><h4 className="text-sm font-semibold text-sky-900">Development plan</h4>{item.development_plan ? <p className="mt-2 whitespace-pre-line text-sm leading-5 text-slate-700">{item.development_plan}</p> : null}{item.next_review_goals ? <><h5 className="mt-3 text-xs font-semibold uppercase tracking-wide text-sky-800">Next review goals</h5><p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-700">{item.next_review_goals}</p></> : null}</section> : null}
            {acknowledgement?.notes ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span className="font-semibold">Your response:</span> {acknowledgement.notes}</p> : null}
            {actionErrors[item.id] ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionErrors[item.id]}</p> : null}

            {disputeId === item.id ? <form className="rounded-xl border border-amber-200 bg-amber-50/60 p-4" onSubmit={(event) => { event.preventDefault(); void acknowledge(item.id, 'disputed', disputeNotes.trim()) }}>
              <label htmlFor={`feedback-dispute-${item.id}`} className="block text-sm font-semibold text-slate-900">What would you like the employer to review?</label>
              <textarea id={`feedback-dispute-${item.id}`} required minLength={5} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={disputeNotes} onChange={(event) => setDisputeNotes(event.target.value)} placeholder="Briefly explain which part of the feedback you disagree with." />
              <div className="mt-3 flex flex-wrap gap-2"><Button type="submit" size="sm" variant="danger" disabled={savingId === item.id}>{savingId === item.id ? 'Sending…' : 'Submit dispute'}</Button><Button type="button" size="sm" variant="outline" disabled={savingId === item.id} onClick={() => { setDisputeId(''); setDisputeNotes('') }}>Cancel</Button></div>
            </form> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              {status !== 'acknowledged' ? <Button type="button" size="sm" disabled={savingId === item.id} onClick={() => void acknowledge(item.id, 'acknowledged')}>{savingId === item.id ? 'Saving…' : 'Acknowledge feedback'}</Button> : <p className="text-sm font-medium text-emerald-700"><CheckCircle2 size={16} className="mr-1 inline" /> You acknowledged this feedback</p>}
              {status !== 'disputed' && disputeId !== item.id ? <Button type="button" size="sm" variant="outline" disabled={savingId === item.id} onClick={() => { setDisputeId(item.id); setDisputeNotes(acknowledgement?.notes || '') }}>Dispute feedback</Button> : null}
              {status === 'disputed' ? <Badge tone="amber">Dispute submitted for review</Badge> : null}
            </div>
          </div>
        </Card>
      })}</div> : feedback.length ? <EmptyState>No feedback matches these search and response filters. Try changing or clearing the filters.</EmptyState> : <EmptyState>No feedback has been shared with you yet. Feedback from an employer or supervisor will appear here when it is submitted.</EmptyState>}
  </div>
}

function LearningView({ userId }) {
  const [data, setData] = useState({ key: '', resources: [], path: null, error: '', pathError: '' })
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [savingResourceId, setSavingResourceId] = useState('')
  const [actionError, setActionError] = useState('')
  const requestKey = `${userId}:${retry}`
  const loading = data.key !== requestKey
  const resources = loading ? [] : data.resources
  const path = loading ? null : data.path
  const error = loading ? '' : data.error
  const pathError = loading ? '' : data.pathError
  const pathResourceIds = (path?.learning_path_resources || [])
    .map((item) => item.resource_id || item.learning_resources?.id)
    .filter(Boolean)
  const completedPathResources = pathResourceIds.filter((resourceId) =>
    resources.find((resource) => resource.id === resourceId)?.progress?.status === 'completed',
  ).length
  const pathProgress = pathResourceIds.length
    ? Math.round((completedPathResources / pathResourceIds.length) * 100)
    : path?.progress || 0
  const filteredResources = resources.filter((resource) => [
    resource.title,
    resource.description,
    resource.resource_type,
    resource.category,
    resource.skills?.name,
    ...(resource.relatedSkills || []).map((skill) => skill.name),
    ...(resource.relatedCareers || []).map((career) => career.title),
    resource.provider,
  ].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  const learningMetrics = calculateLearningProgressMetrics(
    resources.map((resource) => resource.progress).filter(Boolean),
  )

  useEffect(() => {
    let active = true
    Promise.allSettled([
      learningService.getResources(userId),
      learningService.getPath(userId),
    ]).then(([resourceResult, pathResult]) => {
      if (!active) return
      setData({
        key: requestKey,
        resources: resourceResult.status === 'fulfilled' ? resourceResult.value || [] : [],
        path: pathResult.status === 'fulfilled' ? pathResult.value : null,
        error: resourceResult.status === 'rejected'
          ? resourceResult.reason?.message || 'Unable to load learning resources.'
          : '',
        pathError: pathResult.status === 'rejected'
          ? pathResult.reason?.message || 'Unable to load your learning path.'
          : '',
      })
    })
    return () => { active = false }
  }, [userId, requestKey])

  const updateProgress = async (resource) => {
    setSavingResourceId(resource.id)
    setActionError('')
    const now = new Date().toISOString()
    try {
      const savedProgress = await learningService.updateProgress(buildLearningProgressUpdate(userId, resource, now))
      if (savedProgress.student_id !== userId || savedProgress.resource_id !== resource.id) {
        throw new Error('The saved learning-progress record did not match the requested update.')
      }
      setData((current) => current.key === requestKey
        ? {
          ...current,
          resources: applySavedLearningProgress(current.resources, savedProgress),
        }
        : current)
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to save your learning progress.')
    } finally {
      setSavingResourceId('')
    }
  }

  return <div className="space-y-6">
    <ModuleHeader title="Learning" description="Find useful learning resources, follow your path and record your progress." />
    <StudentSkillInsights userId={userId} mode="learning" />
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Learning Progress</h2>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? 'Loading your learning records.'
              : learningMetrics.average === null
              ? 'No resources are currently marked in progress or completed.'
              : `Average progress across ${learningMetrics.trackedCount} tracked learning item${learningMetrics.trackedCount === 1 ? '' : 's'}; each resource is counted once.`}
          </p>
        </div>
        <p className="text-2xl font-bold text-slate-900">
          {loading ? 'Loading…' : learningMetrics.average === null ? 'Not started' : `${learningMetrics.average}%`}
        </p>
      </div>
    </Card>
    {pathError ? <RequestError error={pathError} fallback="Your resources are available, but your personal learning path could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : null}
    {path ? <SectionCard title={path.title || 'Your learning path'} icon={BookOpen}>
      <p className="text-sm text-slate-600">{path.description}{path.careers?.title ? ` · Target career: ${path.careers.title}` : ''}</p>
      <div className="mt-3 flex items-center gap-3"><ProgressBar value={pathProgress} tone="blue" /><Badge tone="blue">{pathProgress}%</Badge></div>
      <p className="mt-2 text-xs text-slate-500">Path completion counts completed resources within this path; it is separate from Learning Progress across all tracked resources.</p>
      {pathResourceIds.length ? <p className="mt-2 text-xs text-slate-500">{completedPathResources} of {pathResourceIds.length} resources completed</p> : null}
      {path.learning_path_resources?.length ? <ol className="mt-4 space-y-2">{[...path.learning_path_resources].sort((left, right) => left.sequence_order - right.sequence_order).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span><span className="mr-2 text-slate-400">{item.sequence_order}.</span>{item.learning_resources?.title || 'Learning resource'}{item.required ? <span className="ml-2 text-xs text-slate-500">Required</span> : null}</span>{/^https:\/\//i.test(item.learning_resources?.url || '') ? <a className="font-medium text-sky-800 underline" href={item.learning_resources.url} target="_blank" rel="noreferrer">Open resource</a> : null}</li>)}</ol> : <p className="mt-4 text-sm text-slate-500">No resources have been added to this path yet. Browse the resource library below.</p>}
    </SectionCard> : null}
    {actionError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p> : null}
    <label className="relative block"><span className="sr-only">Search learning resources</span><Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" /><input className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm" placeholder="Search resources by title, skill or type" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {error ? <RequestError error={error} fallback="Learning resources could not be loaded." onRetry={() => setRetry((current) => current + 1)} /> : loading ? <div className="grid gap-4 md:grid-cols-2" aria-label="Loading learning resources"><div className="h-40 animate-pulse rounded-xl bg-slate-200" /><div className="h-40 animate-pulse rounded-xl bg-slate-200" /></div> : filteredResources.length ? <div className="grid gap-4 md:grid-cols-2">{filteredResources.map((resource) => {
      const completed = resource.progress?.status === 'completed'
      const resourceUrl = /^https?:\/\//i.test(resource.url || '') ? resource.url : ''
      return <Card key={resource.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{resource.title}</h3><p className="mt-1 text-xs capitalize text-slate-500">{resource.resource_type?.replace('_', ' ')}{resource.category ? ` · ${resource.category}` : ''}{resource.provider ? ` · ${resource.provider}` : ''}{resource.duration_minutes ? ` · ${resource.duration_minutes} min` : ''}</p></div><Badge tone={completed ? 'green' : resource.progress?.status === 'in_progress' ? 'blue' : 'slate'}>{completed ? 'Completed' : resource.progress?.status === 'in_progress' ? 'In progress' : 'Not started'}</Badge></div><p className="mt-3 text-sm leading-6 text-slate-600">{resource.description}</p>{resource.relatedSkills?.length ? <div className="mt-3 flex flex-wrap gap-2">{resource.relatedSkills.map((skill) => <Badge key={skill.id} tone="blue">{skill.name}</Badge>)}</div> : resource.skills?.name ? <div className="mt-3"><Badge tone="blue">{resource.skills.name}</Badge></div> : null}{resource.relatedCareers?.length ? <p className="mt-3 text-xs text-slate-500">Related careers: {resource.relatedCareers.map((career) => career.title).join(', ')}</p> : null}{resource.progress?.status === 'in_progress' ? <div className="mt-4"><ProgressBar value={resource.progress.progress || 0} tone="blue" /></div> : null}<div className="mt-4 flex flex-wrap gap-2">{resourceUrl ? <a className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={resourceUrl} target="_blank" rel="noreferrer">Open resource</a> : null}<Button size="sm" variant={completed ? 'outline' : 'primary'} disabled={savingResourceId === resource.id} onClick={() => updateProgress(resource)}>{savingResourceId === resource.id ? 'Saving...' : completed ? 'Resume learning' : resource.progress?.status === 'in_progress' ? 'Mark complete' : 'Start learning'}</Button></div></Card>
    })}</div> : <EmptyState>{search ? 'No learning resources match your search.' : 'No learning resources are available yet.'}</EmptyState>}
  </div>
}

function GenericListView({
  mode,
  userId,
  candidateType = 'student',
  onCandidateTypeChange,
  candidateTypeSaving = false,
  candidateTypeSaveError = '',
}) {
  const pageSize = 12
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [listingScope, setListingScope] = useState('employment')
  const [employmentType, setEmploymentType] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadState, setLoadState] = useState({ key: '', error: '' })
  const requestKey = `${mode}:${userId}:${candidateType}:${listingScope}:${employmentType}:${page}:${debouncedSearch}:${retryCount}`
  const loading = loadState.key !== requestKey
  const error = loadState.key === requestKey ? loadState.error : ''
  const availableEmploymentTypes = getEmploymentListingTypes(candidateType, listingScope)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    let active = true
    const calls = {
      learning: () => learningService.getResources(userId),
      jobs: () => jobService.getJobs({
        limit: pageSize + 1,
        offset: page * pageSize,
        search: debouncedSearch,
        candidateType,
        listingScope,
        employmentType,
      }),
      applications: () => applicationService.getApplications(userId),
      portfolio: () => portfolioService.getOverview(userId),
      notifications: () => notificationService.list(userId),
      employment: () => employmentService.list(userId),
      readiness: () => studentService.getDashboard(userId),
      progress: () => studentService.getDashboard(userId),
      settings: () => profileService.getProfile(userId),
    }

    calls[mode]?.().then((result) => {
      if (!active) return
      if (mode === 'portfolio') setItems(result.projects || [])
      else if (mode === 'readiness' || mode === 'progress') setItems(result.careerProgress || [])
      else if (mode === 'jobs') {
        setHasMore(result.length > pageSize)
        setItems(result.slice(0, pageSize))
      } else setItems(Array.isArray(result) ? result : [result].filter(Boolean))
    }).catch((loadError) => {
      if (active) setLoadState({
        key: requestKey,
        error: mode === 'jobs'
          ? loadError.message || 'Unable to load published jobs. Check your connection and try again.'
          : 'Unable to load this section. Check your connection and try again.',
      })
    }).finally(() => {
      if (active) setLoadState((current) => ({ key: requestKey, error: current.key === requestKey ? current.error : '' }))
    })

    return () => { active = false }
  }, [mode, userId, page, debouncedSearch, retryCount, requestKey, candidateType, listingScope, employmentType])

  const filtered = useMemo(() => mode === 'jobs'
    ? items
    : items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [items, search, mode])
  const titles = { learning: 'Learning resources', jobs: 'Jobs & Employment', applications: 'Applications', portfolio: 'Portfolio projects', notifications: 'Notifications', employment: 'Employment journey', readiness: 'Readiness evidence', progress: 'Career progress', settings: 'Account settings' }
  const icons = { learning: BookOpen, jobs: BriefcaseBusiness, applications: FileText, portfolio: GraduationCap, notifications: Bell, employment: Target, readiness: Target, progress: CheckCircle2, settings: Settings }
  const Icon = icons[mode] || Search
  const clearJobFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setEmploymentType('')
    setListingScope('employment')
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title={titles[mode]} description={CONFIG[mode][1]} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">{mode === 'jobs' ? 'Search published jobs' : 'Search this space'}</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" />
          <input className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm" placeholder={mode === 'jobs' ? 'Search job titles and descriptions' : 'Search this space'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} />
        </label>
        {mode === 'jobs' ? (
          <>
            <label className="sm:w-48">
              <span className="sr-only">Candidate type</span>
              <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" value={candidateType} disabled={candidateTypeSaving} onChange={(event) => { setEmploymentType(''); setPage(0); onCandidateTypeChange?.(event.target.value) }}>
                <option value="student">Student</option>
                <option value="graduate">Graduate</option>
              </select>
            </label>
            <label className="sm:w-64">
              <span className="sr-only">Opportunity category</span>
              <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" value={listingScope} onChange={(event) => { setListingScope(event.target.value); setEmploymentType(''); setPage(0) }}>
                <option value="employment">Employment jobs</option>
                <option value="all">All relevant opportunities</option>
              </select>
            </label>
            <label className="sm:w-52">
              <span className="sr-only">Employment type</span>
              <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" value={employmentType} onChange={(event) => { setEmploymentType(event.target.value); setPage(0) }}>
                <option value="">{listingScope === 'all' ? 'All relevant types' : 'All employment types'}</option>
                {availableEmploymentTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
          </>
        ) : null}
        {mode === 'notifications' ? <Button variant="outline" size="sm" onClick={() => notificationService.markAllRead(userId).then(() => setItems((current) => current.map((item) => ({ ...item, is_read: true }))))}>Mark all read</Button> : null}
      </div>
      {mode === 'jobs' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div>
            <p role="status">Showing {listingScope === 'all' ? 'all relevant opportunities' : 'employment jobs'} for {candidateType === 'graduate' ? 'graduates' : 'students'}{employmentType ? ` · ${employmentType.replace(/_/g, ' ')}` : ''}.</p>
            {candidateTypeSaveError ? <p role="alert" className="mt-1 text-rose-700">{candidateTypeSaveError}</p> : null}
          </div>
          <Button variant="outline" size="sm" onClick={clearJobFilters} disabled={!search && !employmentType && listingScope === 'employment'}>Clear filters</Button>
        </div>
      ) : null}
      {mode === 'jobs' ? <JobMatchRecommendations userId={userId} /> : null}
      {error ? <EmptyState>{error}<Button variant="outline" size="sm" className="mt-3" onClick={() => setRetryCount((count) => count + 1)}>Try again</Button></EmptyState> : loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-label={`Loading ${titles[mode].toLowerCase()}`}>
          <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
        </div>
      ) : filtered.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon size={17} aria-hidden="true" className="shrink-0 text-sky-700" />
                      <h3 className="font-semibold text-slate-900">{item.title || item.jobs?.title || item.assessments?.title || item.position || 'Career record'}</h3>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.description || item.message || item.jobs?.description || item.employer_profiles?.company_name || item.status || 'Evidence record'}</p>
                  </div>
                  {item.match_score ? <Badge tone="green">{Math.round(item.match_score)}%</Badge> : item.is_read === false ? <Badge tone="amber">Unread</Badge> : null}
                </div>
                {item.progress !== undefined ? <div className="mt-4"><ProgressBar value={item.progress} tone="blue" /></div> : null}
                {mode === 'jobs' ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><span>{item.location || 'Malawi'}</span><span aria-hidden="true">·</span><span>{item.opportunity_type?.replace(/_/g, ' ') || item.employment_type?.replace(/_/g, ' ')}</span></div> : null}
                {mode === 'jobs' ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><span>{item.salary_min || item.salary_max ? `${item.currency || 'MWK'} ${item.salary_min || ''}${item.salary_min && item.salary_max ? ' - ' : ''}${item.salary_max || ''}` : 'Salary not specified'}</span>{item.application_deadline ? <><span aria-hidden="true">·</span><span>Apply by {item.application_deadline}</span></> : null}</div> : null}
                {mode === 'applications' ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600"><span>{item.jobs?.title || 'Position'}</span><span aria-hidden="true">·</span><span>{formatApplicationStatus(item.status || 'applied')}</span></div> : null}
                {mode === 'notifications' ? <div className="mt-3 flex items-center justify-between text-xs text-slate-600"><span>{new Date(item.created_at).toLocaleDateString()}</span><Link to="/student/notifications" className="font-medium text-sky-800">View</Link></div> : null}
                {mode === 'jobs' ? <Link className="mt-4 inline-flex" to={`/student/jobs/${item.id}`}><Button size="sm" variant="outline">View job and apply</Button></Link> : null}
              </Card>
            ))}
          </div>
          {mode === 'jobs' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-600">Page {page + 1}{hasMore ? ' · More jobs available' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)}>Next jobs</Button>
              </div>
            </div>
          ) : null}
        </>
      ) : <EmptyState>{mode === 'jobs' ? 'No published jobs match that search.' : 'Nothing is available here yet.'}</EmptyState>}
    </div>
  )
}

function JobDetailView({ userId, jobId, candidateType = 'student' }) {
  const [job, setJob] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    jobService.getJob(jobId, candidateType)
      .then((loadedJob) => { if (active) setJob(loadedJob) })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load this job.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId, candidateType])
  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
  if (error || !job) return <div className="space-y-3"><EmptyState>{error || 'This job is unavailable or no longer published.'}</EmptyState><Link to="/student/jobs"><Button variant="outline">Back to jobs</Button></Link></div>

  const runAction = async (actionName, callback, successMessage) => {
    setAction(actionName)
    setError('')
    setMessage('')
    try {
      await callback()
      setMessage(successMessage)
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete this action.')
    } finally {
      setAction('')
    }
  }

  const requiredSkills = (job.job_skills || []).filter((item) => item.is_required !== false)
  const preferredSkills = (job.job_skills || []).filter((item) => item.is_required === false)
  const renderSkill = (item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><span className="font-medium">{item.skills?.name}</span><span className="text-sm text-slate-500">{item.required_level}</span></div>

  return <div className="space-y-6">
    <ModuleHeader title={job.title} description={`${job.employer_profiles?.company_name || 'Employer'} · ${job.location || 'Malawi'}`} back="/student/jobs" />
    <SectionCard title="Job details" icon={BriefcaseBusiness}>
      <div className="flex flex-wrap gap-2"><Badge tone="blue">{job.opportunity_type?.replace(/_/g, ' ') || job.employment_type?.replace(/_/g, ' ')}</Badge><Badge tone="slate">{job.work_mode || 'Work mode not specified'}</Badge>{job.application_deadline ? <Badge tone="amber">Deadline {job.application_deadline}</Badge> : null}</div>
      <p className="mt-5 whitespace-pre-line leading-7 text-slate-600">{job.description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Salary</p><p className="mt-1 font-medium">{job.salary_min || job.salary_max ? `${job.currency} ${job.salary_min || ''} - ${job.salary_max || ''}` : 'Not specified'}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Education</p><p className="mt-1 font-medium">{job.education_required || 'Not specified'}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Experience</p><p className="mt-1 font-medium">{job.experience_required || 'Not specified'}</p></div>
      </div>
    </SectionCard>
    <SectionCard title="Required and preferred skills" icon={Layers3}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-semibold text-slate-800">Required ({requiredSkills.length})</h3><div className="space-y-2">{requiredSkills.length ? requiredSkills.map(renderSkill) : <EmptyState>No required skills are listed.</EmptyState>}</div></div>
        <div><h3 className="mb-2 text-sm font-semibold text-slate-800">Preferred ({preferredSkills.length})</h3><div className="space-y-2">{preferredSkills.length ? preferredSkills.map(renderSkill) : <EmptyState>No preferred skills are listed.</EmptyState>}</div></div>
      </div>
    </SectionCard>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={Boolean(action)} onClick={() => runAction('save', () => jobService.saveJob(userId, jobId), 'Job saved to your list.')}>{action === 'save' ? 'Saving...' : 'Save job'}</Button><Button disabled={Boolean(action)} onClick={() => runAction('apply', () => jobService.applyToJob(userId, jobId), 'Application submitted successfully.')}>{action === 'apply' ? 'Submitting...' : 'Apply now'}</Button>{message ? <span role="status" className="text-sm text-emerald-700">{message}</span> : null}{error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}</div>
  </div>
}

function formatApplicationDate(value, options = { dateStyle: 'medium' }) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value))
}

function StudentInterviewsView({ userId }) {
  const [interviews, setInterviews] = useState([])
  const [reports, setReports] = useState([])
  const [reportLoadError, setReportLoadError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState({ key: '', error: '', loadedAt: 0 })
  const requestKey = `${userId}:${retryCount}`
  const loading = loadState.key !== requestKey
  const error = loading ? '' : loadState.error
  const now = loadState.loadedAt

  useEffect(() => {
    let active = true
    Promise.allSettled([
      interviewService.listForStudent(userId),
      interviewService.listPolicyReportsForStudent(userId),
    ]).then(([interviewResult, reportResult]) => {
      if (!active) return
      if (interviewResult.status === 'fulfilled') {
        setInterviews(interviewResult.value)
        setLoadState({ key: requestKey, error: '', loadedAt: Date.now() })
      } else {
        setLoadState({ key: requestKey, error: interviewResult.reason, loadedAt: Date.now() })
      }
      if (reportResult.status === 'fulfilled') {
        setReports(reportResult.value.map(normalizeInterviewReport).filter(Boolean))
        setReportLoadError(null)
      } else {
        setReportLoadError(reportResult.reason)
      }
    })
    return () => { active = false }
  }, [userId, requestKey])

  const upcoming = interviews
    .filter((item) => new Date(item.scheduled_at).getTime() >= now && !['cancelled', 'completed'].includes(item.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const past = interviews
    .filter((item) => new Date(item.scheduled_at).getTime() < now || ['cancelled', 'completed'].includes(item.status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

  const renderInterview = (item) => {
    const meetingUrl = getSafeMeetingUrl(item.meeting_url)
    const report = reports.find((entry) => entry.interview_id === item.id)
    const statusTone = item.status === 'completed' ? 'green' : item.status === 'cancelled' ? 'slate' : 'blue'
    return <Card key={item.id} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{item.applications?.jobs?.title || 'Interview'}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.applications?.jobs?.employer_profiles?.company_name || 'Employer'}</p>
        </div>
        <Badge tone={statusTone}>{item.status || 'scheduled'}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" />{formatInterviewDateTime(item.scheduled_at)}</span>
        {item.duration_minutes ? <span className="inline-flex items-center gap-2"><Clock3 size={16} aria-hidden="true" />{item.duration_minutes} minutes</span> : null}
        {item.interview_type ? <span className="capitalize">{item.interview_type.replaceAll('_', ' ')}</span> : null}
      </div>
      {item.location ? <p className="mt-3 text-sm text-slate-600">Location: {item.location}</p> : null}
      {meetingUrl ? <a className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 underline" href={meetingUrl} target="_blank" rel="noopener noreferrer">Join interview <ExternalLink size={14} aria-hidden="true" /></a> : item.meeting_url ? <p className="mt-3 text-sm text-amber-800">This meeting link was hidden because it is not a valid secure HTTPS link. Contact the employer through your application.</p> : null}
      {item.notes ? <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Employer-provided interview notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p><p className="mt-2 text-xs text-slate-500">These instructions are provided by the employer and are not SkillBridge policy.</p></div> : null}
      {item.feedback ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><span className="font-semibold">Feedback:</span> {item.feedback}</p> : null}
      {!item.location && !meetingUrl ? <p className="mt-3 text-sm text-slate-500">Contact the employer through your application if you need the interview location or meeting details.</p> : null}
      {reportLoadError ? <div className="mt-3"><RequestError error={reportLoadError} fallback="Interview reporting is temporarily unavailable." /></div> : <InterviewPolicyReport interviewId={item.id} existingReport={report} onReportSaved={(saved) => setReports((current) => [...current.filter((entry) => entry.interview_id !== item.id), normalizeInterviewReport(saved)].filter(Boolean))} />}
    </Card>
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <ModuleHeader title="Interviews" description="Review interview dates, meeting details and feedback for your applications." />
      <Button variant="outline" onClick={() => setRetryCount((count) => count + 1)} disabled={loading} aria-label="Refresh interviews">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <InterviewConductNotice />
    {loading ? <div role="status" aria-label="Loading interviews" className="space-y-3"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /></div> : error ? <RequestError error={error} fallback="Your interviews could not be loaded." onRetry={() => setRetryCount((count) => count + 1)} /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Upcoming', upcoming.length],
          ['Completed', interviews.filter((item) => item.status === 'completed').length],
          ['Total interviews', interviews.length],
        ].map(([label, value]) => <Card key={label} className="p-4"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></Card>)}
      </div>
      {upcoming.length || past.length ? <div className="space-y-6">
        <SectionCard title="Upcoming interviews" icon={CalendarDays}>
          {upcoming.length ? <div className="space-y-3">{upcoming.map(renderInterview)}</div> : <EmptyState>No upcoming interviews.</EmptyState>}
        </SectionCard>
        {past.length ? <SectionCard title="Past and cancelled interviews" icon={Clock3}><div className="space-y-3">{past.map(renderInterview)}</div></SectionCard> : null}
      </div> : <SectionCard title="Your interview schedule" icon={CalendarDays}><EmptyState to="/student/applications" action="View applications">No interviews have been scheduled for your applications yet. When an employer schedules one, its date and details will appear here.</EmptyState></SectionCard>}
    </>}
  </div>
}

function ApplicationsView({ userId }) {
  const [applications, setApplications] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState({ key: '', error: '' })
  const requestKey = `${userId}:${retryCount}`
  const loading = loadState.key !== requestKey
  const error = loading ? '' : loadState.error

  useEffect(() => {
    let active = true
    applicationService.getApplications(userId)
      .then((result) => {
        if (active) {
          setApplications(result)
          setLoadState({ key: requestKey, error: '' })
        }
      })
      .catch((loadError) => {
        if (active) setLoadState({ key: requestKey, error: loadError.message || 'Unable to load your applications.' })
      })
    return () => { active = false }
  }, [userId, requestKey])

  const counts = useMemo(() => summarizeApplications(applications), [applications])

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase()
    return applications.filter((application) => {
      const status = normalizeApplicationStatus(application.status)
      const decided = isApplicationTerminal(status)
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && isApplicationInProgress(status))
        || (statusFilter === 'interview' && status === 'interview')
        || (statusFilter === 'offer' && status === 'offer')
        || (statusFilter === 'accepted' && status === 'accepted')
        || (statusFilter === 'closed' && decided)
      const searchable = [
        application.jobs?.title,
        application.jobs?.employer_profiles?.company_name,
        application.jobs?.location,
        formatApplicationStatus(status),
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    })
  }, [applications, search, statusFilter])

  return <div className="space-y-6">
    <ModuleHeader title="Applications" description="Follow your applications and see the latest recorded status for each opportunity." />
    {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading applications">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div> : error ? <RequestError error={error} fallback="Your applications could not be loaded." onRetry={() => setRetryCount((count) => count + 1)} /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total applications', applications.length, 'All opportunities you have applied to'],
          ['In progress', counts.inProgress, 'Applications in active review stages'],
          ['Upcoming interviews', counts.upcomingInterviews, 'Scheduled or rescheduled interviews'],
          ['Outstanding offers', counts.outstandingOffers, 'Offers awaiting your response'],
        ].map(([label, value, hint]) => <Card key={label} className="p-4"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></Card>)}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search applications</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" />
          <input className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm" placeholder="Search role, employer or status" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="sr-only" htmlFor="application-status-filter">Filter applications by status</label>
        <select id="application-status-filter" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">In progress</option>
          <option value="interview">Interviews</option>
          <option value="offer">Offers</option>
          <option value="accepted">Accepted</option>
          <option value="closed">Decisions and closed</option>
        </select>
      </div>
      {visibleApplications.length ? <div className="space-y-3">
        {visibleApplications.map((application) => {
          const status = normalizeApplicationStatus(application.status || 'applied')
          const job = application.jobs || {}
          const employer = job.employer_profiles?.company_name || 'Employer'
          const appliedDate = application.applied_at || application.created_at
          const updatedDate = application.updated_at || appliedDate
          return <Card key={application.id} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{job.title || 'Opportunity'}</h3>
                  <Badge tone={applicationStatusTone(status)}>{formatApplicationStatus(status)}</Badge>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-600">{employer}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {job.location ? <span>{job.location}</span> : null}
                  {job.employment_type ? <span className="capitalize">{job.employment_type.replace(/_/g, ' ')}</span> : null}
                  <span>Applied {formatApplicationDate(appliedDate)}</span>
                  <span>Updated {formatApplicationDate(updatedDate)}</span>
                </div>
              </div>
              <Link to={`/student/applications/${application.id}`} className="shrink-0">
                <Button size="sm" variant="outline">Track application <ArrowRight size={15} className="ml-2" /></Button>
              </Link>
            </div>
          </Card>
        })}
      </div> : applications.length ? <EmptyState>No applications match your search and status filters.</EmptyState> : <EmptyState to="/student/jobs" action="Explore opportunities">You have not submitted any applications yet. When you apply, you can track each update here.</EmptyState>}
    </>}
  </div>
}

function ApplicationDetailView({ applicationId, userId }) {
  const [retryCount, setRetryCount] = useState(0)
  const [loadState, setLoadState] = useState({ key: '', application: null, error: '' })
  const [actionState, setActionState] = useState({ busy: false, error: '' })
  const requestKey = `${userId}:${applicationId}:${retryCount}`
  const loading = loadState.key !== requestKey
  const application = loading ? null : loadState.application
  const error = loading ? '' : loadState.error

  useEffect(() => {
    let active = true
    applicationService.getApplication(applicationId, userId)
      .then((result) => {
        if (active) setLoadState({ key: requestKey, application: result, error: '' })
      })
      .catch((loadError) => {
        if (active) setLoadState({ key: requestKey, application: null, error: loadError.message || 'Unable to load this application.' })
      })
    return () => { active = false }
  }, [applicationId, userId, requestKey])

  if (loading) return <div className="space-y-5" aria-label="Loading application"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (error || !application) return <div className="space-y-3"><EmptyState>{error || 'This application is unavailable.'}</EmptyState><div className="flex gap-2"><Button variant="outline" onClick={() => setRetryCount((count) => count + 1)}>Try again</Button><Link to="/student/applications"><Button variant="outline">Back to applications</Button></Link></div></div>

  const events = [...(application.application_events || [])].sort((a, b) => new Date(a.event_date || a.created_at) - new Date(b.event_date || b.created_at))
  const normalizedStatus = normalizeApplicationStatus(application.status || 'applied')
  const lastUpdated = application.updated_at || events[events.length - 1]?.event_date || application.applied_at
  const currentTime = new Date()
  const appliedTime = new Date(application.applied_at || application.created_at || currentTime.toISOString()).getTime()
  const applicationAge = Number.isNaN(appliedTime) ? null : Math.max(1, Math.ceil((currentTime.getTime() - appliedTime) / (1000 * 60 * 60 * 24)))
  const nextAction = events.length ? events[events.length - 1]?.next_action || 'Waiting for employer update.' : 'Waiting for employer update.'
  const submitApplicationAction = async (action) => {
    setActionState({ busy: true, error: '' })
    try {
      await action()
      setActionState({ busy: false, error: '' })
      setRetryCount((count) => count + 1)
    } catch (actionError) {
      setActionState({ busy: false, error: actionError.message || 'Unable to update this application.' })
    }
  }

  return <div className="space-y-6"><ModuleHeader title={application.jobs?.title || 'Application'} description={`${application.jobs?.employer_profiles?.company_name || 'Employer'} · ${formatApplicationStatus(normalizedStatus)}`} back="/student/applications" /><SectionCard title="Application overview" icon={Target}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current status</p><div className="mt-2"><Badge tone={applicationStatusTone(normalizedStatus)}>{formatApplicationStatus(normalizedStatus)}</Badge></div></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Applied</p><p className="mt-2 font-semibold text-slate-900">{formatApplicationDate(application.applied_at || application.created_at)}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Application age</p><p className="mt-2 font-semibold text-slate-900">{applicationAge === null ? 'Unavailable' : `${applicationAge} ${applicationAge === 1 ? 'day' : 'days'}`}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Last updated</p><p className="mt-2 font-semibold text-slate-900">{formatApplicationDate(lastUpdated, { dateStyle: 'medium', timeStyle: 'short' })}</p></div></div><div className="mt-4 rounded-xl bg-sky-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-800">Next expected action</p><p className="mt-1 text-sm text-sky-950">{nextAction || 'Waiting for employer update.'}</p></div></SectionCard>{normalizedStatus === 'offer' || isApplicationOpen(normalizedStatus) ? <SectionCard title={normalizedStatus === 'offer' ? 'Respond to offer' : 'Application options'} icon={CheckCircle2}><div className="flex flex-wrap gap-2">{normalizedStatus === 'offer' ? <><Button disabled={actionState.busy} onClick={() => void submitApplicationAction(() => offerService.respond(application.id, 'accepted'))}>Accept offer</Button><Button variant="outline" disabled={actionState.busy} onClick={() => void submitApplicationAction(() => offerService.respond(application.id, 'declined'))}>Decline offer</Button></> : null}{isApplicationOpen(normalizedStatus) ? <Button variant="secondary" disabled={actionState.busy} onClick={() => { if (window.confirm('Withdraw this application? This cannot be undone.')) void submitApplicationAction(() => applicationService.withdraw(application.id)) }}>Withdraw application</Button> : null}</div>{actionState.error ? <p className="mt-3 text-sm text-rose-700" role="alert">{actionState.error}</p> : null}</SectionCard> : null}<SectionCard title="Application journey" icon={Target}><div className="space-y-4">{events.length ? events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-sky-600 ring-4 ring-sky-100" /><div className="w-full rounded-xl border border-slate-200 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-slate-800">{event.title || event.stage || 'Application event'}</p><Badge tone={event.status === 'completed' ? 'green' : event.status === 'pending' ? 'amber' : 'blue'}>{event.status || 'Recorded'}</Badge></div><p className="mt-2 text-sm text-slate-500">{formatApplicationDate(event.event_date || event.created_at, { dateStyle: 'medium', timeStyle: 'short' })}{event.event_time ? ` · ${event.event_time}` : ''}</p>{event.description ? <p className="mt-2 text-sm text-slate-600">{event.description}</p> : null}{event.actor ? <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">Actor: {event.actor}</p> : null}</div></div>) : <EmptyState>Updates will appear here as the employer records progress on your application.</EmptyState>}</div></SectionCard><SectionCard title="Recruitment status" icon={CheckCircle2}><div className="flex flex-wrap items-center gap-3"><Badge tone={applicationStatusTone(normalizedStatus)}>{formatApplicationStatus(normalizedStatus)}</Badge><span className="text-sm text-slate-600">{application.recruitment_status || 'No additional recruitment note has been shared.'}</span></div><p className="mt-4 text-sm text-slate-600">This page shows recorded application updates. Future stages are not assumed until the employer updates the process.</p></SectionCard></div>
}

function PortfolioView({ userId }) {
  const [data, setData] = useState({ projects: [], certificates: [] })
  const [availableSkills, setAvailableSkills] = useState([])
  const [project, setProject] = useState({ title: '', description: '', project_type: '', repository_url: '', live_url: '', skill_ids: [] })
  const [projectImage, setProjectImage] = useState(null)
  const [certificate, setCertificate] = useState({ title: '', issuer: '', credential_id: '', credential_url: '', issue_date: '', expiry_date: '', skill_ids: [] })
  const [certificateFile, setCertificateFile] = useState(null)
  const [editingCertificateId, setEditingCertificateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [skillCatalogError, setSkillCatalogError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const projectImageInput = useRef(null)
  const projectCameraInput = useRef(null)
  const certificateInput = useRef(null)
  const certificateForm = useRef(null)
  const cameraInput = useRef(null)
  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'
  const projectImagePreview = useMemo(
    () => projectImage ? URL.createObjectURL(projectImage) : '',
    [projectImage],
  )

  useEffect(() => () => {
    if (projectImagePreview) URL.revokeObjectURL(projectImagePreview)
  }, [projectImagePreview])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setSkillCatalogError('')
    try {
      const [overviewResult, skillsResult] = await Promise.allSettled([
        portfolioService.getOverview(userId),
        skillService.listSkills(),
      ])
      if (overviewResult.status === 'rejected') throw overviewResult.reason
      setData({
        ...overviewResult.value,
        projects: overviewResult.value.projects || [],
        certificates: overviewResult.value.certificates || [],
      })
      if (skillsResult.status === 'fulfilled') {
        setAvailableSkills(skillsResult.value || [])
      } else {
        setAvailableSkills([])
        setSkillCatalogError(skillsResult.reason)
      }
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      if (!active) return
      await load()
    }

    void fetchData()
    return () => { active = false }
  }, [load])

  const saveProject = async (event) => {
    event.preventDefault()
    setSaving('project')
    setActionError('')
    setNotice('')
    const payload = {
      ...project,
      student_id: userId,
      status: 'completed',
      description: project.description || 'Project evidence',
      project_type: project.project_type || 'Other',
      image_url: null,
      repository_url: project.repository_url || null,
      live_url: project.live_url || null,
    }
    try {
      await portfolioService.saveProject(payload, projectImage)
      setProject({ title: '', description: '', project_type: '', repository_url: '', live_url: '', skill_ids: [] })
      setProjectImage(null)
      if (projectImageInput.current) projectImageInput.current.value = ''
      if (projectCameraInput.current) projectCameraInput.current.value = ''
      await load()
      setNotice('Project added to your portfolio.')
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to save your project.')
    } finally {
      setSaving('')
    }
  }

  const saveCertificate = async (event) => {
    event.preventDefault()
    setSaving('certificate')
    setActionError('')
    setNotice('')
    try {
      const payload = {
        ...certificate,
        student_id: userId,
        issue_date: certificate.issue_date || null,
        expiry_date: certificate.expiry_date || null,
        credential_id: certificate.credential_id || null,
        credential_url: certificate.credential_url || null,
      }
      let successMessage = 'Certificate and document uploaded. It will remain unverified until reviewed.'
      if (editingCertificateId) {
        const result = await portfolioService.resubmitCertificate(editingCertificateId, payload, certificateFile)
        successMessage = result.warnings.length
          ? `Corrected certificate submitted for review. ${result.warnings.join(' ')}`
          : 'Corrected certificate submitted for review.'
      } else {
        await portfolioService.saveCertificate(payload, certificateFile)
      }
      setCertificate({ title: '', issuer: '', credential_id: '', credential_url: '', issue_date: '', expiry_date: '', skill_ids: [] })
      setCertificateFile(null)
      setEditingCertificateId('')
      if (certificateInput.current) certificateInput.current.value = ''
      if (cameraInput.current) cameraInput.current.value = ''
      await load()
      setNotice(successMessage)
    } catch (saveError) {
      setActionError(saveError.message || 'Unable to save your certificate.')
    } finally {
      setSaving('')
    }
  }

  const deleteProject = async (id) => {
    setSaving(`delete-project:${id}`)
    setActionError('')
    setNotice('')
    try {
      await portfolioService.deleteProject(id, userId)
      await load()
      setNotice('Project removed from your portfolio.')
    } catch (deleteError) {
      setActionError(deleteError.message || 'Unable to delete this project.')
    } finally {
      setSaving('')
    }
  }

  const deleteCertificate = async (id) => {
    setSaving(`delete-certificate:${id}`)
    setActionError('')
    setNotice('')
    try {
      await portfolioService.deleteCertificate(id, userId)
      await load()
      setNotice('Certificate removed from your portfolio.')
    } catch (deleteError) {
      setActionError(deleteError.message || 'Unable to delete this certificate.')
      await load()
    } finally {
      setSaving('')
    }
  }

  const editCertificateForCorrection = (item) => {
    setEditingCertificateId(item.id)
    setCertificate({
      title: item.title || '',
      issuer: item.issuer || '',
      credential_id: item.credential_id || '',
      credential_url: item.credential_url || '',
      issue_date: item.issue_date || '',
      expiry_date: item.expiry_date || '',
      skill_ids: (item.certificate_skills || []).map((entry) => entry.skill_id).filter(Boolean),
    })
    setCertificateFile(null)
    setActionError('')
    setNotice('')
    if (certificateInput.current) certificateInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
    requestAnimationFrame(() => certificateForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const cancelCertificateCorrection = () => {
    setEditingCertificateId('')
    setCertificate({ title: '', issuer: '', credential_id: '', credential_url: '', issue_date: '', expiry_date: '', skill_ids: [] })
    setCertificateFile(null)
    if (certificateInput.current) certificateInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
  }

  return <div className="space-y-6">
    <ModuleHeader title="Portfolio" description="Present practical work and supporting evidence. Uploaded certificates are not independently verified until reviewed." />
    {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
    {actionError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p> : null}
    {loading ? <div className="grid gap-4 xl:grid-cols-2" aria-label="Loading portfolio"><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /></div> : error ? <RequestError error={error} fallback="We could not load your portfolio." onRetry={load} /> : <div className="grid items-start gap-6 xl:grid-cols-2">
      <SectionCard title={`Projects (${data.projects.length})`} icon={GraduationCap}>
        {data.assetWarnings?.length ? <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.assetWarnings.join(' ')}</p> : null}
        <div className="space-y-3">
          {data.projects.length ? data.projects.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h4 className="font-semibold text-slate-900">{item.title}</h4><p className="mt-1 text-sm text-slate-500">{item.project_type || 'Project'} · {item.status || 'Completed'}</p></div>
              <Button type="button" variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" disabled={saving === `delete-project:${item.id}`} onClick={() => deleteProject(item.id)}>{saving === `delete-project:${item.id}` ? 'Deleting…' : 'Delete'}</Button>
            </div>
            {(item.image_display_url || item.image_url) ? <a href={item.image_display_url || item.image_url} target="_blank" rel="noreferrer" className="mt-3 block"><img src={item.image_display_url || item.image_url} alt={`${item.title} screenshot`} className="max-h-56 w-full rounded-lg border border-slate-200 object-cover" /></a> : null}
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{item.description}</p>
            {item.project_skills?.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Skills demonstrated by this project">{item.project_skills.map((entry) => <Badge key={entry.id} tone="blue">{entry.skills?.name || 'Skill'}</Badge>)}</div> : <p className="mt-3 text-xs text-slate-500">No skills are linked to this project yet.</p>}
            <div className="mt-3 flex flex-wrap gap-3 text-sm">{item.live_url ? <a href={item.live_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline">Live demo <ExternalLink size={14} /></a> : null}{item.repository_url ? <a href={item.repository_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline">Repository <ExternalLink size={14} /></a> : null}</div>
          </article>) : <EmptyState>Your portfolio has no projects yet. Add a project to show employers how you apply your skills.</EmptyState>}
        </div>
        <form onSubmit={saveProject} className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          <h4 className="font-semibold text-slate-900">Add a project</h4>
          <label className="block text-sm font-medium text-slate-700">Project title<input required className={`${inputClass} mt-1`} placeholder="e.g. Community health dashboard" value={project.title} onChange={(event) => setProject({ ...project, title: event.target.value })} /></label>
          <label className="block text-sm font-medium text-slate-700">Description<textarea required className={`${inputClass} mt-1 min-h-24`} placeholder="What did you build and what was your contribution?" value={project.description} onChange={(event) => setProject({ ...project, description: event.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Project type<input className={`${inputClass} mt-1`} placeholder="e.g. Research, software" value={project.project_type} onChange={(event) => setProject({ ...project, project_type: event.target.value })} /></label>
          </div>
          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Skills demonstrated</legend>
            {skillCatalogError ? <div className="mb-2"><RequestError error={skillCatalogError} fallback="Skills could not be loaded for new portfolio entries. Existing projects and certificates are still available." onRetry={load} /></div> : null}
            <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
              {availableSkills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={project.skill_ids.includes(skill.id)} onChange={(event) => setProject((current) => ({ ...current, skill_ids: event.target.checked ? [...current.skill_ids, skill.id] : current.skill_ids.filter((id) => id !== skill.id) }))} />
                {skill.name}
              </label>)}
            </div>
            {!availableSkills.length ? <p className="text-xs text-slate-500">No skills are available to link.</p> : null}
          </fieldset>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Project screenshot or image <span className="text-xs font-normal text-slate-500">(optional)</span></p>
            <p className="mt-1 text-xs leading-5 text-slate-500">JPEG, PNG, WebP, AVIF, GIF, HEIC or HEIF · 10 MB maximum</p>
            <input ref={projectImageInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif" onChange={(event) => setProjectImage(event.target.files?.[0] || null)} aria-label="Choose a project screenshot or image" />
            <input ref={projectCameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => setProjectImage(event.target.files?.[0] || null)} aria-label="Capture project image with camera" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => projectImageInput.current?.click()}><Upload size={15} /> Choose image</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => projectCameraInput.current?.click()}><Camera size={15} /> Take photo</Button>
            </div>
            {projectImage ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm"><span className="break-all text-slate-700">{projectImage.name} · {(projectImage.size / (1024 * 1024)).toFixed(1)} MB</span><Button type="button" variant="ghost" size="sm" onClick={() => { setProjectImage(null); if (projectImageInput.current) projectImageInput.current.value = ''; if (projectCameraInput.current) projectCameraInput.current.value = '' }}>Remove image</Button></div> : null}
            {projectImagePreview && !/\.(heic|heif)$/i.test(projectImage.name) ? <img src={projectImagePreview} alt="Selected project image preview" className="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain" /> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Repository URL<input type="url" className={`${inputClass} mt-1`} placeholder="https://" value={project.repository_url} onChange={(event) => setProject({ ...project, repository_url: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Live project URL<input type="url" className={`${inputClass} mt-1`} placeholder="https://" value={project.live_url} onChange={(event) => setProject({ ...project, live_url: event.target.value })} /></label>
          </div>
          <Button type="submit" disabled={saving === 'project'}><Plus size={15} />{saving === 'project' ? 'Saving project…' : 'Add project'}</Button>
        </form>
      </SectionCard>
      <SectionCard title={`Certificates (${data.certificates.length})`} icon={CheckCircle2}>
        <p className="mb-4 text-sm leading-6 text-slate-600">Upload a PDF or image of each certificate. On a phone or tablet, you can capture the certificate with your camera. Files are private and only you can access them here.</p>
        <div className="space-y-3">
          {data.certificates.length ? data.certificates.map((item) => {
            const isImage = /\.(jpe?g|png|webp)$/i.test(item.file_path || '')
            const independentlyVerified = isCertificateIndependentlyVerified(item)
            return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h4 className="font-semibold text-slate-900">{item.title}</h4><p className="mt-1 text-sm text-slate-500">{item.issuer}{item.issue_date ? ` · Issued ${item.issue_date}` : ''}</p>{item.credential_id ? <p className="mt-1 text-xs text-slate-500">Credential ID: {item.credential_id}</p> : null}{item.expiry_date ? <p className="mt-1 text-xs text-slate-500">Expires {item.expiry_date}</p> : null}</div>
                <Button type="button" variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" disabled={saving === `delete-certificate:${item.id}`} onClick={() => deleteCertificate(item.id)}>{saving === `delete-certificate:${item.id}` ? 'Deleting…' : 'Delete'}</Button>
              </div>
              {item.file_url ? <div className="mt-3 flex flex-wrap items-center gap-3">{isImage ? <a href={item.file_url} target="_blank" rel="noreferrer" aria-label={`Open certificate image: ${item.title}`}><img src={item.file_url} alt={`${item.title} certificate`} className="max-h-32 max-w-full rounded-lg border border-slate-200 object-contain" /></a> : null}<a href={item.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:underline"><FileText size={16} /> View uploaded certificate <ExternalLink size={14} /></a></div> : <p className="mt-3 text-xs text-amber-700">No certificate file is attached to this record.</p>}
              <div className="mt-3"><Badge tone={independentlyVerified ? 'green' : item.verification_status === 'rejected' ? 'rose' : item.verification_status === 'requires_correction' ? 'amber' : 'slate'}>{independentlyVerified ? 'Approved · independently verified' : item.verification_status === 'verified' ? 'Recorded · verification evidence incomplete' : getCertificateStatusLabel(item.verification_status)}</Badge></div>
              {item.verification_notes ? <p className={`mt-2 rounded-lg p-3 text-sm ${item.verification_status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-950'}`}><span className="font-semibold">Reviewer feedback:</span> {item.verification_notes}</p> : null}
              {canResubmitCertificate(item) ? <Button type="button" className="mt-3" variant="outline" onClick={() => editCertificateForCorrection(item)}>Edit and resubmit</Button> : null}
              {item.certificate_review_history?.length ? <div className="mt-3 border-t border-slate-100 pt-3">
                <h5 className="text-sm font-semibold text-slate-800">Review history</h5>
                <ol className="mt-2 space-y-2">
                  {[...item.certificate_review_history].sort((first, second) => new Date(second.created_at) - new Date(first.created_at)).map((entry) => <li key={entry.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-800">{entry.event_type === 'resubmitted' ? 'You resubmitted this certificate' : `Status changed to ${getCertificateStatusLabel(entry.new_status)}`}</p>
                    {entry.reason ? <p className="mt-1 text-slate-600">{entry.reason}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</p>
                  </li>)}
                </ol>
              </div> : null}
              {item.credential_url ? <a href={item.credential_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline">Online verification link <ExternalLink size={14} /></a> : null}
              {item.certificate_skills?.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Skills linked to this certificate">{item.certificate_skills.map((entry) => <Badge key={entry.id} tone="blue">{entry.skills?.name || 'Skill'}</Badge>)}</div> : <p className="mt-3 text-xs text-slate-500">No skills are linked to this certificate.</p>}
            </article>
          }) : <EmptyState>Add a certificate to document your qualifications, training and achievements.</EmptyState>}
        </div>
        <form ref={certificateForm} onSubmit={saveCertificate} className="mt-5 space-y-3 border-t border-slate-200 pt-5">
          <h4 className="font-semibold text-slate-900">{editingCertificateId ? 'Correct and resubmit certificate' : 'Add a certificate'}</h4>
          {editingCertificateId ? <p className="text-sm text-amber-800">Upload a corrected document. Your submission will return to Pending review and the previous review history will be kept.</p> : null}
          <label className="block text-sm font-medium text-slate-700">Certificate title<input required className={`${inputClass} mt-1`} placeholder="e.g. Data Analytics Certificate" value={certificate.title} onChange={(event) => setCertificate({ ...certificate, title: event.target.value })} /></label>
          <label className="block text-sm font-medium text-slate-700">Issuer<input required className={`${inputClass} mt-1`} placeholder="Organization or institution" value={certificate.issuer} onChange={(event) => setCertificate({ ...certificate, issuer: event.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Issue date<input type="date" className={`${inputClass} mt-1`} value={certificate.issue_date} onChange={(event) => setCertificate({ ...certificate, issue_date: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Expiry date<input type="date" min={certificate.issue_date || undefined} className={`${inputClass} mt-1`} value={certificate.expiry_date} onChange={(event) => setCertificate({ ...certificate, expiry_date: event.target.value })} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Credential ID<input className={`${inputClass} mt-1`} placeholder="Optional" value={certificate.credential_id} onChange={(event) => setCertificate({ ...certificate, credential_id: event.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Verification URL<input type="url" className={`${inputClass} mt-1`} placeholder="https:// (optional)" value={certificate.credential_url} onChange={(event) => setCertificate({ ...certificate, credential_url: event.target.value })} /></label>
          </div>
          <fieldset className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Skills related to this certificate</legend>
            <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
              {availableSkills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={certificate.skill_ids.includes(skill.id)} onChange={(event) => setCertificate((current) => ({ ...current, skill_ids: event.target.checked ? [...current.skill_ids, skill.id] : current.skill_ids.filter((id) => id !== skill.id) }))} />
                {skill.name}
              </label>)}
            </div>
          </fieldset>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Certificate file <span className="text-rose-700">*</span></p>
            <p className="mt-1 text-xs leading-5 text-slate-500">PDF or JPEG, PNG, WebP, HEIC or HEIF image · 10 MB maximum</p>
            <input ref={certificateInput} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setCertificateFile(event.target.files?.[0] || null)} aria-label="Choose a certificate PDF or image" />
            <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => setCertificateFile(event.target.files?.[0] || null)} aria-label="Capture certificate with camera" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => certificateInput.current?.click()}><Upload size={15} /> Choose file</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => cameraInput.current?.click()}><Camera size={15} /> Take photo</Button>
            </div>
            {certificateFile ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm"><span className="break-all text-slate-700">{certificateFile.name} · {(certificateFile.size / (1024 * 1024)).toFixed(1)} MB</span><Button type="button" variant="ghost" size="sm" onClick={() => { setCertificateFile(null); if (certificateInput.current) certificateInput.current.value = ''; if (cameraInput.current) cameraInput.current.value = '' }}>Remove file</Button></div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving === 'certificate'}><Plus size={15} />{saving === 'certificate' ? 'Uploading certificate…' : editingCertificateId ? 'Resubmit for review' : 'Upload and add certificate'}</Button>
            {editingCertificateId ? <Button type="button" variant="outline" disabled={saving === 'certificate'} onClick={cancelCertificateCorrection}>Cancel correction</Button> : null}
          </div>
        </form>
      </SectionCard>
    </div>}
  </div>
}

export default function StudentModulePage({ mode = 'profile' }) {
  const { user, profile, refreshProfile } = useAuth()
  const { id } = useParams()
  const location = useLocation()
  const [candidateType, setCandidateType] = useState('student')
  const [candidateTypeLoading, setCandidateTypeLoading] = useState(true)
  const [candidateTypeError, setCandidateTypeError] = useState('')
  const [candidateTypeSaving, setCandidateTypeSaving] = useState(false)
  const [candidateTypeSaveError, setCandidateTypeSaveError] = useState('')
  const title = CONFIG[mode]?.[0] || 'Student workspace'
  const description = CONFIG[mode]?.[1] || ''
  const isCareerRoadmap = location.pathname === '/student/career/roadmap'
  const careerId = isCareerRoadmap ? new URLSearchParams(location.search).get('career') : null
  const detailId = id || (!isCareerRoadmap ? new URLSearchParams(location.search).get('career') : null)

  useEffect(() => {
    if (mode !== 'jobs') return undefined
    let active = true
    studentService.getProfile(user.id)
      .then((profileData) => {
        if (!active) return
        const studentProfile = Array.isArray(profileData.student_profiles)
          ? profileData.student_profiles[0]
          : profileData.student_profiles
        setCandidateType(
          studentProfile?.candidate_type === 'graduate' || profile?.role === 'graduate'
            ? 'graduate'
            : 'student',
        )
      })
      .catch((loadError) => {
        if (active) setCandidateTypeError(loadError.message || 'Unable to load your student or graduate status.')
      })
      .finally(() => { if (active) setCandidateTypeLoading(false) })
    return () => { active = false }
  }, [mode, profile?.role, user.id])

  const handleCandidateTypeChange = async (nextType) => {
    const previousType = candidateType
    setCandidateType(nextType)
    setCandidateTypeSaveError('')
    setCandidateTypeSaving(true)
    try {
      const savedProfile = await studentService.saveStudentProfile(user.id, { candidate_type: nextType })
      setCandidateType(savedProfile.candidate_type)
    } catch (saveError) {
      setCandidateType(previousType)
      setCandidateTypeSaveError(saveError.message || 'Unable to update your student or graduate status.')
    } finally {
      setCandidateTypeSaving(false)
    }
  }

  let content
  if (mode === 'profile' || mode === 'settings') content = <ProfileEditor userId={user.id} onSaved={() => refreshProfile(user)} />
  else if (mode === 'career' && isCareerRoadmap) content = <CareerRoadmapView userId={user.id} careerId={careerId} />
  else if (mode === 'career') content = <CareerView userId={user.id} detailId={detailId} />
  else if (mode === 'skills') content = <SkillsView userId={user.id} />
  else if (mode === 'assessments') content = <AssessmentsView userId={user.id} detailId={id} />
  else if (mode === 'learning') content = <LearningView userId={user.id} />
  else if (mode === 'jobs' && candidateTypeLoading) content = <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
  else if (mode === 'jobs' && candidateTypeError) content = <EmptyState>{candidateTypeError}</EmptyState>
  else if (mode === 'jobs' && id) content = <JobDetailView key={`${id}:${candidateType}`} userId={user.id} jobId={id} candidateType={candidateType} />
  else if (mode === 'interviews') content = <StudentInterviewsView userId={user.id} />
  else if (mode === 'applications' && id) content = <ApplicationDetailView applicationId={id} userId={user.id} />
  else if (mode === 'applications') content = <ApplicationsView userId={user.id} />
  else if (mode === 'portfolio') content = <PortfolioView userId={user.id} />
  else if (mode === 'progress') content = <CareerProgressDashboard userId={user.id} />
  else if (mode === 'market' || mode === 'demand') content = <StudentMarketPage userId={user.id} mode={mode} />
  else if (mode === 'readiness' && id) content = <AdvancedCareerIntelligence mode="readiness" userId={user.id} />
  else if (mode === 'readiness') content = <ReadinessView userId={user.id} />
  else if (mode === 'feedback') content = <StudentFeedbackView userId={user.id} />
  else if (mode === 'interview-prep') content = <AdvancedCareerIntelligence mode="interview-prep" userId={user.id} />
  else if (mode === 'evidence') content = <AdvancedCareerIntelligence mode="evidence" userId={user.id} />
  else if (mode === 'simulator') content = <AdvancedCareerIntelligence mode="simulator" userId={user.id} />
  else content = <GenericListView
    mode={mode}
    userId={user.id}
    candidateType={candidateType}
    onCandidateTypeChange={handleCandidateTypeChange}
    candidateTypeSaving={candidateTypeSaving}
    candidateTypeSaveError={candidateTypeSaveError}
  />

  return <AppShell title={title} subtitle={description}>{content}</AppShell>
}
