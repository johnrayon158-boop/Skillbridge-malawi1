import { Activity, AlertTriangle, Archive, ArrowLeft, ArrowRight, BarChart3, BookOpen, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, Download, ExternalLink, FileText, Gauge, GraduationCap, Layers3, ListChecks, Mail, MapPin, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Target, Upload, UserRound, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from '../../constants/database'
import { useAuth } from '../../contexts/AuthContext'
import { adminService } from '../../services/adminService'
import { skillService } from '../../services/skillService'
import { groupJobSkills } from '../../utils/adminJobDetails.js'
import {
  findPotentialAssessmentDuplicates,
  findPotentialJobDuplicatePairs,
} from '../../utils/duplicateDetection.js'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { LastUpdated, RequestError } from '../../components/ui/RequestState'
import { Avatar } from '../../components/ui/Avatar'
import { ProfilePictureUploader } from '../../components/ui/ProfilePictureUploader'
import LabourMarketModulePage from './LabourMarketModulePage'
import { extractSkillCandidates } from '../../utils/skillDetection'
import {
  normalizeSkillCatalogName,
  SKILL_CATEGORIES,
  validateSkillCandidate,
} from '../../utils/skillCatalog'
import { formatInterviewDateTime, INTERVIEW_REPORT_CATEGORIES } from '../../utils/interviewPolicy'
import { parseCareerList, validateCareerDefinition } from '../../utils/careerDefinitionValidation'
import { getCertificateStatusLabel } from '../../utils/certificateWorkflow.js'
import { isCertificateIndependentlyVerified } from '../../utils/certificateVerification.js'
import { ADMIN_DASHBOARD_DATE_RANGES } from '../../utils/adminDashboardMetrics.js'
import {
  LEARNING_RESOURCE_DIFFICULTIES,
  LEARNING_RESOURCE_STATUSES,
  LEARNING_RESOURCE_TYPES,
  validateLearningResource,
} from '../../utils/learningResourceValidation'

const CONFIG = {
  users: ['Users', 'Manage platform identities and role-aware records.'],
  employers: ['Employers', 'Review company profiles and employer activity.'],
  jobs: ['Jobs', 'Monitor job quality, status and application activity.'],
  skills: ['Skills', 'Review skills detected from employer job descriptions.'],
  careers: ['Careers', 'Manage structured career definitions used by future recommendations.'],
  learning: ['Learning Resources', 'Review and maintain administrator-entered learning resources.'],
  opportunities: ['Training & Scholarships', 'Manage real training programmes and scholarship listings for student alerts.'],
  assessments: ['Assessments', 'Manage assessment availability and participation data.'],
  certificates: ['Certificate Reviews', 'Independently review certificate evidence submitted by students and graduates.'],
  'employer-verifications': ['Employer Verification', 'Review company registration evidence and record verification decisions.'],
  'interview-reports': ['Interview Reports', 'Review student reports about employer-provided interview instructions.'],
  applications: ['Applications', 'Monitor the platform-wide application lifecycle.'],
  analytics: ['Analytics', 'Inspect platform activity from recorded database data.'],
  evaluation: ['Evaluation Report', 'Review measured system outcomes, test results and available user feedback.'],
  'data-quality': ['Data Quality', 'Review database integrity and incomplete records.'],
  security: ['Security Overview', 'Review the current auth, API, and configuration safeguards in use.'],
  'labour-market': ['Labour Market', 'Analyse actual SkillBridge jobs, skills and sector demand.'],
  ai: ['AI Monitoring', 'Monitor stored AI recommendation and feedback records without generating AI output.'],
  reports: ['Reports', 'View data-backed report summaries from platform records.'],
  audit: ['Audit Logs', 'Review append-oriented administrative activity.'],
  health: ['System Health', 'Check platform services and recent operational incidents.'],
  settings: ['Settings', 'Review administrator and platform settings.'],
}
const EMPLOYER_VERIFICATION_LABELS = {
  unverified: 'Unverified',
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
}
const EMPLOYER_VERIFICATION_TONES = {
  unverified: 'slate',
  pending: 'amber',
  verified: 'green',
  rejected: 'red',
}

function EmployerVerificationBadge({ status }) {
  const normalizedStatus = Object.hasOwn(EMPLOYER_VERIFICATION_LABELS, status) ? status : 'unverified'
  return <Badge tone={EMPLOYER_VERIFICATION_TONES[normalizedStatus]}>{EMPLOYER_VERIFICATION_LABELS[normalizedStatus]}</Badge>
}
const INPUT = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'
const EMPTY_CAREER_OPPORTUNITY = {
  title: '',
  description: '',
  opportunity_type: 'training',
  provider: '',
  application_url: '',
  location: '',
  is_remote: false,
  delivery_mode: '',
  industries: '',
  eligible_programmes: '',
  academic_qualifications: '',
  eligibility_requirements: '',
  eligible_candidate_types: [],
  min_study_year: '',
  max_study_year: '',
  application_deadline: '',
  status: 'draft',
  skill_ids: [],
  career_ids: [],
}

function EmptyState({ children, to, action = 'Open' }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">{children}{to ? <Link to={to} className="mt-3 inline-flex items-center font-semibold text-sky-700">{action}<ArrowRight size={15} className="ml-1" /></Link> : null}</div> }
function QueryError({ message }) { return <RequestError error={message} fallback="We could not load these records." /> }
function Header({ title, description, back }) { return <div className="mb-6">{back ? <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"><ArrowLeft size={15} /> Back</Link> : null}<p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Administration</p><h2 className="mt-1 text-3xl font-bold text-slate-900">{title}</h2><p className="mt-2 text-slate-600">{description}</p></div> }
function Section({ title, icon: Icon, children, action }) { return <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon size={19} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">{title}</h3></div>{action}</div>{children}</Card> }

function CertificateReviewsView() {
  const { user } = useAuth()
  const [status, setStatus] = useState('pending')
  const [certificates, setCertificates] = useState([])
  const [reviewMethods, setReviewMethods] = useState({})
  const [reviewNotes, setReviewNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getCertificateReviews(status)
      .then((result) => {
        if (active) {
          setCertificates(result)
          setError('')
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load certificate reviews.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status, refreshKey])

  const refresh = () => {
    setLoading(true)
    setNotice('')
    setError('')
    setRefreshKey((key) => key + 1)
  }

  const review = async (certificate, decision) => {
    const notes = reviewNotes[certificate.id] || ''
    if (!notes.trim()) {
      setError(`Add a review reason for “${certificate.title}” before recording this decision.`)
      return
    }
    setSavingId(certificate.id)
    setError('')
    setNotice('')
    try {
      await adminService.reviewCertificate(certificate.id, {
        status: decision,
        method: reviewMethods[certificate.id] || null,
        notes,
      }, user.id)
      setNotice(`“${certificate.title}” marked ${getCertificateStatusLabel(decision)}.`)
      setReviewNotes((current) => ({ ...current, [certificate.id]: '' }))
      setRefreshKey((key) => key + 1)
    } catch (reviewError) {
      setError(reviewError.message || 'Unable to save this certificate review.')
    } finally {
      setSavingId('')
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Certificate Reviews" description="Review uploaded credential evidence and record independent verification decisions." />
      <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </div>
    <Section title="Review queue" icon={GraduationCap} action={<label className="sr-only" htmlFor="certificate-review-status">Filter certificates</label>}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Verify only after checking the issuing institution or credential provider. Every decision requires a reason that will be visible to the candidate.</p>
        <select id="certificate-review-status" className={INPUT} value={status} onChange={(event) => { setLoading(true); setNotice(''); setError(''); setStatus(event.target.value) }}>
          <option value="pending">Pending review</option>
          <option value="verified">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="requires_correction">Requires Correction</option>
          <option value="all">All certificates</option>
        </select>
      </div>
      {notice ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <div role="status" aria-label="Loading certificates" className="space-y-3"><div className="h-40 animate-pulse rounded-xl bg-slate-100" /><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></div> : certificates.length ? <div className="space-y-4">
        {certificates.map((certificate) => {
          const student = certificate.student_profiles?.profiles || {}
          const pending = certificate.verification_status === 'pending'
          const history = [...(certificate.certificate_review_history || [])]
            .sort((first, second) => new Date(first.created_at) - new Date(second.created_at))
          const independentlyVerified = isCertificateIndependentlyVerified(certificate)
          const statusTone = independentlyVerified
            ? 'green'
            : certificate.verification_status === 'rejected' ? 'red' : 'amber'
          const statusLabel = certificate.verification_status === 'verified' && !independentlyVerified
            ? 'Verification evidence incomplete'
            : getCertificateStatusLabel(certificate.verification_status)
          return <article key={certificate.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">{certificate.title}</h4>
                <p className="mt-1 text-sm text-slate-600">{certificate.issuer || 'Issuer not recorded'} · {student.full_name || 'Candidate'}</p>
                <p className="mt-1 text-xs text-slate-500">{student.email || 'Email unavailable'} · Issued {certificate.issue_date || 'date not provided'}{certificate.expiry_date ? ` · Expires ${certificate.expiry_date}` : ''}</p>
              </div>
              <Badge tone={statusTone}>{statusLabel}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {certificate.credential_id ? <span className="text-slate-600">Credential ID: {certificate.credential_id}</span> : null}
              {certificate.credential_url ? <a className="inline-flex items-center gap-1 font-medium text-sky-700 underline" href={certificate.credential_url} target="_blank" rel="noreferrer">Issuer credential link <ExternalLink size={14} /></a> : null}
              {certificate.file_url ? <a className="inline-flex items-center gap-1 font-medium text-sky-700 underline" href={certificate.file_url} target="_blank" rel="noreferrer">View uploaded evidence <ExternalLink size={14} /></a> : <span className="text-slate-500">No uploaded file</span>}
            </div>
            {certificate.verification_status === 'verified' ? <p className="mt-3 text-xs text-slate-500">Verified by {certificate.verified_by === user.id ? 'you' : 'an administrator'} on {certificate.verified_at ? new Date(certificate.verified_at).toLocaleString() : 'date unavailable'} via {certificate.verification_method?.replaceAll('_', ' ') || 'a recorded method'}.</p> : null}
            {certificate.verification_notes ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><span className="font-semibold">Review note:</span> {certificate.verification_notes}</p> : null}
            {history.length ? <div className="mt-4 border-t border-slate-100 pt-3">
              <h5 className="text-sm font-semibold text-slate-800">Review history</h5>
              <ol className="mt-2 space-y-2">
                {history.map((event) => <li key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-800">{event.event_type === 'resubmitted' ? 'Student resubmitted for review' : `${getCertificateStatusLabel(event.new_status)} by ${event.reviewer?.full_name || 'an administrator'}`}</p>
                  {event.reason ? <p className="mt-1 text-slate-600">{event.reason}</p> : null}
                  <p className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
                </li>)}
              </ol>
            </div> : null}
            {pending ? <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Verification method
                  <select className={`${INPUT} mt-1`} value={reviewMethods[certificate.id] || ''} onChange={(event) => setReviewMethods((current) => ({ ...current, [certificate.id]: event.target.value }))}>
                    <option value="">Choose a method before approving</option>
                    <option value="issuer_registry">Issuer registry</option>
                    <option value="issuer_confirmation">Confirmation from issuer</option>
                    <option value="credential_provider">Credential provider</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Decision reason / verification evidence <span className="text-rose-700">*</span>
                  <textarea className={`${INPUT} mt-1 min-h-20`} maxLength={2000} placeholder="Record issuer evidence, or explain what must be corrected or why the certificate was rejected." value={reviewNotes[certificate.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [certificate.id]: event.target.value }))} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={savingId === certificate.id || !(reviewNotes[certificate.id] || '').trim() || !reviewMethods[certificate.id]} onClick={() => void review(certificate, 'verified')}><Check size={16} />{savingId === certificate.id ? 'Saving…' : 'Approve certificate'}</Button>
                <Button variant="outline" disabled={savingId === certificate.id || !(reviewNotes[certificate.id] || '').trim()} onClick={() => void review(certificate, 'requires_correction')}><RefreshCw size={16} />Require correction</Button>
                <Button variant="outline" disabled={savingId === certificate.id || !(reviewNotes[certificate.id] || '').trim()} onClick={() => void review(certificate, 'rejected')}><X size={16} />Reject certificate</Button>
              </div>
            </div> : null}
          </article>
        })}
      </div> : <EmptyState>{status === 'pending' ? 'There are no certificates awaiting review.' : 'No certificates match this status filter.'}</EmptyState>}
    </Section>
  </div>
}

function EmployerVerificationReviewsView() {
  const [status, setStatus] = useState('pending')
  const [submissions, setSubmissions] = useState([])
  const [reviewNotes, setReviewNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    adminService.getEmployerVerificationSubmissions(status)
      .then((result) => {
        if (active) {
          setSubmissions(result)
          setError('')
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load employer verification submissions.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status, refreshKey])

  const refresh = () => {
    setLoading(true)
    setNotice('')
    setError('')
    setRefreshKey((key) => key + 1)
  }

  const review = async (submission, decision) => {
    const feedback = reviewNotes[submission.id] || ''
    if (decision === 'rejected' && !feedback.trim()) {
      setError(`Add feedback explaining why ${submission.employer_profiles?.company_name || 'this employer'} was not approved.`)
      return
    }
    setSavingId(submission.id)
    setError('')
    setNotice('')
    try {
      await adminService.reviewEmployerVerificationSubmission(submission.id, decision, feedback)
      setNotice(`${submission.employer_profiles?.company_name || 'Employer'} marked ${decision === 'verified' ? 'verified' : 'rejected'}.`)
      setReviewNotes((current) => ({ ...current, [submission.id]: '' }))
      setRefreshKey((key) => key + 1)
    } catch (reviewError) {
      setError(reviewError.message || 'Unable to save the employer verification review.')
    } finally {
      setSavingId('')
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Employer Verification" description="Check the submitted organisation evidence before approving an employer. Decisions and feedback are retained in the verification audit history." />
      <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </div>
    <Section title="Review queue" icon={ShieldCheck}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Approval requires a submitted registration or licence document. Rejections require feedback visible to the employer.</p>
        <label className="text-sm font-medium text-slate-700">Status
          <select className={`${INPUT} mt-1`} value={status} onChange={(event) => { setLoading(true); setNotice(''); setError(''); setStatus(event.target.value) }}>
            <option value="pending">Pending review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="all">All submissions</option>
          </select>
        </label>
      </div>
      {notice ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <div role="status" aria-label="Loading employer verification submissions" className="space-y-3"><div className="h-48 animate-pulse rounded-xl bg-slate-100" /><div className="h-48 animate-pulse rounded-xl bg-slate-100" /></div> : submissions.length ? <div className="space-y-4">
        {submissions.map((submission) => {
          const employer = submission.employer_profiles || {}
          const pending = submission.status === 'pending'
          return <article key={submission.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">{employer.company_name || 'Unnamed company'}</h4>
                <p className="mt-1 text-sm text-slate-600">{employer.industry || 'Industry not provided'} · {employer.email || 'No contact email'}</p>
                <p className="mt-1 text-xs text-slate-500">Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'date unavailable'}</p>
              </div>
              <Badge tone={submission.status === 'verified' ? 'green' : submission.status === 'rejected' ? 'red' : 'amber'}>{submission.status === 'verified' ? 'Verified' : submission.status === 'rejected' ? 'Rejected' : 'Pending review'}</Badge>
            </div>
            <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Legal organisation</dt><dd className="mt-1 text-sm font-medium text-slate-800">{submission.legal_business_name}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Registration / licence</dt><dd className="mt-1 text-sm font-medium text-slate-800">{submission.registration_number}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Authority and country</dt><dd className="mt-1 text-sm font-medium text-slate-800">{submission.registration_authority} · {submission.registration_country}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Authorised representative</dt><dd className="mt-1 text-sm font-medium text-slate-800">{submission.representative_name} · {submission.representative_role}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {submission.document_url ? <a className="inline-flex items-center gap-1 font-medium text-sky-700 underline" href={submission.document_url} target="_blank" rel="noreferrer">View private evidence <ExternalLink size={14} /></a> : <span className="text-rose-700">Evidence document unavailable</span>}
            </div>
            {submission.reviewer_feedback ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><span className="font-semibold">Review feedback:</span> {submission.reviewer_feedback}</p> : null}
            {submission.employer_verification_events?.length ? <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit history</p><ul className="mt-2 space-y-1 text-xs text-slate-600">{submission.employer_verification_events.map((item) => <li key={item.id}>{item.action === 'approved' ? 'Approved' : item.action === 'rejected' ? 'Rejected' : 'Submitted'}{item.actor_id ? ` by ${item.actor_id}` : ''} · {item.created_at ? new Date(item.created_at).toLocaleString() : 'date unavailable'}{item.note ? ` · ${item.note}` : ''}</li>)}</ul></div> : null}
            {pending ? <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <label className="block text-sm font-medium text-slate-700">Reviewer feedback (required to reject; visible to employer)
                <textarea className={`${INPUT} mt-1 min-h-20`} maxLength={2000} placeholder="Summarise the evidence checked, or explain what must be corrected." value={reviewNotes[submission.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [submission.id]: event.target.value }))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={savingId === submission.id || !submission.document_url} onClick={() => void review(submission, 'verified')}><Check size={16} />{savingId === submission.id ? 'Saving…' : 'Approve verification'}</Button>
                <Button variant="outline" disabled={savingId === submission.id || !(reviewNotes[submission.id] || '').trim()} onClick={() => void review(submission, 'rejected')}><X size={16} />Reject with feedback</Button>
              </div>
            </div> : null}
          </article>
        })}
      </div> : <EmptyState>{status === 'pending' ? 'There are no employers awaiting verification review.' : 'No employer verification submissions match this status filter.'}</EmptyState>}
    </Section>
  </div>
}

function AdminDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let active = true
    adminService.getDashboard()
      .then((result) => {
        if (active) {
          setData(result)
          setUpdatedAt(new Date())
          setError('')
        }
      })
      .catch((loadError) => { if (active) setError(loadError) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }

  if (loading && !data) return <div className="space-y-6"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>
  if (error && !data) return <div className="space-y-6"><Header title="Admin Dashboard" description="Platform oversight, governance, and performance data." /><RequestError error={error} fallback="We could not load administration metrics." onRetry={refresh} /></div>

  const m = data.metrics
  const metrics = [['Total Users', m.users, Users], ['Students/Graduates', m.studentProfiles, GraduationCapIcon], ['Employers', m.employers, Building2], ['Published Jobs', m.jobs, BriefcaseBusiness], ['Applications', m.applications, FileText], ['Interviews', m.interviews, CalendarIcon], ['Hired Candidates', m.employment, CheckCircle2], ['Learning Resources', m.resources, BookOpen]]
  const shortcuts = [
    { label: 'Review users', to: '/admin/users', icon: Users },
    { label: 'Manage jobs', to: '/admin/jobs', icon: BriefcaseBusiness },
    { label: 'Explore analytics', to: '/admin/analytics', icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-sky-900 to-sky-700 p-6 text-white shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">Administration</p>
          <h2 className="mt-2 text-3xl font-bold">Platform overview</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">Monitor users, opportunities, and activity across SkillBridge Malawi.</p>
        </div>
        <Button variant="outline" className="shrink-0 border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing…' : 'Refresh data'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LastUpdated value={updatedAt} />
        {error ? <div className="min-w-0 flex-1"><RequestError error={error} fallback="We could not refresh administration metrics." stale onRetry={refresh} /></div> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, Icon]) => (
          <Card key={label} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><span className="rounded-xl bg-sky-50 p-2 text-sky-700"><Icon size={18} /></span></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value ?? 0}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <Section title="Platform overview" icon={Gauge}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/admin/skills" className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/50">
              <p className="text-sm text-slate-500">Skills in taxonomy</p><p className="mt-2 text-2xl font-bold text-slate-900">{m.skills ?? 0}</p>
            </Link>
            <Link to="/admin/careers" className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/50">
              <p className="text-sm text-slate-500">Career definitions</p><p className="mt-2 text-2xl font-bold text-slate-900">{m.careers ?? 0}</p>
            </Link>
          </div>
        </Section>
        <Section title="Quick links" icon={ArrowRight}>
          <div className="space-y-2">
            {shortcuts.map(({ label, to, icon: Icon }) => (
              <Link key={to} to={to} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-800">
                <span className="flex items-center gap-3"><Icon size={17} className="text-sky-700" />{label}</span><ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Recent administrative activity" icon={Activity}>
        {data.alerts?.length ? data.alerts.map((item) => (
          <div key={item.id} className="mb-3 rounded-xl border border-slate-200 p-3 last:mb-0">
            <div className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-3"><p className="font-medium text-slate-800">{item.action}</p><time className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</time></div>
            <p className="mt-1 text-sm text-slate-500">{item.description || `${item.entity_type} record`}</p>
          </div>
        )) : <EmptyState>No administrative activity has been recorded yet.</EmptyState>}
      </Section>
    </div>
  )
}
function GraduationCapIcon(props) { return <UserRound {...props} /> }
function CalendarIcon(props) { return <Activity {...props} /> }

function SearchBar({ value, onChange, placeholder = 'Search records' }) { return <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div> }

function UsersView({ detailId }) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = JSON.stringify({ search, role, refreshKey })

  useEffect(() => {
    let active = true
    adminService.getUsers({ search: search.trim(), role })
      .then((items) => { if (active) setResult({ key: requestKey, items, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], error: loadError.message || 'Unable to load users.' }) })
    return () => { active = false }
  }, [search, role, requestKey])

  if (detailId) return <UserDetail id={detailId} />
  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const loading = !currentResult

  return (
    <div className="space-y-6">
      <Header title="Users" description="Browse platform accounts and their public profile details. Authentication credentials are never shown here." />
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Search users</span>
            <SearchBar value={search} onChange={setSearch} placeholder="Name or email address" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Filter by role</span>
            <select className={INPUT} value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option><option value="student">Student</option><option value="employer">Employer</option><option value="admin">Admin</option>
            </select>
          </label>
          {(search || role) ? <Button type="button" variant="ghost" className="sm:mb-0.5" onClick={() => { setSearch(''); setRole('') }}>Clear filters</Button> : null}
        </div>
      </Card>
      <Section title="User directory" icon={Users} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'user' : 'users'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading users" className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="pb-3 pr-4">User</th><th scope="col" className="pb-3 pr-4">Role</th><th scope="col" className="pb-3 pr-4">Registered</th><th scope="col" className="pb-3 text-right">Profile</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="py-3 pr-4">
                      <div className="flex min-w-0 items-center gap-3"><Avatar src={item.avatar_url} name={item.full_name || item.email || 'User'} size="sm" /><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{item.full_name || 'Name not provided'}</p><p className="truncate text-xs text-slate-500">{item.email}</p></div></div>
                    </td>
                    <td className="py-3 pr-4"><Badge tone={item.role === 'admin' ? 'amber' : item.role === 'employer' ? 'green' : 'blue'}>{item.role || 'Unknown role'}</Badge></td>
                    <td className="py-3 pr-4 text-slate-600">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                    <td className="py-3 text-right"><Link to={`/admin/users/${item.id}`} className="inline-flex rounded-lg px-3 py-2 font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View profile<span className="sr-only"> for {item.full_name || item.email}</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>{search || role ? 'No users match the current search and role filters.' : 'No user accounts have been registered yet.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}
function UserDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getUser(id)
      .then((user) => { if (active) setResult({ key: requestKey, user, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, user: null, error: loadError.message || 'Unable to load this user.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="grid gap-4 md:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="User profile" description="User account details" back="/admin/users" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const user = currentResult.user
  const student = Array.isArray(user.student_profiles) ? user.student_profiles[0] : user.student_profiles
  const employer = Array.isArray(user.employer_profiles) ? user.employer_profiles[0] : user.employer_profiles
  const details = user.role === 'student' ? [
    ['Institution', student?.institution], ['Programme', student?.programme], ['Education level', student?.education_level],
    ['Location', [student?.city, student?.district, student?.country].filter(Boolean).join(', ')],
    ['Profile completion', student?.profile_completion == null ? null : `${student.profile_completion}%`],
  ] : user.role === 'employer' ? [
    ['Company', employer?.company_name || user.company_name], ['Industry', employer?.industry], ['Company size', employer?.company_size],
    ['Location', [employer?.city, employer?.district, employer?.country].filter(Boolean).join(', ')],
    ['Website', employer?.website], ['Verification', employer ? EMPLOYER_VERIFICATION_LABELS[employer.verification_status] || 'Unverified' : null],
  ] : [['Account type', 'Administrator']]

  return (
    <div className="space-y-6">
      <Header title="User profile" description="Read-only account and role profile information." back="/admin/users" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar src={user.avatar_url} name={user.full_name || user.email || 'User'} size="lg" className="border-2 border-white/70" />
            <div className="min-w-0 flex-1 text-white"><h3 className="truncate text-xl font-bold">{user.full_name || 'Name not provided'}</h3><p className="mt-1 flex items-center gap-2 break-all text-sm text-sky-100"><Mail size={15} className="shrink-0" />{user.email}</p></div>
            <Badge tone={user.role === 'admin' ? 'amber' : user.role === 'employer' ? 'green' : 'blue'}>{user.role || 'Unknown role'}</Badge>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"><CalendarDays size={18} className="mt-0.5 text-sky-700" /><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Registered</p><p className="mt-1 text-sm font-semibold text-slate-800">{user.created_at ? new Date(user.created_at).toLocaleString() : 'Not available'}</p></div></div>
          {details.find(([label]) => label === 'Location')?.[1] ? <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"><MapPin size={18} className="mt-0.5 text-sky-700" /><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</p><p className="mt-1 text-sm font-semibold text-slate-800">{details.find(([label]) => label === 'Location')[1]}</p></div></div> : null}
        </div>
      </Card>
      <Section title={user.role === 'employer' ? 'Employer profile' : user.role === 'student' ? 'Student profile' : 'Account details'} icon={user.role === 'employer' ? Building2 : UserRound}>
        {details.some(([, value]) => value) ? (
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{details.filter(([label, value]) => value && label !== 'Location').map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd></div>)}</dl>
        ) : <EmptyState>No extended profile information has been provided.</EmptyState>}
      </Section>
    </div>
  )
}

function EmployersView({ detailId }) {
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = JSON.stringify({ search, refreshKey })

  useEffect(() => {
    if (detailId) return undefined
    let active = true
    adminService.getEmployers(search.trim())
      .then((items) => { if (active) setResult({ key: requestKey, items, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], error: loadError.message || 'Unable to load employers.' }) })
    return () => { active = false }
  }, [search, requestKey, detailId])

  if (detailId) return <EmployerDetail id={detailId} />

  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const loading = !currentResult

  return (
    <div className="space-y-6">
      <Header title="Employers" description="Review company profiles, verification status, and activity across the platform." />
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Search companies</span>
            <SearchBar value={search} onChange={setSearch} placeholder="Enter a company name" />
          </label>
          {search ? <Button variant="ghost" onClick={() => setSearch('')}>Clear search</Button> : null}
        </div>
      </Card>
      <Section title="Employer directory" icon={Building2} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'company' : 'companies'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading employers" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  {item.logo_url ? <img src={item.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Building2 size={22} /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-slate-900">{item.company_name || 'Unnamed company'}</h3><EmployerVerificationBadge status={item.verification_status} /></div>
                    <p className="mt-1 text-sm text-slate-500">{item.industry || 'Industry not provided'}{item.company_size ? ` · ${item.company_size}` : ''}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><MapPin size={15} className="shrink-0 text-slate-400" />{[item.city, item.district, item.country].filter(Boolean).join(', ') || 'Location not provided'}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                  <Badge tone="slate">{item.jobs?.length || 0} jobs</Badge><Badge tone="slate">{item.employment?.length || 0} employees</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-500">{item.email || 'No contact email'}</span>
                  <Link to={`/admin/employers/${item.id}`} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View company<span className="sr-only"> {item.company_name}</span></Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>{search ? 'No companies match your search.' : 'No employer profiles have been registered yet.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}

function EmployerDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getEmployer(id)
      .then((employer) => { if (active) setResult({ key: requestKey, employer, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, employer: null, error: loadError.message || 'Unable to load this employer.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Employer profile" description="Company account details" back="/admin/employers" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const employer = currentResult.employer
  const location = [employer.city, employer.district, employer.country].filter(Boolean).join(', ')
  const jobs = employer.jobs || []

  return (
    <div className="space-y-6">
      <Header title="Employer profile" description="Company details and platform activity." back="/admin/employers" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-wrap items-center gap-4">
            {employer.logo_url ? <img src={employer.logo_url} alt="" className="h-16 w-16 rounded-2xl border border-white/30 bg-white object-contain p-1" /> : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"><Building2 size={30} /></span>}
            <div className="min-w-0 flex-1"><h3 className="text-2xl font-bold">{employer.company_name || 'Unnamed company'}</h3><p className="mt-1 text-sm text-sky-100">{employer.industry || 'Industry not provided'}{employer.company_size ? ` · ${employer.company_size}` : ''}</p></div>
            <EmployerVerificationBadge status={employer.verification_status} />
          </div>
          {employer.description ? <p className="mt-5 max-w-4xl text-sm leading-6 text-sky-50">{employer.description}</p> : null}
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact email</dt><dd className="mt-1 break-all text-sm font-medium text-slate-800">{employer.email || 'Not provided'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt><dd className="mt-1 text-sm font-medium text-slate-800">{employer.phone || 'Not provided'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Website</dt><dd className="mt-1 break-all text-sm font-medium text-slate-800">{employer.website || 'Not provided'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt><dd className="mt-1 text-sm font-medium text-slate-800">{location || 'Not provided'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Registered</dt><dd className="mt-1 text-sm font-medium text-slate-800">{employer.created_at ? new Date(employer.created_at).toLocaleDateString() : 'Not available'}</dd></div>
        </dl>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5"><p className="text-sm text-slate-500">Job postings</p><p className="mt-2 text-3xl font-bold text-slate-900">{jobs.length}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-500">Employment records</p><p className="mt-2 text-3xl font-bold text-slate-900">{employer.employment?.length || 0}</p></Card>
      </div>
      <Section title="Company job postings" icon={BriefcaseBusiness}>
        {jobs.length ? (
          <div className="divide-y divide-slate-100">
            {jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold text-slate-800">{job.title || 'Untitled job'}</p><p className="mt-1 text-sm text-slate-500">{[job.location, job.created_at ? new Date(job.created_at).toLocaleDateString() : null].filter(Boolean).join(' · ')}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{job.applications?.length || 0} applications</span><Badge tone={job.status === 'published' ? 'green' : 'slate'}>{job.status || 'Unknown status'}</Badge></div></div>)}
          </div>
        ) : <EmptyState>This company has not posted any jobs yet.</EmptyState>}
      </Section>
    </div>
  )
}

function JobsView({ detailId }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [statusChange, setStatusChange] = useState({ id: '', error: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = JSON.stringify({ search, status, refreshKey })

  useEffect(() => {
    if (detailId) return undefined
    let active = true
    adminService.getJobs({ search: search.trim(), status })
      .then((items) => { if (active) setResult({ key: requestKey, items, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], error: loadError.message || 'Unable to load jobs.' }) })
    return () => { active = false }
  }, [search, status, requestKey, detailId])

  if (detailId) return <JobDetail id={detailId} />

  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const duplicatePairs = findPotentialJobDuplicatePairs(items)
  const loading = !currentResult

  const updateStatus = async (id, nextStatus) => {
    setStatusChange({ id, error: '' })
    let updatedJob
    try {
      updatedJob = await adminService.updateJobStatus(id, nextStatus)
    } catch (updateError) {
      setStatusChange({ id: '', error: updateError.message || 'Unable to update the job status.' })
      return
    }

    try {
      const records = await adminService.getJobs({ search: search.trim(), status })
      setResult({ key: requestKey, items: records, error: '' })
    } catch (loadError) {
      setResult((current) => current?.key === requestKey
        ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...updatedJob } : item) }
        : current)
      setStatusChange({ id: '', error: `Status updated, but the list could not be refreshed. ${loadError.message || 'Please refresh the page.'}` })
      setRefreshKey((key) => key + 1)
      return
    }
    setStatusChange({ id: '', error: '' })
  }

  const statusTone = { published: 'green', draft: 'slate', closed: 'amber', archived: 'red' }

  return (
    <div className="space-y-6">
      <Header title="Jobs" description="Review job listings, application activity, and publication status across the platform." />
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search jobs</span><SearchBar value={search} onChange={setSearch} placeholder="Search job titles" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Filter by status</span><select className={INPUT} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'published', 'closed', 'archived'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          {(search || status) ? <Button variant="ghost" onClick={() => { setSearch(''); setStatus('') }}>Clear filters</Button> : null}
        </div>
      </Card>
      {statusChange.error ? <QueryError message={statusChange.error} /> : null}
      {!loading && duplicatePairs.length ? <Section title="Possible duplicate jobs" icon={AlertTriangle}>
        <p className="mb-4 text-sm leading-6 text-slate-600">These pairs are review candidates, not confirmed duplicates. Separate vacancies with similar details are valid. Archive only after checking ownership and history; the platform does not merge or delete jobs.</p>
        <div className="space-y-3">{duplicatePairs.map(({ left, right, comparison }) => (
          <div key={`${left.id}:${right.id}`} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            {[left, right].map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <div><p className="font-semibold text-slate-900">{job.title} · {job.employer_profiles?.company_name || 'Employer not available'}</p><p className="text-sm text-slate-600">{job.location || 'Location not set'} · {(job.employment_type || 'job').replaceAll('_', ' ')} · {job.applications?.length || 0} applications</p></div>
              <Link to={`/admin/jobs/${job.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-white">Review job</Link>
            </div>)}
            <p className="mt-2 text-xs text-slate-600">Description similarity {Math.round(comparison.descriptionSimilarity * 100)}%. Review application history and downstream records before changing either status.</p>
          </div>
        ))}</div>
      </Section> : null}
      <Section title="Job directory" icon={BriefcaseBusiness} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'job' : 'jobs'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading jobs" className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="p-5 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900">{item.title || 'Untitled job'}</h3><p className="mt-1 text-sm text-slate-500">{item.employer_profiles?.company_name || 'Employer not available'}</p></div>
                  <Badge tone={statusTone[item.status] || 'slate'}>{item.status || 'Unknown status'}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-slate-400" />{item.location || 'Location not specified'}</span>
                  <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness size={15} className="text-slate-400" />{(item.employment_type || 'job').replaceAll('_', ' ')}</span>
                  {item.application_deadline ? <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} className="text-slate-400" />Closes {new Date(`${item.application_deadline}T00:00:00`).toLocaleDateString()}</span> : null}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="text-sm text-slate-500">{item.applications?.length || 0} applications · Posted {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'date unavailable'}</span>
                  <Link to={`/admin/jobs/${item.id}`} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View details<span className="sr-only"> for {item.title}</span></Link>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`job-status-${item.id}`}>Change status for {item.title}</label>
                  <select id={`job-status-${item.id}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none" value={item.status} onChange={(event) => updateStatus(item.id, event.target.value)} disabled={statusChange.id === item.id}>
                    {['draft', 'published', 'closed', 'archived'].map((jobStatus) => <option key={jobStatus} value={jobStatus}>{jobStatus[0].toUpperCase() + jobStatus.slice(1)}</option>)}
                  </select>
                  {statusChange.id === item.id ? <span className="text-xs text-slate-500">Updating…</span> : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>{search || status ? 'No jobs match the current search and status filters.' : 'No job listings have been created yet.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}

function JobDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getJob(id)
      .then((job) => { if (active) setResult({ key: requestKey, job, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, job: null, error: loadError.message || 'Unable to load this job.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Job details" description="Job listing details" back="/admin/jobs" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const job = currentResult.job
  const { required: requiredSkills, preferred: preferredSkills } = groupJobSkills(job.job_skills)
  const updateStatus = async (nextStatus) => {
    setSavingStatus(true)
    setStatusError('')
    try {
      const updatedJob = await adminService.updateJobStatus(job.id, nextStatus)
      setResult({ key: requestKey, job: { ...job, ...updatedJob }, error: '' })
    } catch (updateError) {
      setStatusError(updateError.message || 'Unable to update the job status.')
    } finally {
      setSavingStatus(false)
    }
  }
  const statusTone = { published: 'green', draft: 'slate', closed: 'amber', archived: 'red' }
  const salary = job.salary_min != null || job.salary_max != null
    ? `${job.currency || 'MWK'} ${job.salary_min ?? '—'} – ${job.salary_max ?? '—'}`
    : null

  return (
    <div className="space-y-6">
      <Header title="Job details" description="Listing information and application activity." back="/admin/jobs" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm text-sky-200">{job.employer_profiles?.company_name || 'Employer not available'}</p><h3 className="mt-1 text-2xl font-bold">{job.title || 'Untitled job'}</h3><p className="mt-2 text-sm text-sky-100">{[job.location, job.employment_type?.replaceAll('_', ' '), job.work_mode].filter(Boolean).join(' · ')}</p></div>
            <Badge tone={statusTone[job.status] || 'slate'}>{job.status || 'Unknown status'}</Badge>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block"><span className="mb-1 block text-xs font-medium text-sky-100">Change job status</span><select className="rounded-lg border border-white/30 bg-white px-3 py-2 text-sm text-slate-800" value={job.status} onChange={(event) => updateStatus(event.target.value)} disabled={savingStatus}>{['draft', 'published', 'closed', 'archived'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
            {savingStatus ? <span className="pb-2 text-sm text-sky-100">Updating…</span> : null}
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">
          {[['Department', job.department], ['Salary range', salary], ['Experience', job.experience_required], ['Education', job.education_required], ['Application deadline', job.application_deadline ? new Date(`${job.application_deadline}T00:00:00`).toLocaleDateString() : null], ['Published', job.published_at ? new Date(job.published_at).toLocaleDateString() : null]].filter(([, value]) => value).map(([label, value]) => <div key={label}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>)}
        </div>
      </Card>
      {statusError ? <QueryError message={statusError} /> : null}
      <Section title="Job description" icon={FileText}><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{job.description || 'No description provided.'}</p></Section>
      <Section title="Required skills" icon={Sparkles}>
        {requiredSkills.length ? <div className="flex flex-wrap gap-2">{requiredSkills.map((item) => <Badge key={item.id} tone="blue">{item.skills?.name || 'Skill'} · {item.required_level || 'level not set'}</Badge>)}</div> : <EmptyState>No required skills are linked to this listing.</EmptyState>}
      </Section>
      <Section title="Preferred skills" icon={Sparkles}>
        {preferredSkills.length ? <div className="flex flex-wrap gap-2">{preferredSkills.map((item) => <Badge key={item.id} tone="slate">{item.skills?.name || 'Skill'} · {item.required_level || 'level not set'}</Badge>)}</div> : <p className="text-sm text-slate-500">No preferred skills specified.</p>}
      </Section>
      <div className="grid gap-4 sm:grid-cols-2"><Card className="p-5"><p className="text-sm text-slate-500">Applications</p><p className="mt-2 text-3xl font-bold text-slate-900">{job.applications?.length || 0}</p></Card><Card className="p-5"><p className="text-sm text-slate-500">Created</p><p className="mt-2 text-lg font-semibold text-slate-900">{job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Not available'}</p></Card></div>
    </div>
  )
}

const EMPTY_CAREER_FORM = {
  title: '',
  sector: '',
  description: '',
  entry_level: '',
  growth_path: '',
  academic_programmes_text: '',
  required_qualifications_text: '',
  responsibilities_text: '',
  opportunity_areas_text: '',
  outlook_summary: '',
  outlook_source: '',
  outlook_source_url: '',
  outlook_reviewed: false,
  status: 'draft',
}

function CareerAdminView({ detailId, editing = false, creating = false }) {
  if (creating) return <CareerForm />
  if (detailId) {
    return editing
      ? <CareerForm key={detailId} careerId={detailId} />
      : <CareerDetail id={detailId} />
  }

  return <CareerDirectory />
}

function CareerDirectory() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sector, setSector] = useState('')
  const [sectors, setSectors] = useState([])
  const [sectorError, setSectorError] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 12
  const requestKey = JSON.stringify({ search: search.trim(), status, sector, page, refreshKey })

  useEffect(() => {
    let active = true
    adminService.getCareers({ search: search.trim(), status, sector, page, pageSize })
      .then((data) => { if (active) setResult({ key: requestKey, ...data, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], total: 0, error: loadError.message || 'Unable to load careers.' }) })
    return () => { active = false }
  }, [search, status, sector, page, pageSize, requestKey])

  useEffect(() => {
    let active = true
    adminService.getCareerSectors()
      .then((items) => { if (active) { setSectors(items); setSectorError('') } })
      .catch((loadError) => { if (active) setSectorError(loadError.message || 'Unable to load career sectors.') })
    return () => { active = false }
  }, [refreshKey])

  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const total = currentResult?.total || 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const loading = !currentResult

  return (
    <div className="space-y-6">
      <Header title={CONFIG.careers[0]} description={CONFIG.careers[1]} />
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-sky-900 to-sky-700 p-6 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">Career catalogue</p><h2 className="mt-2 text-2xl font-bold">Build clear career pathways</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">Maintain career definitions that students can explore, including entry requirements, growth paths, and relevant skills.</p></div>
        <Link to="/admin/careers/create"><Button variant="outline" className="shrink-0 border-white/40 bg-white/10 text-white hover:bg-white/20"><Plus size={16} />Create career</Button></Link>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_14rem_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search career titles</span><SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search career titles" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Publication status</span><select className={INPUT} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['draft', 'published', 'archived'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Industry or sector</span><select className={INPUT} value={sector} onChange={(event) => { setSector(event.target.value); setPage(1) }}><option value="">All sectors</option>{sectors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          {(search || status || sector) ? <Button variant="ghost" onClick={() => { setSearch(''); setStatus(''); setSector(''); setPage(1) }}>Clear filters</Button> : null}
        </div>
        {sectorError ? <p role="status" className="mt-3 text-sm text-amber-800">{sectorError}</p> : null}
      </Card>
      <Section title="Career definitions" icon={Target} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${total} ${total === 1 ? 'career' : 'careers'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading careers" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((career) => (
              <Card key={career.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-slate-900">{career.title}</h3><p className="mt-1 text-sm font-medium text-sky-800">{career.sector}</p></div><Badge tone={career.status === 'published' ? 'green' : career.status === 'archived' ? 'slate' : 'amber'}>{career.status || 'draft'}</Badge></div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{career.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">{career.entry_level ? <Badge tone="slate">Entry: {career.entry_level}</Badge> : null}<Badge tone="slate">{career.career_skills?.filter((item) => item.is_required !== false).length || 0} required skills</Badge><Badge tone="slate">{career.career_skills?.filter((item) => item.is_required === false).length || 0} preferred</Badge>{career.outlook_verified_at ? <Badge tone="blue">Outlook source reviewed</Badge> : (career.demand_level || career.salary_range) ? <Badge tone="amber">Legacy outlook needs review</Badge> : null}</div>
                {career.career_skills?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{career.career_skills.slice(0, 4).map((item) => <span key={item.id} className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{item.skills?.name || 'Skill'}</span>)}{career.career_skills.length > 4 ? <span className="px-1 py-1 text-xs text-slate-500">+{career.career_skills.length - 4} more</span> : null}</div> : null}
                <div className="mt-auto flex justify-end border-t border-slate-100 pt-4">
                  <Link to={`/admin/careers/${career.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View career<ArrowRight size={15} className="ml-1 inline" /></Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState to="/admin/careers/create" action="Create a career">{search || status || sector ? 'No careers match the current search and filters.' : 'No career definitions have been created yet.'}</EmptyState>
        )}
        {!loading && total > pageSize ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">Page {page} of {pageCount}</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={15} />Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ArrowRight size={15} /></Button></div>
        </div> : null}
      </Section>
    </div>
  )
}

function CareerForm({ careerId }) {
  const navigate = useNavigate()
  const editing = Boolean(careerId)
  const [form, setForm] = useState(EMPTY_CAREER_FORM)
  const [loadState, setLoadState] = useState({ loading: true, error: '' })
  const [skillOptions, setSkillOptions] = useState([])
  const [resourceOptions, setResourceOptions] = useState([])
  const [selectedSkills, setSelectedSkills] = useState([])
  const [selectedResourceIds, setSelectedResourceIds] = useState([])
  const [skillSearch, setSkillSearch] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      skillService.listSkills(),
      adminService.getCareerLearningResources(),
      careerId ? adminService.getCareer(careerId) : Promise.resolve(null),
    ])
      .then(([skills, resources, career]) => {
        if (!active) return
        setSkillOptions(skills)
        setResourceOptions(resources)
        if (career) {
          setForm({
            title: career.title || '',
            sector: career.sector || '',
            description: career.description || '',
            entry_level: career.entry_level || '',
            growth_path: career.growth_path || '',
            academic_programmes_text: (career.academic_programmes || []).join('\n'),
            required_qualifications_text: (career.required_qualifications || []).join('\n'),
            responsibilities_text: (career.responsibilities || []).join('\n'),
            opportunity_areas_text: (career.opportunity_areas || []).join('\n'),
            outlook_summary: career.outlook_summary || '',
            outlook_source: career.outlook_source || '',
            outlook_source_url: career.outlook_source_url || '',
            outlook_reviewed: Boolean(career.outlook_verified_at),
            status: career.status || 'draft',
          })
          setSelectedSkills((career.career_skills || []).map((item) => ({
            skill_id: item.skill_id,
            name: item.skills?.name || 'Previously linked skill',
            category: item.skills?.category || '',
            approval_status: item.skills?.approval_status,
            required_level: item.required_level || 'beginner',
            importance: item.importance ?? 50,
            is_required: item.is_required !== false,
          })))
          setSelectedResourceIds((career.career_learning_resources || []).map((item) => item.learning_resource_id))
        }
        setLoadState({ loading: false, error: '' })
      })
      .catch((loadError) => { if (active) setLoadState({ loading: false, error: loadError.message || 'Unable to load career form data.' }) })
    return () => { active = false }
  }, [careerId])

  const save = async (event) => {
    event.preventDefault()
    setFormError('')
    const careerPayload = {
      ...(careerId ? { id: careerId } : {}),
      ...form,
      academic_programmes: parseCareerList(form.academic_programmes_text),
      required_qualifications: parseCareerList(form.required_qualifications_text),
      responsibilities: parseCareerList(form.responsibilities_text),
      opportunity_areas: parseCareerList(form.opportunity_areas_text),
      skill_requirements: selectedSkills.map((item) => ({
        skill_id: item.skill_id,
        is_required: item.is_required,
        required_level: item.required_level,
        importance: item.importance,
      })),
      learning_resource_ids: selectedResourceIds,
    }
    const validationError = validateCareerDefinition(careerPayload)
    if (validationError) {
      setFormError(validationError)
      return
    }
    setSaving(true)
    try {
      const career = await adminService.saveCareer(careerPayload)
      navigate(`/admin/careers/${career.id}`)
    } catch (saveError) {
      setFormError(saveError.message || 'Unable to save career.')
    } finally {
      setSaving(false)
    }
  }

  if (loadState.loading) return <div className="space-y-4"><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (loadState.error) return <div className="space-y-4"><Header title={editing ? 'Edit career' : 'Create career'} description="Career definition and pathway information." back={editing ? `/admin/careers/${careerId}` : '/admin/careers'} /><QueryError message={loadState.error} /><Button variant="outline" onClick={() => navigate('/admin/careers')}>Back to careers</Button></div>

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const toggleSkill = (skill) => setSelectedSkills((current) => {
    if (current.some((item) => item.skill_id === skill.id)) return current.filter((item) => item.skill_id !== skill.id)
    return [...current, {
      skill_id: skill.id,
      name: skill.name,
      category: skill.category,
      required_level: 'beginner',
      importance: 50,
      is_required: true,
    }]
  })
  const updateSelectedSkill = (skillId, field, value) => setSelectedSkills((current) => current.map((item) => (
    item.skill_id === skillId ? { ...item, [field]: value } : item
  )))
  const filteredSkills = skillOptions.filter((skill) => (
    `${skill.name} ${skill.category || ''}`.toLowerCase().includes(skillSearch.trim().toLowerCase())
  ))
  const filteredResources = resourceOptions.filter((resource) => (
    `${resource.title} ${resource.provider || ''}`.toLowerCase().includes(resourceSearch.trim().toLowerCase())
  ))
  const textFields = [
    ['academic_programmes_text', 'Related academic programmes', 'One programme per line; examples are not restrictive.'],
    ['required_qualifications_text', 'Required qualifications', 'List credentials or equivalent experience where appropriate.'],
    ['responsibilities_text', 'Responsibilities', 'One typical responsibility per line.'],
    ['opportunity_areas_text', 'Career opportunities and work settings', 'List possible roles, sectors, or settings—not advertised vacancies.'],
  ]
  const careerFields = [
    ['entry_level', 'Entry level', 'Describe common entry routes.'],
    ['growth_path', 'Growth path', 'Describe possible progression.'],
  ]

  return (
    <div className="space-y-6">
      <Header title={editing ? 'Edit career' : 'Create career'} description={editing ? 'Update the career definition, skills, and learning links.' : 'Add a career definition for students to explore.'} back={editing ? `/admin/careers/${careerId}` : '/admin/careers'} />
      {editing ? <p className="text-sm text-slate-600">Current status: <Badge tone={form.status === 'published' ? 'green' : form.status === 'archived' ? 'slate' : 'amber'}>{form.status}</Badge>. Status changes are managed from the career details page.</p> : null}
      <form onSubmit={save} className="space-y-6">
        <Section title="Career information" icon={editing ? FileText : Plus}>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Career title <span className="text-rose-600">*</span></span><input required maxLength={160} className={INPUT} placeholder="e.g. Agricultural Extension Officer" value={form.title} onChange={update('title')} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Industry or sector <span className="text-rose-600">*</span></span><input required maxLength={120} className={INPUT} placeholder="e.g. Agriculture, Health, Education, Finance" value={form.sector} onChange={update('sector')} /></label>
            </div>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Career description <span className="text-rose-600">*</span></span><textarea required maxLength={4000} className={`${INPUT} min-h-32`} placeholder="Describe the work and typical scope of the role." value={form.description} onChange={update('description')} /></label>
            <div className="grid gap-4 sm:grid-cols-2">{careerFields.map(([field, label, help]) => <label key={field} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input maxLength={200} className={INPUT} placeholder={help} value={form[field]} onChange={update(field)} /><span className="mt-1 block text-xs text-slate-500">{help}</span></label>)}</div>
            {textFields.map(([field, label, help]) => <label key={field} className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><textarea className={`${INPUT} min-h-24`} placeholder={help} value={form[field]} onChange={update(field)} /><span className="mt-1 block text-xs text-slate-500">{help}</span></label>)}
          </div>
        </Section>

        <Section title="Employment outlook source" icon={BarChart3}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">Outlook information is optional. Do not invent statistics or present unverified information as official. Students see this summary only after an administrator reviews its source.</p>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Source-backed outlook summary</span><textarea maxLength={2000} className={`${INPUT} min-h-24`} value={form.outlook_summary} onChange={update('outlook_summary')} placeholder="Describe sourced information without overstating what it establishes." /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Source name or citation</span><input maxLength={300} className={INPUT} value={form.outlook_source} onChange={update('outlook_source')} placeholder="Organisation, report title, or publication date" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Source link (HTTPS)</span><input type="url" className={INPUT} value={form.outlook_source_url} onChange={update('outlook_source_url')} placeholder="https://…" /></label>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={form.outlook_reviewed} onChange={(event) => setForm((current) => ({ ...current, outlook_reviewed: event.target.checked }))} /><span>I reviewed the cited source. This does not certify the information as a national or official statistic.</span></label>
          </div>
        </Section>

        <Section title="Required and preferred skills" icon={Layers3}>
          <p className="mb-4 text-sm text-slate-600">Choose from active, approved catalog skills. Mark each as required or preferred; at least one required skill is needed to publish.</p>
          <label className="mb-3 block"><span className="sr-only">Search catalog skills</span><SearchBar value={skillSearch} onChange={setSkillSearch} placeholder="Search skill names and categories" /></label>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {filteredSkills.length ? <div className="grid gap-2 sm:grid-cols-2">{filteredSkills.map((skill) => <label key={skill.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 text-sm"><input type="checkbox" checked={selectedSkills.some((item) => item.skill_id === skill.id)} onChange={() => toggleSkill(skill)} /><span><span className="block font-medium text-slate-800">{skill.name}</span><span className="text-xs text-slate-500">{skill.category}</span></span></label>)}</div> : <p className="p-3 text-sm text-slate-600">No approved skills match this search.</p>}
          </div>
          {selectedSkills.length ? <div className="mt-4 space-y-2">{selectedSkills.map((skill) => <div key={skill.skill_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div><p className="font-medium text-slate-800">{skill.name}</p><p className="text-xs text-slate-500">{skill.category || (skill.approval_status ? `${skill.approval_status} catalog skill` : 'Catalog skill')}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">Requirement<select aria-label={`Requirement for ${skill.name}`} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={skill.is_required ? 'required' : 'preferred'} onChange={(event) => updateSelectedSkill(skill.skill_id, 'is_required', event.target.value === 'required')}><option value="required">Required</option><option value="preferred">Preferred</option></select></label>
              <label className="text-xs text-slate-600">Level<select aria-label={`Required level for ${skill.name}`} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={skill.required_level} onChange={(event) => updateSelectedSkill(skill.skill_id, 'required_level', event.target.value)}>{['beginner', 'intermediate', 'advanced', 'expert'].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
              <Button type="button" size="sm" variant="ghost" className="text-rose-700" onClick={() => setSelectedSkills((current) => current.filter((item) => item.skill_id !== skill.skill_id))}>Remove</Button>
            </div>
          </div>)}</div> : <p className="mt-3 text-sm text-amber-800">No skills are selected.</p>}
        </Section>

        <Section title="Related learning resources" icon={BookOpen}>
          <p className="mb-4 text-sm text-slate-600">Link existing resources from the learning catalog. These links describe suggested learning, not mandatory qualifications.</p>
          <label className="mb-3 block"><span className="sr-only">Search learning resources</span><SearchBar value={resourceSearch} onChange={setResourceSearch} placeholder="Search resource titles or providers" /></label>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {filteredResources.length ? filteredResources.map((resource) => <label key={resource.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 text-sm"><input type="checkbox" checked={selectedResourceIds.includes(resource.id)} onChange={(event) => setSelectedResourceIds((current) => event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id))} /><span><span className="block font-medium text-slate-800">{resource.title}</span><span className="text-xs text-slate-500">{[resource.provider, resource.resource_type].filter(Boolean).join(' · ') || 'Learning resource'}</span></span></label>) : <p className="p-3 text-sm text-slate-600">No learning resources match this search.</p>}
          </div>
        </Section>

        {formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{formError}</p> : null}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => navigate(editing ? `/admin/careers/${careerId}` : '/admin/careers')}>Cancel</Button><Button type="submit" disabled={saving}><CheckCircle2 size={16} />{saving ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}</Button></div>
      </form>
    </div>
  )
}

function CareerDetail({ id }) {
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionState, setActionState] = useState({ loading: false, error: '', message: '' })
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getCareer(id)
      .then((career) => { if (active) setResult({ key: requestKey, career, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, career: null, error: loadError.message || 'Unable to load this career.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Career details" description="Career definition and required skills." back="/admin/careers" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const career = currentResult.career
  const skills = career.career_skills || []
  const requiredSkills = skills.filter((item) => item.is_required !== false)
  const preferredSkills = skills.filter((item) => item.is_required === false)
  const referenceCount = Object.values(career.reference_counts || {}).reduce((total, count) => total + count, 0)
  const canDelete = career.status !== 'published' && referenceCount === 0
  const statusTone = { published: 'green', draft: 'amber', archived: 'slate' }
  const facts = [
    ['Entry level', career.entry_level],
    ['Growth path', career.growth_path],
    ['Legacy salary range (not source-reviewed)', career.salary_range],
    ['Legacy demand descriptor (not source-reviewed)', career.demand_level],
  ]

  const changeStatus = async (status) => {
    setActionState({ loading: true, error: '', message: '' })
    try {
      const updatedCareer = await adminService.updateCareerStatus(career.id, status)
      setResult({ key: requestKey, career: { ...career, ...updatedCareer }, error: '' })
      setActionState({ loading: false, error: '', message: `Career status changed to ${status}.` })
    } catch (statusError) {
      setActionState({ loading: false, error: statusError.message || 'Unable to update career status.', message: '' })
    }
  }

  const deleteCareer = async () => {
    if (!window.confirm('Delete this unreferenced career definition? This cannot be undone.')) return
    setActionState({ loading: true, error: '', message: '' })
    try {
      await adminService.deleteCareer(career.id)
      navigate('/admin/careers')
    } catch (deleteError) {
      setActionState({ loading: false, error: deleteError.message || 'Unable to delete career.', message: '' })
    }
  }

  return (
    <div className="space-y-6">
      <Header title="Career details" description="Career definition used in student exploration and recommendations." back="/admin/careers" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-sky-200">{career.sector}</p><h2 className="mt-2 text-3xl font-bold">{career.title}</h2><Badge tone={statusTone[career.status] || 'slate'}>{career.status || 'draft'}</Badge></div><Link to={`/admin/careers/${career.id}/edit`}><Button variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20"><FileText size={16} />Edit career</Button></Link></div>
          <p className="mt-5 max-w-4xl whitespace-pre-wrap text-sm leading-7 text-sky-50">{career.description}</p>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-7">{facts.map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value || 'Not specified'}</dd></div>)}</dl>
      </Card>
      {actionState.error ? <QueryError message={actionState.error} /> : null}
      {actionState.message ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{actionState.message}</p> : null}
      <Card className="flex flex-wrap items-center gap-2 p-4">
        {career.status !== 'published' ? <Button disabled={actionState.loading} onClick={() => void changeStatus('published')}><CheckCircle2 size={16} />Publish</Button> : null}
        {career.status !== 'archived' ? <Button variant="outline" disabled={actionState.loading} onClick={() => void changeStatus('archived')}><Archive size={16} />Archive</Button> : <Button variant="outline" disabled={actionState.loading} onClick={() => void changeStatus('draft')}>Return to draft</Button>}
        {canDelete ? <Button variant="danger" disabled={actionState.loading} onClick={() => void deleteCareer()}><X size={16} />Delete unreferenced career</Button> : <span className="text-sm text-slate-500">{referenceCount ? `Keep or archive: ${referenceCount} linked history records exist.` : 'Published careers must be archived before deletion.'}</span>}
      </Card>
      <Section title="Academic programmes and qualifications" icon={GraduationCap}>
        <div className="grid gap-6 sm:grid-cols-2">
          {[['Related academic programmes', career.academic_programmes], ['Required qualifications', career.required_qualifications]].map(([title, values]) => <div key={title}><h4 className="font-semibold text-slate-800">{title}</h4>{values?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not specified.</p>}</div>)}
        </div>
      </Section>
      <Section title="Responsibilities and career opportunities" icon={BriefcaseBusiness}>
        <div className="grid gap-6 sm:grid-cols-2">
          {[['Responsibilities', career.responsibilities], ['Typical roles and work settings', career.opportunity_areas]].map(([title, values]) => <div key={title}><h4 className="font-semibold text-slate-800">{title}</h4>{values?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not specified.</p>}</div>)}
        </div>
      </Section>
      <Section title="Required and preferred skills" icon={Layers3} action={<span className="text-sm text-slate-500">{requiredSkills.length} required · {preferredSkills.length} preferred</span>}>
        {skills.length ? <div className="divide-y divide-slate-100">{skills.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold text-slate-800">{item.skills?.name || 'Skill'}</p>{item.skills?.category ? <p className="mt-0.5 text-xs text-slate-500">{item.skills.category}</p> : null}</div><div className="flex gap-2"><Badge tone={item.is_required === false ? 'slate' : 'blue'}>{item.is_required === false ? 'Preferred' : 'Required'}</Badge><Badge tone="blue">{item.required_level || 'Level not set'}</Badge><Badge tone="slate">Importance {item.importance ?? '—'}</Badge></div></div>)}</div> : <EmptyState>Skills have not been linked to this career yet.</EmptyState>}
      </Section>
      <Section title="Related learning resources" icon={BookOpen}>
        {career.career_learning_resources?.length ? <div className="space-y-3">{career.career_learning_resources.map(({ id: linkId, learning_resources: resource }) => <div key={linkId} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-slate-800">{resource?.title || 'Learning resource'}</p><p className="text-sm text-slate-500">{[resource?.provider, resource?.resource_type].filter(Boolean).join(' · ')}</p>{resource?.url?.startsWith('https://') ? <a href={resource.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-sky-700">Open resource</a> : null}</div>)}</div> : <EmptyState>No learning resources are linked to this career.</EmptyState>}
      </Section>
      <Section title="Employment outlook" icon={BarChart3}>
        {career.outlook_verified_at ? <div className="space-y-2"><p className="text-sm leading-6 text-slate-700">{career.outlook_summary}</p><p className="text-xs text-slate-500">Source reviewed by an administrator. This is not a national or official statistic.</p><p className="text-sm text-slate-600">{career.outlook_source}{career.outlook_source_url?.startsWith('https://') ? <> · <a href={career.outlook_source_url} target="_blank" rel="noreferrer" className="font-medium text-sky-700">View source</a></> : null}</p></div> : <p className="text-sm text-slate-600">No source-reviewed outlook is available. Unreviewed legacy demand and salary fields are not shown to students.</p>}
      </Section>
      <p className="text-xs text-slate-500">{referenceCount} linked history records. Hard deletion is allowed only for a non-published career with no links; archiving preserves history.</p>
    </div>
  )
}

function AssessmentsAdminView({ id }) {
  if (id) return <AssessmentDetail id={id} />
  return <AssessmentDirectory />
}

function AssessmentDirectory() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statusChange, setStatusChange] = useState({ id: '', error: '' })
  const requestKey = `${search.trim()}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getAssessments(search.trim())
      .then((items) => { if (active) setResult({ key: requestKey, items, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], error: loadError.message || 'Unable to load assessments.' }) })
    return () => { active = false }
  }, [search, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const allItems = currentResult?.items || []
  const items = allItems.filter((item) => (!status || item.status === status) && (!type || item.assessment_type === type))
  const duplicatePairs = findPotentialAssessmentDuplicates(allItems)
  const loading = !currentResult
  const statusCounts = allItems.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1
    return counts
  }, {})
  const statusTone = { published: 'green', draft: 'amber', archived: 'slate' }

  const updateStatus = async (assessment, nextStatus) => {
    setStatusChange({ id: assessment.id, error: '' })
    try {
      await adminService.updateAssessmentStatus(assessment.id, nextStatus)
      setResult((current) => current?.key === requestKey
        ? { ...current, items: current.items.map((item) => item.id === assessment.id ? { ...item, status: nextStatus } : item) }
        : current)
      setStatusChange({ id: '', error: '' })
    } catch (updateError) {
      setStatusChange({ id: '', error: updateError.message || 'Unable to update assessment status.' })
    }
  }

  return (
    <div className="space-y-6">
      <Header title={CONFIG.assessments[0]} description="Review assessment content, participation, and publication status. Draft and archived assessments remain unavailable to students." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-slate-500">Total assessments</p><p className="mt-2 text-3xl font-bold text-slate-900">{loading ? '—' : allItems.length}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-500">Published</p><p className="mt-2 text-3xl font-bold text-emerald-700">{loading ? '—' : statusCounts.published || 0}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-500">Drafts</p><p className="mt-2 text-3xl font-bold text-amber-700">{loading ? '—' : statusCounts.draft || 0}</p></Card>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search assessments</span><SearchBar value={search} onChange={setSearch} placeholder="Search assessment titles" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span><select className={INPUT} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'published', 'archived'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span><select className={INPUT} value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{['skill', 'career', 'job', 'practice'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          {(search || status || type) ? <Button variant="ghost" onClick={() => { setSearch(''); setStatus(''); setType('') }}>Clear filters</Button> : null}
        </div>
      </Card>
      {statusChange.error ? <QueryError message={statusChange.error} /> : null}
      {!loading && duplicatePairs.length ? <Section title="Possible duplicate assessments" icon={AlertTriangle}>
        <p className="mb-4 text-sm leading-6 text-slate-600">These records share a job target and similar title or question content. Check each assignment and result history. Archiving preserves those records and links; merging is not offered for assessments with history.</p>
        <div className="space-y-3">{duplicatePairs.map(({ left, right, comparison }) => (
          <div key={`${left.id}:${right.id}`} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">{[left, right].map((assessment) => <div key={assessment.id}>
              <p className="font-semibold text-slate-900">{assessment.title}</p>
              <p className="mt-1 text-sm text-slate-600">{assessment.status} · {assessment.assessment_questions?.length || 0} questions · {assessment.assessment_results?.length || 0} results · {assessment.job_assessments?.length || 0} job assignments</p>
              <Link to={`/admin/assessments/${assessment.id}`} className="mt-2 inline-flex items-center text-sm font-semibold text-sky-700">Review assessment<ArrowRight size={14} className="ml-1" /></Link>
            </div>)}</div>
            <p className="mt-3 text-xs text-slate-600">{comparison.sameQuestionSet ? 'Question prompts, options, and available metadata match; answers are not included in this review.' : `Question text similarity ${Math.round(comparison.questionSimilarity * 100)}%.`} Review the status controls in the library before archiving either record.</p>
          </div>
        ))}</div>
      </Section> : null}
      <Section title="Assessment library" icon={ListChecks} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'assessment' : 'assessments'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading assessments" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-sm text-slate-500">{item.skills?.name || item.careers?.title || `${item.assessment_type} assessment`}</p></div><Badge tone={statusTone[item.status] || 'slate'}>{item.status || 'Unknown status'}</Badge></div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.description || 'No description provided.'}</p>
                <div className="mt-4 flex flex-wrap gap-2"><Badge tone="blue">{item.assessment_type || 'Unspecified type'}</Badge>{item.difficulty ? <Badge tone="slate">{item.difficulty}</Badge> : null}{item.duration_minutes ? <Badge tone="slate">{item.duration_minutes} min</Badge> : null}</div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{item.assessment_questions?.length || 0} questions</span><span>{item.assessment_results?.length || 0} attempts</span>{item.passing_score != null ? <span>Pass: {item.passing_score}%</span> : null}</div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <Link to={`/admin/assessments/${item.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Review details<ArrowRight size={15} className="ml-1 inline" /></Link>
                  <label className="flex items-center gap-2"><span className="sr-only">Change status for {item.title}</span><select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700" value={item.status} disabled={statusChange.id === item.id} onChange={(event) => updateStatus(item, event.target.value)}>{['draft', 'published', 'archived'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>{statusChange.id === item.id ? <span className="text-xs text-slate-500">Saving…</span> : null}</label>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>{search || status || type ? 'No assessments match the current filters.' : 'No assessments have been created yet.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}

function AssessmentDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getAssessment(id)
      .then((assessment) => { if (active) setResult({ key: requestKey, assessment, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, assessment: null, error: loadError.message || 'Unable to load this assessment.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Assessment details" description="Assessment setup and content overview." back="/admin/assessments" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const assessment = currentResult.assessment
  const statusTone = { published: 'green', draft: 'amber', archived: 'slate' }
  const updateStatus = async (nextStatus) => {
    setSavingStatus(true)
    setStatusError('')
    try {
      await adminService.updateAssessmentStatus(assessment.id, nextStatus)
      setResult({ key: requestKey, assessment: { ...assessment, status: nextStatus }, error: '' })
    } catch (updateError) {
      setStatusError(updateError.message || 'Unable to update assessment status.')
    } finally {
      setSavingStatus(false)
    }
  }
  const typeTarget = assessment.skills?.name || assessment.careers?.title || 'Not linked'

  return (
    <div className="space-y-6">
      <Header title="Assessment details" description="Review setup and participation. Correct answers are not displayed in the administration overview." back="/admin/assessments" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-wide text-sky-200">{assessment.assessment_type} assessment</p><h2 className="mt-2 text-2xl font-bold">{assessment.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100">{assessment.description}</p></div><Badge tone={statusTone[assessment.status] || 'slate'}>{assessment.status || 'Unknown status'}</Badge></div>
          <label className="mt-5 inline-flex flex-col gap-1"><span className="text-xs font-medium text-sky-100">Change availability</span><select className="rounded-lg border border-white/30 bg-white px-3 py-2 text-sm text-slate-800" value={assessment.status} disabled={savingStatus} onChange={(event) => updateStatus(event.target.value)}>{['draft', 'published', 'archived'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-7">{[['Related skill/career', typeTarget], ['Difficulty', assessment.difficulty], ['Duration', assessment.duration_minutes ? `${assessment.duration_minutes} minutes` : null], ['Passing score', assessment.passing_score == null ? null : `${assessment.passing_score}%`]].map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value || 'Not specified'}</dd></div>)}</dl>
      </Card>
      {statusError ? <QueryError message={statusError} /> : null}
      <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-sm text-slate-500">Questions</p><p className="mt-2 text-3xl font-bold text-slate-900">{assessment.assessment_questions?.length || 0}</p></Card><Card className="p-5"><p className="text-sm text-slate-500">Recorded attempts</p><p className="mt-2 text-3xl font-bold text-slate-900">{assessment.assessment_results?.length || 0}</p></Card><Card className="p-5"><p className="text-sm text-slate-500">Created</p><p className="mt-2 text-lg font-semibold text-slate-900">{assessment.created_at ? new Date(assessment.created_at).toLocaleDateString() : 'Not available'}</p></Card></div>
      <Section title="Question overview" icon={FileText}>
        {assessment.assessment_questions?.length ? <div className="divide-y divide-slate-100">{assessment.assessment_questions.map((question, index) => <div key={question.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"><div><p className="text-sm font-medium text-slate-800"><span className="mr-2 text-slate-400">{index + 1}.</span>{question.question}</p><p className="mt-1 text-xs capitalize text-slate-500">{String(question.question_type || 'question').replaceAll('_', ' ')}{question.difficulty ? ` · ${question.difficulty}` : ''}</p></div><Badge tone="slate">{question.points} {question.points === 1 ? 'point' : 'points'}</Badge></div>)}</div> : <EmptyState>Add questions before publishing this assessment. Only assessments with at least one question may be published.</EmptyState>}
      </Section>
    </div>
  )
}

function ApplicationsAdminView({ id }) {
  if (id) return <ApplicationDetail id={id} />
  return <ApplicationsDirectory />
}

const APPLICATION_STATUS_TONES = {
  applied: 'blue',
  under_review: 'blue',
  shortlisted: 'green',
  assessment: 'amber',
  interview: 'amber',
  offer: 'green',
  accepted: 'green',
  rejected: 'red',
  withdrawn: 'slate',
  offer_declined: 'slate',
  expired: 'slate',
  position_closed: 'slate',
}

function ApplicationsDirectory() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 20
  const requestKey = JSON.stringify({ search: search.trim(), status, page, refreshKey })

  useEffect(() => {
    let active = true
    adminService.getApplications({ search: search.trim(), status, page, pageSize })
      .then((data) => { if (active) setResult({ key: requestKey, ...data, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], total: 0, error: loadError.message || 'Unable to load applications.' }) })
    return () => { active = false }
  }, [search, status, page, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const total = currentResult?.total || 0
  const loading = !currentResult
  const pageCount = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <Header title={CONFIG.applications[0]} description="Monitor application progress across platform opportunities. Application records are read-only in this view." />
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search applications</span><SearchBar value={search} onChange={(value) => { setSearch(value); setPage(0) }} placeholder="Applicant name, email, or job title" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Filter by status</span><select className={INPUT} value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="">All statuses</option>{APPLICATION_STATUSES.map((item) => <option key={item} value={item}>{APPLICATION_STATUS_LABELS[item] || item.replaceAll('_', ' ')}</option>)}</select></label>
          {(search || status) ? <Button variant="ghost" onClick={() => { setSearch(''); setStatus(''); setPage(0) }}>Clear filters</Button> : null}
        </div>
      </Card>
      <Section title="Application directory" icon={Target} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${total} ${total === 1 ? 'application' : 'applications'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading applications" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((application) => (
                <Card key={application.id} className="p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="truncate font-semibold text-slate-900">{application.applicant?.full_name || 'Applicant profile unavailable'}</h3><p className="mt-1 truncate text-sm text-slate-500">{application.applicant?.email || 'No email available'}</p></div>
                    <Badge tone={APPLICATION_STATUS_TONES[application.status] || 'slate'}>{APPLICATION_STATUS_LABELS[application.status] || application.status || 'Unknown'}</Badge>
                  </div>
                  <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Position</p><p className="mt-1 font-medium text-slate-800">{application.jobs?.title || 'Job listing unavailable'}</p><p className="mt-1 text-sm text-slate-500">{application.jobs?.employer_profiles?.company_name || 'Employer unavailable'}{application.jobs?.location ? ` · ${application.jobs.location}` : ''}</p></div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">Applied {application.applied_at ? new Date(application.applied_at).toLocaleDateString() : 'date unavailable'}</span><Link to={`/admin/applications/${application.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View timeline<ArrowRight size={15} className="ml-1 inline" /><span className="sr-only"> for {application.applicant?.full_name || 'applicant'}</span></Link></div>
                </Card>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500">Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</p>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></div>
            </div>
          </>
        ) : (
          <EmptyState>{search || status ? 'No applications match the current search and status filter.' : 'No applications have been submitted yet.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}

function ApplicationDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getApplication(id)
      .then((application) => { if (active) setResult({ key: requestKey, application, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, application: null, error: loadError.message || 'Unable to load this application.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Application details" description="Application status and event history." back="/admin/applications" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const application = currentResult.application
  const events = [...(application.application_events || [])].sort((left, right) => new Date(right.event_date || right.created_at).getTime() - new Date(left.event_date || left.created_at).getTime())

  return (
    <div className="space-y-6">
      <Header title="Application details" description="Read-only application information and recorded status history." back="/admin/applications" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-sky-200">{application.jobs?.employer_profiles?.company_name || 'Employer unavailable'}</p><h2 className="mt-1 text-2xl font-bold">{application.jobs?.title || 'Job listing unavailable'}</h2><p className="mt-2 text-sm text-sky-100">{application.jobs?.location || 'Location not specified'}</p></div><Badge tone={APPLICATION_STATUS_TONES[application.status] || 'slate'}>{APPLICATION_STATUS_LABELS[application.status] || application.status || 'Unknown'}</Badge></div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <div className="flex items-start gap-3"><Avatar src={application.applicant?.avatar_url} name={application.applicant?.full_name || 'Applicant'} size="md" /><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Applicant</p><p className="mt-1 font-semibold text-slate-800">{application.applicant?.full_name || 'Profile unavailable'}</p><p className="mt-0.5 break-all text-sm text-slate-500">{application.applicant?.email || 'Email unavailable'}</p></div></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Submitted</p><p className="mt-1 text-sm font-semibold text-slate-800">{application.applied_at ? new Date(application.applied_at).toLocaleString() : 'Date unavailable'}</p><p className="mt-2 text-xs text-slate-500">Last updated {application.updated_at ? new Date(application.updated_at).toLocaleString() : 'not available'}</p></div>
        </div>
      </Card>
      {application.cover_letter ? <Section title="Cover letter" icon={FileText}><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{application.cover_letter}</p></Section> : null}
      <Section title="Application timeline" icon={Activity}>
        {events.length ? <ol className="space-y-4">{events.map((event) => <li key={event.id} className="relative flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600 ring-4 ring-sky-50" /><div className="min-w-0 flex-1 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold text-slate-800">{event.title || event.event_type || 'Application update'}</p><time className="text-xs text-slate-500">{event.event_date || event.created_at ? new Date(event.event_date || event.created_at).toLocaleString() : ''}</time></div>{event.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p> : null}</div></li>)}</ol> : <EmptyState>No status events have been recorded for this application.</EmptyState>}
      </Section>
      <p className="text-xs leading-5 text-slate-500">CV files and private assessment results are not displayed in the platform-wide admin view.</p>
    </div>
  )
}

function CareerOpportunityAdminView() {
  const [skills, setSkills] = useState([])
  const [careers, setCareers] = useState([])
  const [optionsError, setOptionsError] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategory, setSkillCategory] = useState('')
  const [linkedSkillDetails, setLinkedSkillDetails] = useState([])
  const [linkedCareerDetails, setLinkedCareerDetails] = useState([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [careerFilter, setCareerFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(EMPTY_CAREER_OPPORTUNITY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState(null)
  const pageSize = 12
  const requestKey = JSON.stringify({ search: search.trim(), type, status, skillFilter, careerFilter, page, refreshKey })

  useEffect(() => {
    let active = true
    Promise.all([skillService.listSkills(), adminService.getPublishedCareersForOpportunities()])
      .then(([skillItems, careerItems]) => {
        if (!active) return
        setSkills(skillItems)
        setCareers(careerItems)
        setOptionsError('')
      })
      .catch((loadError) => {
        if (active) setOptionsError(loadError.message || 'Unable to load approved skills and published careers.')
      })
    return () => { active = false }
  }, [refreshKey])

  useEffect(() => {
    let active = true
    adminService.getCareerOpportunities({
      search: search.trim(),
      type,
      status,
      skillId: skillFilter,
      careerId: careerFilter,
      page,
      pageSize,
    })
      .then((data) => { if (active) setResult({ key: requestKey, ...data, error: '' }) })
      .catch((loadError) => {
        if (active) setResult({ key: requestKey, items: [], total: 0, error: loadError.message || 'Unable to load training and scholarship opportunities.' })
      })
    return () => { active = false }
  }, [search, type, status, skillFilter, careerFilter, page, pageSize, requestKey])

  const resetForm = () => {
    setEditingId('')
    setForm(EMPTY_CAREER_OPPORTUNITY)
    setLinkedSkillDetails([])
    setLinkedCareerDetails([])
    setSkillSearch('')
    setSkillCategory('')
    setError('')
    setMessage('')
  }
  const edit = (item) => {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      description: item.description || '',
      opportunity_type: item.opportunity_type,
      provider: item.provider || '',
      application_url: item.application_url || '',
      location: item.location || '',
      is_remote: item.is_remote,
      delivery_mode: item.delivery_mode || '',
      industries: (item.industries || []).join(', '),
      eligible_programmes: (item.eligible_programmes || []).join(', '),
      academic_qualifications: (item.academic_qualifications || []).join('\n'),
      eligibility_requirements: (item.eligibility_requirements || []).join('\n'),
      eligible_candidate_types: item.eligible_candidate_types || [],
      min_study_year: item.min_study_year ?? '',
      max_study_year: item.max_study_year ?? '',
      application_deadline: item.application_deadline || '',
      status: item.status,
      skill_ids: (item.career_opportunity_skills || []).map((skill) => skill.skill_id),
      career_ids: (item.career_opportunity_careers || []).map((career) => career.career_id),
    })
    setLinkedSkillDetails((item.career_opportunity_skills || []).map((entry) => entry.skills).filter(Boolean))
    setLinkedCareerDetails((item.career_opportunity_careers || []).map((entry) => entry.careers).filter(Boolean))
    setError('')
    setMessage('')
  }
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const toggle = (field, value) => setForm((current) => ({
    ...current,
    [field]: current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value],
  }))
  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await adminService.saveCareerOpportunity({ ...form, ...(editingId ? { id: editingId } : {}) })
      resetForm()
      setMessage('Opportunity saved. Published listings are matched against student profiles and preferences.')
      setRefreshKey((key) => key + 1)
      setPage(1)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save this opportunity.')
    } finally {
      setSaving(false)
    }
  }

  const currentResult = result?.key === requestKey ? result : null
  const items = currentResult?.items || []
  const total = currentResult?.total || 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const loading = !currentResult
  const skillCategories = [...new Set([...SKILL_CATEGORIES, ...skills.map((skill) => skill.category).filter(Boolean)])]
  const normalizedSkillSearch = skillSearch.trim().toLowerCase()
  const visibleSkills = skills.filter((skill) =>
    (!skillCategory || skill.category === skillCategory)
    && (!normalizedSkillSearch || `${skill.name} ${skill.category || ''}`.toLowerCase().includes(normalizedSkillSearch)),
  )
  const skillDetails = new Map([...linkedSkillDetails, ...skills].map((skill) => [skill.id, skill]))
  const careerDetails = new Map([...linkedCareerDetails, ...careers].map((career) => [career.id, career]))
  const selectedSkills = form.skill_ids.map((id) => skillDetails.get(id) || { id, name: 'Unavailable skill' })
  const selectedCareers = form.career_ids.map((id) => careerDetails.get(id) || { id, title: 'Unavailable career' })

  return <div className="space-y-6">
    <Header title={CONFIG.opportunities[0]} description={CONFIG.opportunities[1]} />
    <Card className="p-5 sm:p-6">
      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit opportunity' : 'Add an opportunity'}</h2><p className="mt-1 text-sm text-slate-600">Add real listings only. Published listings need a provider and valid HTTPS application link. Email alerts are not enabled.</p></div>{editingId ? <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button> : null}</div>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
        {optionsError ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{optionsError}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Title<input className={`${INPUT} mt-1`} required maxLength={180} value={form.title} onChange={update('title')} /></label>
          <label className="text-sm font-medium text-slate-700">Type<select className={`${INPUT} mt-1`} value={form.opportunity_type} onChange={update('opportunity_type')}><option value="training">Training programme</option><option value="scholarship">Scholarship</option></select></label>
          <label className="text-sm font-medium text-slate-700">Provider<input className={`${INPUT} mt-1`} maxLength={180} value={form.provider} onChange={update('provider')} /></label>
          <label className="text-sm font-medium text-slate-700">Application URL (HTTPS)<input className={`${INPUT} mt-1`} type="url" value={form.application_url} onChange={update('application_url')} placeholder="https://…" /></label>
          <label className="text-sm font-medium text-slate-700">Location<input className={`${INPUT} mt-1`} value={form.location} onChange={update('location')} placeholder="Lilongwe or Malawi-wide" /></label>
          <label className="text-sm font-medium text-slate-700">Delivery mode<select className={`${INPUT} mt-1`} value={form.delivery_mode} onChange={update('delivery_mode')}><option value="">Not specified</option><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">Hybrid</option></select></label>
          <label className="text-sm font-medium text-slate-700">Deadline<input className={`${INPUT} mt-1`} type="date" value={form.application_deadline} onChange={update('application_deadline')} /></label>
          <label className="text-sm font-medium text-slate-700">Industries<input className={`${INPUT} mt-1`} value={form.industries} onChange={update('industries')} placeholder="Comma separated" /></label>
          <label className="text-sm font-medium text-slate-700">Eligible programmes<input className={`${INPUT} mt-1`} value={form.eligible_programmes} onChange={update('eligible_programmes')} placeholder="Comma separated" /></label>
          <label className="text-sm font-medium text-slate-700">Minimum study year<input className={`${INPUT} mt-1`} type="number" min="1" max="20" value={form.min_study_year} onChange={update('min_study_year')} /></label>
          <label className="text-sm font-medium text-slate-700">Maximum study year<input className={`${INPUT} mt-1`} type="number" min="1" max="20" value={form.max_study_year} onChange={update('max_study_year')} /></label>
          <label className="text-sm font-medium text-slate-700">Status<select className={`${INPUT} mt-1`} value={form.status} onChange={update('status')}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option><option value="archived">Archived</option></select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_remote} onChange={(event) => setForm((current) => ({ ...current, is_remote: event.target.checked }))} />Remote opportunity</label>
        </div>
        <label className="block text-sm font-medium text-slate-700">Description<textarea className={`${INPUT} mt-1 min-h-28`} required maxLength={10000} value={form.description} onChange={update('description')} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Academic qualifications<textarea className={`${INPUT} mt-1 min-h-24`} value={form.academic_qualifications} onChange={update('academic_qualifications')} placeholder="One qualification per line" /></label>
          <label className="text-sm font-medium text-slate-700">Eligibility requirements<textarea className={`${INPUT} mt-1 min-h-24`} value={form.eligibility_requirements} onChange={update('eligibility_requirements')} placeholder="One requirement per line" /></label>
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Eligible candidates</legend><div className="flex flex-wrap gap-4">{['student', 'graduate'].map((type) => <label key={type} className="flex items-center gap-2 text-sm capitalize text-slate-700"><input type="checkbox" checked={form.eligible_candidate_types.includes(type)} onChange={() => toggle('eligible_candidate_types', type)} />{type}</label>)}</div></fieldset>
        <fieldset className="space-y-3"><legend className="text-sm font-medium text-slate-700">Required skills</legend><p className="text-xs text-slate-500">Only active, administrator-approved skills are available to add. Remove unavailable legacy skills before publishing.</p>{selectedSkills.length ? <div className="flex flex-wrap gap-2">{selectedSkills.map((skill) => <span key={skill.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">{skill.name}<button type="button" aria-label={`Remove ${skill.name}`} onClick={() => toggle('skill_ids', skill.id)} className="rounded-full p-0.5 hover:bg-sky-100"><X size={13} /></button></span>)}</div> : <p className="text-sm text-slate-500">No required skills selected.</p>}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="text-xs font-medium text-slate-600">Search skills<SearchBar value={skillSearch} onChange={setSkillSearch} placeholder="Search approved skills" /></label><label className="text-xs font-medium text-slate-600">Skill category<select className={`${INPUT} mt-1`} value={skillCategory} onChange={(event) => setSkillCategory(event.target.value)}><option value="">All categories</option>{skillCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div>
          {visibleSkills.length ? <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">{visibleSkills.map((skill) => <label key={skill.id} className="flex items-start gap-2 text-sm text-slate-700"><input className="mt-1" type="checkbox" checked={form.skill_ids.includes(skill.id)} onChange={() => toggle('skill_ids', skill.id)} /><span>{skill.name}<span className="block text-xs text-slate-500">{skill.category}</span></span></label>)}</div> : <p className="text-sm text-slate-500">{skills.length ? 'No approved skills match these filters.' : 'No approved skills are available to associate.'}</p>}</fieldset>
        <fieldset className="space-y-3"><legend className="text-sm font-medium text-slate-700">Related published careers</legend>{selectedCareers.length ? <div className="flex flex-wrap gap-2">{selectedCareers.map((career) => <span key={career.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800">{career.title}<button type="button" aria-label={`Remove ${career.title}`} onClick={() => toggle('career_ids', career.id)} className="rounded-full p-0.5 hover:bg-violet-100"><X size={13} /></button></span>)}</div> : <p className="text-sm text-slate-500">No related careers selected.</p>}
          {careers.length ? <div className="grid max-h-40 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">{careers.map((career) => <label key={career.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.career_ids.includes(career.id)} onChange={() => toggle('career_ids', career.id)} />{career.title}</label>)}</div> : <p className="text-sm text-slate-500">No published careers are available to associate.</p>}</fieldset>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add opportunity'}</Button>
      </form>
    </Card>
    <Card className="p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block text-sm font-medium text-slate-700">Search listings<SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search titles" /></label>
      <label className="block text-sm font-medium text-slate-700">Type<select className={`${INPUT} mt-1`} value={type} onChange={(event) => { setType(event.target.value); setPage(1) }}><option value="">All types</option><option value="training">Training</option><option value="scholarship">Scholarship</option></select></label>
      <label className="block text-sm font-medium text-slate-700">Status<select className={`${INPUT} mt-1`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['draft', 'published', 'closed', 'archived'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label className="block text-sm font-medium text-slate-700">Required skill<select className={`${INPUT} mt-1`} value={skillFilter} onChange={(event) => { setSkillFilter(event.target.value); setPage(1) }}><option value="">All skills</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      <label className="block text-sm font-medium text-slate-700">Related career<select className={`${INPUT} mt-1`} value={careerFilter} onChange={(event) => { setCareerFilter(event.target.value); setPage(1) }}><option value="">All careers</option>{careers.map((career) => <option key={career.id} value={career.id}>{career.title}</option>)}</select></label>
      {(search || type || status || skillFilter || careerFilter) ? <div className="flex items-end"><Button variant="ghost" onClick={() => { setSearch(''); setType(''); setStatus(''); setSkillFilter(''); setCareerFilter(''); setPage(1) }}>Clear filters</Button></div> : null}
    </div></Card>
    <Section title="Training programmes and scholarships" icon={BookOpen} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${total} records`}</span>}>
      {currentResult?.error ? <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div> : loading ? <p role="status" className="text-sm text-slate-500">Loading opportunity listings…</p> : items.length ? <div className="space-y-3">{items.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><Badge tone={item.status === 'published' ? 'green' : 'slate'}>{item.status}</Badge><Badge tone="blue">{item.opportunity_type}</Badge></div><p className="mt-1 text-sm text-slate-600">{item.provider || 'Provider not recorded'}{item.location ? ` · ${item.location}` : ''}{item.delivery_mode ? ` · ${item.delivery_mode.replace('_', ' ')}` : ''}</p><p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description}</p><div className="mt-2 flex flex-wrap gap-1">{(item.career_opportunity_skills || []).map((entry) => entry.skills?.name).filter(Boolean).map((name) => <Badge key={name} tone="slate">{name}</Badge>)}{(item.career_opportunity_careers || []).map((entry) => entry.careers?.title).filter(Boolean).map((title) => <Badge key={title} tone="blue">{title}</Badge>)}</div></div><Button variant="outline" size="sm" onClick={() => edit(item)}>Edit</Button></div>)}</div> : <EmptyState>No training programmes or scholarships match the current filters. Add real listings here; the system does not fabricate opportunities.</EmptyState>}
      {!loading && !currentResult?.error && total > pageSize ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Page {page} of {pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={15} />Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ArrowRight size={15} /></Button></div></div> : null}
    </Section>
  </div>
}

const LEARNING_RESOURCE_CATEGORIES = [...SKILL_CATEGORIES, 'Academic and Study Skills']
const EMPTY_LEARNING_FORM = {
  title: '',
  description: '',
  resource_type: 'course',
  url: '',
  provider: '',
  category: '',
  skill_ids: [],
  career_ids: [],
  difficulty: '',
  duration_minutes: '',
  free: true,
  status: 'draft',
}

function LearningAdminView({ id, creating = false, editing = false }) {
  if (creating) return <LearningResourceForm />
  if (id) return editing ? <LearningResourceForm key={id} resourceId={id} /> : <LearningResourceDetail id={id} />
  return <LearningResourceDirectory />
}

function LearningResourceDirectory() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [skillId, setSkillId] = useState('')
  const [careerId, setCareerId] = useState('')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ skills: [], careers: [], error: '' })
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 12
  const requestKey = JSON.stringify({ search: search.trim(), type, status, category, difficulty, skillId, careerId, page, refreshKey })

  useEffect(() => {
    let active = true
    adminService.getLearningResources({ search: search.trim(), type, status, category, difficulty, skillId, careerId, page, pageSize })
      .then((data) => { if (active) setResult({ key: requestKey, ...data, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], total: 0, error: loadError.message || 'Unable to load learning resources.' }) })
    return () => { active = false }
  }, [search, type, status, category, difficulty, skillId, careerId, page, pageSize, requestKey])

  useEffect(() => {
    let active = true
    adminService.getLearningResourceFilterOptions()
      .then(({ skills, careers }) => { if (active) setFilters({ skills, careers, error: '' }) })
      .catch((loadError) => { if (active) setFilters((current) => ({ ...current, error: loadError.message || 'Unable to load resource filters.' })) })
    return () => { active = false }
  }, [refreshKey])

  const currentResult = result?.key === requestKey ? result : null
  const allItems = currentResult?.items || []
  const items = allItems
  const total = currentResult?.total || 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const loading = !currentResult

  return (
    <div className="space-y-6">
      <Header title={CONFIG.learning[0]} description={CONFIG.learning[1]} />
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-sky-900 to-sky-700 p-6 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">Learning library</p><h2 className="mt-2 text-2xl font-bold">Curate resources for skill development</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-sky-100">Add and maintain learning materials, associate them with skills, and help learners find the right next step.</p></div>
        <Link to="/admin/learning/create"><Button variant="outline" className="shrink-0 border-white/40 bg-white/10 text-white hover:bg-white/20"><Plus size={16} />Add resource</Button></Link>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search resources</span><SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search resource titles" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Publication status</span><select className={INPUT} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{LEARNING_RESOURCE_STATUSES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Resource type</span><select className={INPUT} value={type} onChange={(event) => { setType(event.target.value); setPage(1) }}><option value="">All types</option>{LEARNING_RESOURCE_TYPES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Category</span><select className={INPUT} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }}><option value="">All categories</option>{LEARNING_RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Difficulty</span><select className={INPUT} value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1) }}><option value="">All levels</option>{LEARNING_RESOURCE_DIFFICULTIES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Related skill</span><select className={INPUT} value={skillId} onChange={(event) => { setSkillId(event.target.value); setPage(1) }}><option value="">All skills</option>{filters.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Related career</span><select className={INPUT} value={careerId} onChange={(event) => { setCareerId(event.target.value); setPage(1) }}><option value="">All careers</option>{filters.careers.map((career) => <option key={career.id} value={career.id}>{career.title}</option>)}</select></label>
          {(search || status || type || category || difficulty || skillId || careerId) ? <div className="flex items-end"><Button variant="ghost" onClick={() => { setSearch(''); setStatus(''); setType(''); setCategory(''); setDifficulty(''); setSkillId(''); setCareerId(''); setPage(1) }}>Clear filters</Button></div> : null}
        </div>
        {filters.error ? <p role="status" className="mt-3 text-sm text-amber-800">{filters.error}</p> : null}
      </Card>
      <Section title="Resources" icon={BookOpen} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${total} ${total === 1 ? 'resource' : 'resources'}`}</span>}>
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading learning resources" className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((resource) => (
              <Card key={resource.id} className="flex flex-col p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-sky-50 p-2 text-sky-700"><BookOpen size={19} /></span><div className="flex gap-2"><Badge tone={resource.status === 'published' ? 'green' : resource.status === 'archived' ? 'slate' : 'amber'}>{resource.status || 'draft'}</Badge><Badge tone="blue">{resource.resource_type}</Badge></div></div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{resource.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{resource.description || 'No description provided.'}</p>
                <div className="mt-4 flex flex-wrap gap-2"><Badge tone="slate">{resource.category || 'No category'}</Badge>{resource.difficulty ? <Badge tone="slate">{resource.difficulty}</Badge> : null}{resource.duration_minutes ? <Badge tone="slate">{resource.duration_minutes} min</Badge> : null}<Badge tone={resource.free ? 'green' : 'amber'}>{resource.free ? 'Free' : 'Paid'}</Badge></div>
                <div className="mt-3 text-sm text-slate-500">{(resource.learning_resource_skills || []).map((item) => item.skills?.name).filter(Boolean).join(', ') || resource.skills?.name || 'No skill linked'}{resource.provider ? ` · ${resource.provider}` : ''}</div>
                {resource.learning_resource_careers?.length ? <p className="mt-2 text-xs text-slate-500">Careers: {resource.learning_resource_careers.map((item) => item.careers?.title).filter(Boolean).join(', ')}</p> : null}
                <div className="mt-auto flex justify-end border-t border-slate-100 pt-4">
                  <Link to={`/admin/learning/${resource.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">View resource<ArrowRight size={15} className="ml-1 inline" /></Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState to="/admin/learning/create" action="Add a resource">{search || status || type || category || difficulty || skillId || careerId ? 'No resources match the current filters.' : 'No learning resources have been added yet.'}</EmptyState>
        )}
        {!loading && total > pageSize ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">Page {page} of {pageCount}</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={15} />Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ArrowRight size={15} /></Button></div>
        </div> : null}
      </Section>
    </div>
  )
}

function LearningResourceForm({ resourceId }) {
  const navigate = useNavigate()
  const editing = Boolean(resourceId)
  const [form, setForm] = useState(EMPTY_LEARNING_FORM)
  const [skills, setSkills] = useState([])
  const [careers, setCareers] = useState([])
  const [unavailableSkills, setUnavailableSkills] = useState({})
  const [unavailableCareers, setUnavailableCareers] = useState({})
  const [skillSearch, setSkillSearch] = useState('')
  const [careerSearch, setCareerSearch] = useState('')
  const [loadState, setLoadState] = useState({ key: '', loading: true, error: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const requestKey = resourceId || 'new-learning-resource'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [skillItems, careerItems, resource] = await Promise.all([
          skillService.listSkills(),
          adminService.getPublishedCareersForResources(),
          resourceId ? adminService.getLearningResource(resourceId) : Promise.resolve(null),
        ])
        if (!active) return
        setSkills(skillItems)
        setCareers(careerItems)
        if (resource) {
          setUnavailableSkills(Object.fromEntries((resource.learning_resource_skills || [])
            .filter((item) => !skillItems.some((skill) => skill.id === item.skill_id))
            .map((item) => [item.skill_id, item.skills?.name || 'Previously linked skill'])))
          setUnavailableCareers(Object.fromEntries((resource.learning_resource_careers || [])
            .filter((item) => !careerItems.some((career) => career.id === item.career_id))
            .map((item) => [item.career_id, item.careers?.title || 'Previously linked career'])))
          setForm({
            title: resource.title || '',
            description: resource.description || '',
            resource_type: resource.resource_type || 'course',
            url: resource.url || '',
            provider: resource.provider || '',
            category: resource.category || '',
            skill_ids: resource.learning_resource_skills?.map((item) => item.skill_id) || (resource.skill_id ? [resource.skill_id] : []),
            career_ids: resource.learning_resource_careers?.map((item) => item.career_id) || [],
            difficulty: resource.difficulty || '',
            duration_minutes: resource.duration_minutes ?? '',
            free: resource.free ?? true,
            status: resource.status || 'draft',
          })
        } else {
          setUnavailableSkills({})
          setUnavailableCareers({})
          setForm(EMPTY_LEARNING_FORM)
        }
        setLoadState({ key: requestKey, loading: false, error: '' })
      } catch (loadError) {
        if (active) setLoadState({ key: requestKey, loading: false, error: loadError.message || 'Unable to load resource details.' })
      }
    }
    void load()
    return () => { active = false }
  }, [resourceId, requestKey])

  const save = async (event) => {
    event.preventDefault()
    setFormError('')
  const resourcePayload = {
    ...(resourceId ? { id: resourceId } : {}),
    ...form,
  }
  const validationError = validateLearningResource(resourcePayload)
  if (validationError) {
    setFormError(validationError)
    return
  }
  setSaving(true)
  try {
    const resource = await adminService.saveLearningResource(resourcePayload)
      navigate(`/admin/learning/${resource.id}`)
    } catch (saveError) {
      setFormError(saveError.message || 'Unable to save learning resource.')
    } finally {
      setSaving(false)
    }
  }

  if (loadState.key !== requestKey || loadState.loading) return <div className="space-y-4"><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /><div className="h-96 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (loadState.error) return <div className="space-y-4"><Header title={editing ? 'Edit resource' : 'Add resource'} description="Learning resource details." back={editing ? `/admin/learning/${resourceId}` : '/admin/learning'} /><QueryError message={loadState.error} /><Button variant="outline" onClick={() => navigate('/admin/learning')}>Back to resources</Button></div>

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const visibleSkills = skills.filter((skill) => `${skill.name} ${skill.category || ''}`.toLowerCase().includes(skillSearch.trim().toLowerCase()))
  const visibleCareers = careers.filter((career) => career.title.toLowerCase().includes(careerSearch.trim().toLowerCase()))

  return (
    <div className="space-y-6">
      <Header title={editing ? 'Edit learning resource' : 'Add learning resource'} description={editing ? 'Update the resource information learners see.' : 'Add a learning resource to the platform library.'} back={editing ? `/admin/learning/${resourceId}` : '/admin/learning'} />
      <Section title="Resource information" icon={editing ? FileText : Plus}>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Title <span className="text-rose-600">*</span></span><input required maxLength={200} className={INPUT} value={form.title} onChange={update('title')} placeholder="e.g. Introduction to Data Analysis" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Resource type <span className="text-rose-600">*</span></span><select className={INPUT} value={form.resource_type} onChange={update('resource_type')}>{LEARNING_RESOURCE_TYPES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          </div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Description <span className="text-rose-600">*</span></span><textarea required maxLength={4000} className={`${INPUT} min-h-32`} value={form.description} onChange={update('description')} placeholder="Explain what learners will gain from this resource." /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Academic or professional category{form.status === 'published' ? <span className="text-rose-600"> *</span> : null}</span><select className={INPUT} value={form.category} onChange={update('category')}><option value="">Choose category</option>{LEARNING_RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Resource URL</span><input type="url" className={INPUT} value={form.url} onChange={update('url')} placeholder="https://…" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Provider</span><input maxLength={160} className={INPUT} value={form.provider} onChange={update('provider')} placeholder="e.g. Provider or publisher" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Difficulty</span><select className={INPUT} value={form.difficulty} onChange={update('difficulty')}><option value="">Not specified</option>{LEARNING_RESOURCE_DIFFICULTIES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Duration (minutes)</span><input type="number" min="1" step="1" className={INPUT} value={form.duration_minutes} onChange={update('duration_minutes')} placeholder="Optional" /></label>
            <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3"><input type="checkbox" className="h-4 w-4 accent-sky-700" checked={form.free} onChange={(event) => setForm((current) => ({ ...current, free: event.target.checked }))} /><span className="text-sm font-medium text-slate-700">This resource is free</span></label>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">Related skills</legend>
              <SearchBar value={skillSearch} onChange={setSkillSearch} placeholder="Search skill names or categories" />
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{Object.entries(unavailableSkills).filter(([id]) => form.skill_ids.includes(id)).map(([id, name]) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm"><span>{name} <span className="text-xs text-amber-800">(no longer selectable)</span></span><Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, skill_ids: current.skill_ids.filter((itemId) => itemId !== id) }))}>Remove</Button></div>)}{visibleSkills.length ? visibleSkills.map((skill) => <label key={skill.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm"><input type="checkbox" checked={form.skill_ids.includes(skill.id)} onChange={(event) => setForm((current) => ({ ...current, skill_ids: event.target.checked ? [...new Set([...current.skill_ids, skill.id])] : current.skill_ids.filter((id) => id !== skill.id) }))} /><span><span className="block font-medium text-slate-800">{skill.name}</span><span className="text-xs text-slate-500">{skill.category}</span></span></label>) : !Object.keys(unavailableSkills).length ? <p className="text-sm text-slate-500">No approved skills match this search.</p> : null}</div>
            </fieldset>
            <fieldset className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">Related published careers</legend>
              <SearchBar value={careerSearch} onChange={setCareerSearch} placeholder="Search career titles" />
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{Object.entries(unavailableCareers).filter(([id]) => form.career_ids.includes(id)).map(([id, title]) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm"><span>{title} <span className="text-xs text-amber-800">(not published)</span></span><Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, career_ids: current.career_ids.filter((itemId) => itemId !== id) }))}>Remove</Button></div>)}{visibleCareers.length ? visibleCareers.map((career) => <label key={career.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-sm"><input type="checkbox" checked={form.career_ids.includes(career.id)} onChange={(event) => setForm((current) => ({ ...current, career_ids: event.target.checked ? [...new Set([...current.career_ids, career.id])] : current.career_ids.filter((id) => id !== career.id) }))} /><span>{career.title}</span></label>) : !Object.keys(unavailableCareers).length ? <p className="text-sm text-slate-500">No published careers match this search.</p> : null}</div>
            </fieldset>
          </div>
          {editing ? <p className="text-sm text-slate-600">Publication status: <Badge tone={form.status === 'published' ? 'green' : form.status === 'archived' ? 'slate' : 'amber'}>{form.status}</Badge>. Change status from the resource details page.</p> : null}
          {formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{formError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={() => navigate(editing ? `/admin/learning/${resourceId}` : '/admin/learning')}>Cancel</Button><Button type="submit" disabled={saving}><CheckCircle2 size={16} />{saving ? 'Saving…' : editing ? 'Save changes' : 'Add resource'}</Button></div>
        </form>
      </Section>
    </div>
  )
}

function LearningResourceDetail({ id }) {
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionState, setActionState] = useState({ loading: false, error: '', message: '' })
  const requestKey = `${id}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getLearningResource(id)
      .then((resource) => { if (active) setResult({ key: requestKey, resource, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, resource: null, error: loadError.message || 'Unable to load learning resource.' }) })
    return () => { active = false }
  }, [id, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  if (!currentResult) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (currentResult.error) return <div className="space-y-4"><Header title="Learning resource" description="Resource details" back="/admin/learning" /><QueryError message={currentResult.error} /><Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>

  const resource = currentResult.resource
  const statusTone = { published: 'green', draft: 'amber', archived: 'slate' }
  const linkedSkills = (resource.learning_resource_skills || []).map((item) => item.skills?.name).filter(Boolean)
  const linkedCareers = (resource.learning_resource_careers || []).map((item) => item.careers?.title).filter(Boolean)
  const metadata = [
    ['Category', resource.category],
    ['Provider', resource.provider],
    ['Related skills', linkedSkills.join(', ') || resource.skills?.name],
    ['Related careers', linkedCareers.join(', ')],
    ['Difficulty', resource.difficulty],
    ['Duration', resource.duration_minutes ? `${resource.duration_minutes} minutes` : null],
    ['Cost', resource.free ? 'Free' : 'Paid'],
    ['Added', resource.created_at ? new Date(resource.created_at).toLocaleDateString() : null],
  ]

  const changeStatus = async (status) => {
    setActionState({ loading: true, error: '', message: '' })
    try {
      const updatedResource = await adminService.updateLearningResourceStatus(resource.id, status)
      setResult({ key: requestKey, resource: { ...resource, ...updatedResource }, error: '' })
      setActionState({ loading: false, error: '', message: `Resource status changed to ${status}.` })
    } catch (statusError) {
      setActionState({ loading: false, error: statusError.message || 'Unable to update resource status.', message: '' })
    }
  }

  return (
    <div className="space-y-6">
      <Header title="Learning resource" description="Review and update this resource in the learner library." back="/admin/learning" />
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-sky-900 to-sky-700 p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="rounded-2xl bg-white/10 p-3"><BookOpen size={26} /></span><div><p className="text-sm font-semibold uppercase tracking-wide text-sky-200">{resource.resource_type} · {resource.category || 'Uncategorized'}</p><h2 className="mt-1 text-2xl font-bold">{resource.title}</h2><Badge tone={statusTone[resource.status] || 'slate'}>{resource.status || 'draft'}</Badge></div></div><Link to={`/admin/learning/${resource.id}/edit`}><Button variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20"><FileText size={16} />Edit resource</Button></Link></div>
          <p className="mt-5 max-w-4xl whitespace-pre-wrap text-sm leading-7 text-sky-50">{resource.description}</p>
          {/^https?:\/\//i.test(resource.url || '') ? <a href={resource.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20">Open resource<ExternalLink size={15} /></a> : null}
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-7">{metadata.map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value || 'Not specified'}</dd></div>)}</dl>
      </Card>
      {actionState.error ? <QueryError message={actionState.error} /> : null}
      {actionState.message ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{actionState.message}</p> : null}
      <Card className="flex flex-wrap items-center gap-2 p-4">
        {resource.status !== 'published' ? <Button disabled={actionState.loading} onClick={() => void changeStatus('published')}><CheckCircle2 size={16} />Publish</Button> : null}
        {resource.status !== 'archived' ? <Button variant="outline" disabled={actionState.loading} onClick={() => void changeStatus('archived')}><Archive size={16} />Archive</Button> : <Button variant="outline" disabled={actionState.loading} onClick={() => void changeStatus('draft')}>Return to draft</Button>}
      </Card>
    </div>
  )
}

function SkillsCatalogView() {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [result, setResult] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [candidates, setCandidates] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewingSkillId, setReviewingSkillId] = useState('')
  const [skillEdits, setSkillEdits] = useState({})
  const [reviewHistory, setReviewHistory] = useState(null)
  const requestKey = `${search.trim()}:${refreshKey}`

  useEffect(() => {
    let active = true
    adminService.getSkills(search.trim())
      .then((items) => { if (active) setResult({ key: requestKey, items, error: '' }) })
      .catch((loadError) => { if (active) setResult({ key: requestKey, items: [], error: loadError.message || 'Unable to load skills.' }) })
    return () => { active = false }
  }, [search, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const allItems = currentResult?.items || []
  const categories = SKILL_CATEGORIES
  const items = allItems.filter((item) =>
    (!category || item.category === category)
    && (!approvalFilter || item.approval_status === approvalFilter),
  )
  const loading = !currentResult
  const selectedCandidates = candidates.filter((item) => item.selected)
  const selectedCandidateNameCounts = new Map()
  for (const candidate of selectedCandidates) {
    const name = normalizeSkillCatalogName(candidate.name)
    selectedCandidateNameCounts.set(name, (selectedCandidateNameCounts.get(name) || 0) + 1)
  }
  const invalidSelectedCandidates = selectedCandidates.filter((candidate) => {
    const name = normalizeSkillCatalogName(candidate.name)
    return !validateSkillCandidate(candidate).valid || selectedCandidateNameCounts.get(name) > 1
  })

  const extractPdfSkills = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setImportMessage('')
    setImportError('')
    if (!file) return
    setCandidates([])
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      setImportError('Choose a PDF file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError('The PDF must be 10 MB or smaller.')
      return
    }
    if (!session?.access_token) {
      setImportError('Your administrator session has expired. Sign in again and retry.')
      return
    }

    setExtracting(true)
    try {
      const text = await adminService.extractSkillsPdf(file, session.access_token)
      const existing = await adminService.getSkills()
      const detected = extractSkillCandidates(text, existing)
      setCandidates(detected)
      if (!detected.length) {
        setImportError('No new skill names were detected. Upload a text-based PDF containing one skill per line or comma-separated skill lists.')
      }
    } catch (uploadError) {
      setImportError(uploadError.message || 'Unable to detect skills in that PDF.')
      setCandidates([])
    } finally {
      setExtracting(false)
    }
  }

  const updateCandidate = (index, field, value) => {
    setCandidates((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )))
  }

  const importSelectedSkills = async () => {
    setImporting(true)
    setImportError('')
    setImportMessage('')
    try {
      const imported = await adminService.importSkills(selectedCandidates)
      setCandidates([])
      setRefreshKey((key) => key + 1)
      setImportMessage(`${imported.length} ${imported.length === 1 ? 'skill' : 'skills'} submitted for administrator review. They will not be available until approved.`)
    } catch (saveError) {
      setImportError(saveError.message || 'Unable to add these skills to the catalog.')
    } finally {
      setImporting(false)
    }
  }

  const reviewSkill = async (item, approvalStatus) => {
    setReviewError('')
    setReviewingSkillId(item.id)
    try {
      const details = skillEdits[item.id] || item
      await adminService.reviewSkill(item.id, approvalStatus, details)
      setSkillEdits((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      setRefreshKey((key) => key + 1)
    } catch (reviewActionError) {
      setReviewError(reviewActionError.message || 'Unable to update skill approval.')
    } finally {
      setReviewingSkillId('')
    }
  }

  const toggleReviewHistory = async (item) => {
    if (reviewHistory?.skillId === item.id) {
      setReviewHistory(null)
      return
    }
    setReviewHistory({ skillId: item.id, items: [], loading: true, error: '' })
    try {
      const items = await adminService.getSkillReviewHistory(item.id)
      setReviewHistory({ skillId: item.id, items, loading: false, error: '' })
    } catch (historyError) {
      setReviewHistory({
        skillId: item.id,
        items: [],
        loading: false,
        error: historyError.message || 'Unable to load the skill review history.',
      })
    }
  }

  const updateSkillEdit = (item, field, value) => {
    setSkillEdits((current) => ({
      ...current,
      [item.id]: {
        name: current[item.id]?.name ?? item.name,
        category: current[item.id]?.category ?? item.category,
        description: current[item.id]?.description ?? item.description ?? '',
        [field]: value,
      },
    }))
  }

  return (
    <div className="space-y-6">
      <Header title={CONFIG.skills[0]} description={CONFIG.skills[1]} />
      <Section title="Import skills from PDF" icon={Upload}>
        <p className="mb-4 text-sm leading-6 text-slate-600">Upload a text-based skills list. Review the extracted names and categories before submitting; each new entry stays hidden from students and employers until approved.</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">
          <Upload size={16} />
          {extracting ? 'Reading PDF…' : 'Choose skills PDF'}
          <input className="sr-only" type="file" accept="application/pdf,.pdf" disabled={extracting || importing} onChange={extractPdfSkills} />
        </label>
        <span className="ml-3 text-xs text-slate-500">PDF, up to 10 MB. Scanned image PDFs need text recognition and are not supported.</span>
        {importError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{importError}</p> : null}
        {importMessage ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</p> : null}
        {candidates.length ? <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold text-slate-900">Review detected skills</h4><p className="text-sm text-slate-600">{selectedCandidates.length} of {candidates.length} selected. Edit names or categories before importing.</p></div><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setCandidates((current) => current.map((item) => ({ ...item, selected: true })))}>Select all</Button><Button type="button" variant="ghost" size="sm" onClick={() => setCandidates((current) => current.map((item) => ({ ...item, selected: false })))}>Clear selection</Button></div></div>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
            {candidates.map((item, index) => {
              const validation = validateSkillCandidate(item)
              const duplicateName = selectedCandidateNameCounts.get(normalizeSkillCatalogName(item.name)) > 1
              return <div key={`${item.name.toLocaleLowerCase()}-${index}`} className="grid gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,0.7fr)] sm:items-start">
              <input aria-label={`Select ${item.name}`} type="checkbox" checked={item.selected} onChange={(event) => updateCandidate(index, 'selected', event.target.checked)} />
              <div className="space-y-3">
                <label className="block text-sm text-slate-500">Skill name<input className={`${INPUT} mt-1`} maxLength={80} value={item.name} onChange={(event) => updateCandidate(index, 'name', event.target.value)} /></label>
                <label className="block text-sm text-slate-500">Meaningful description<textarea className={`${INPUT} mt-1`} rows={3} maxLength={500} value={item.description} onChange={(event) => updateCandidate(index, 'description', event.target.value)} placeholder="Describe the practical knowledge or ability this skill represents." /></label>
                <div className="space-y-1 text-xs text-rose-700">
                  {item.selected ? validation.errors.map((message) => <p key={message}>{message}</p>) : null}
                  {item.selected && duplicateName ? <p>This selected list contains a duplicate normalized skill name.</p> : null}
                </div>
              </div>
              <label className="text-sm text-slate-500">Category<select className={`${INPUT} mt-1`} value={item.category} onChange={(event) => updateCandidate(index, 'category', event.target.value)}>{SKILL_CATEGORIES.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}</select></label>
            </div>
            })}
          </div>
          <Button type="button" disabled={!selectedCandidates.length || importing || invalidSelectedCandidates.length > 0} onClick={importSelectedSkills}><Plus size={16} />{importing ? 'Submitting…' : `Submit ${selectedCandidates.length} selected ${selectedCandidates.length === 1 ? 'skill' : 'skills'} for review`}</Button>
        </div> : null}
      </Section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-slate-500">Skills found</p><p className="mt-2 text-3xl font-bold text-slate-900">{loading ? '—' : allItems.length}</p></Card>
        <Card className="p-5"><p className="text-sm text-slate-500">Categories</p><p className="mt-2 text-3xl font-bold text-slate-900">{loading ? '—' : categories.length}</p></Card>
        <Card className="flex items-center gap-3 p-5"><span className="rounded-xl bg-sky-50 p-2 text-sky-700"><Layers3 size={20} /></span><p className="text-sm leading-6 text-slate-600">Imported catalog skills are shared with student and graduate skill selectors and employer job requirements.</p></Card>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Search skills</span><SearchBar value={search} onChange={setSearch} placeholder="Search by skill name" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Filter by category</span><select className={INPUT} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Approval status</span><select className={INPUT} value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value)}><option value="">All statuses</option>{['pending', 'approved', 'rejected'].map((item) => <option key={item} value={item}>{item === 'pending' ? 'Pending review' : item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
          {(search || category || approvalFilter) ? <Button variant="ghost" onClick={() => { setSearch(''); setCategory(''); setApprovalFilter('') }}>Clear filters</Button> : null}
        </div>
      </Card>
      <Section title="Skill catalog" icon={Layers3} action={<span className="text-sm text-slate-500">{loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'skill' : 'skills'}`}</span>}>
        {reviewError ? <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{reviewError}</p> : null}
        {currentResult?.error ? (
          <div className="space-y-3"><QueryError message={currentResult.error} /><Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} />Try again</Button></div>
        ) : loading ? (
          <div aria-label="Loading skills" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Card key={item.id} className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">{item.name}</h3><div className="flex flex-wrap justify-end gap-2"><Badge tone={item.approval_status === 'approved' ? 'green' : item.approval_status === 'rejected' ? 'red' : 'amber'}>{item.approval_status === 'pending' ? 'Pending review' : item.approval_status}</Badge><Badge tone="blue">{item.category || 'Uncategorized'}</Badge></div></div>
                {item.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.description}</p> : <p className="mt-2 text-sm italic text-slate-400">No description available.</p>}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {item.is_internal || item.status === 'archived' ? <Badge tone="red">Internal / archived</Badge> : null}
                  {item.source_type === 'pdf_import' ? <Badge tone="slate">PDF import</Badge> : null}
                  <Badge tone="slate">{item.user_skills?.length || 0} student profiles</Badge>
                  <Badge tone="slate">{item.job_skills?.length || 0} job skill links</Badge>
                  <Badge tone="slate">{item.career_skills?.length || 0} career references</Badge>
                  <Badge tone="slate">{item.assessments?.length || 0} assessments</Badge>
                  <Badge tone="slate">{item.learning_resource_skills?.length || 0} learning resources</Badge>
                  <Badge tone="slate">{(item.project_skills?.length || 0) + (item.certificate_skills?.length || 0) + (item.portfolio_skills?.length || 0)} portfolio evidence links</Badge>
                  <Badge tone="slate">{item.career_opportunity_skills?.length || 0} opportunity references</Badge>
                </div>
                {!item.is_internal && item.status !== 'archived' && item.approval_status !== 'approved' ? (() => {
                  const details = skillEdits[item.id] || { name: item.name, category: item.category || '', description: item.description || '' }
                  const validation = validateSkillCandidate(details)
                  return <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
                    <label className="block text-xs font-medium text-slate-600">Skill name<input className={`${INPUT} mt-1`} maxLength={80} value={details.name} onChange={(event) => updateSkillEdit(item, 'name', event.target.value)} /></label>
                    <label className="block text-xs font-medium text-slate-600">Category<select className={`${INPUT} mt-1`} value={details.category} onChange={(event) => updateSkillEdit(item, 'category', event.target.value)}>{SKILL_CATEGORIES.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}</select></label>
                    <label className="block text-xs font-medium text-slate-600">Description<textarea className={`${INPUT} mt-1`} rows={3} maxLength={500} value={details.description} onChange={(event) => updateSkillEdit(item, 'description', event.target.value)} /></label>
                    {validation.errors.length ? <div className="space-y-1 text-xs text-rose-700">{validation.errors.map((message) => <p key={message}>{message}</p>)}</div> : null}
                  </div>
                })() : null}
                {!item.is_internal && item.status !== 'archived' ? <div className="mt-3 flex flex-wrap gap-2">
                  {item.approval_status !== 'approved' ? <Button type="button" size="sm" disabled={reviewingSkillId === item.id || validateSkillCandidate(skillEdits[item.id] || item).valid === false} onClick={() => reviewSkill(item, 'approved')}><Check size={15} />{reviewingSkillId === item.id ? 'Saving…' : 'Approve'}</Button> : null}
                  {item.approval_status !== 'rejected' ? <Button type="button" size="sm" variant="outline" className="text-rose-700" disabled={reviewingSkillId === item.id} onClick={() => reviewSkill(item, 'rejected')}><X size={15} />Reject</Button> : null}
                  <Button type="button" size="sm" variant="outline" className="text-slate-700" disabled={reviewingSkillId === item.id} onClick={() => reviewSkill(item, 'archived')}>Archive</Button>
                </div> : null}
                <div className="mt-3">
                  <Button type="button" size="sm" variant="ghost" onClick={() => toggleReviewHistory(item)}>{reviewHistory?.skillId === item.id ? 'Hide review history' : 'View review history'}</Button>
                  {reviewHistory?.skillId === item.id ? <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {reviewHistory.loading ? 'Loading review history…' : reviewHistory.error ? reviewHistory.error : reviewHistory.items.length ? <ul className="space-y-2">{reviewHistory.items.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2"><span>{event.action.replaceAll('_', ' ')}{event.actor_id ? ' · administrator action' : ' · system action'}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}</ul> : 'No review history is available for this skill.'}
                  </div> : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>{search || category || approvalFilter ? 'No skills match the current search, category, and approval filters.' : 'The skills catalog is empty.'}</EmptyState>
        )}
      </Section>
    </div>
  )
}

function AdminSettingsView() {
  const { profile, user, profileLoading } = useAuth()
  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Administrator'
  const email = profile?.email || user?.email || 'Email unavailable'
  const role = profile?.role || user?.user_metadata?.role || 'admin'
  const createdAt = profile?.created_at || user?.created_at
  const joinedDate = createdAt && !Number.isNaN(new Date(createdAt).getTime())
    ? new Date(createdAt).toLocaleDateString()
    : 'Unavailable'

  return (
    <div className="space-y-6">
      <Header title="Settings" description="Review your administrator account and manage your profile picture and sign-in security." />
      {profileLoading && !profile ? (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading administrator profile" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <div className="space-y-6">
            <Section title="Administrator profile" icon={UserRound}>
              <div className="space-y-5">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{displayName}</p>
                  <p className="mt-1 text-sm text-slate-500">Your account identity and administrator access.</p>
                </div>
                <ProfilePictureUploader profile={{ ...profile, full_name: displayName }} />
              </div>
            </Section>
          </div>
          <div className="space-y-6">
            <Section title="Account details" icon={Mail}>
              <dl className="divide-y divide-slate-100">
                <div className="py-3 first:pt-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email address</dt>
                  <dd className="mt-1 break-all text-sm font-medium text-slate-900">{email}</dd>
                </div>
                <div className="py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access role</dt>
                  <dd className="mt-2"><Badge tone="blue">{role}</Badge></dd>
                </div>
                <div className="py-3 last:pb-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account created</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">{joinedDate}</dd>
                </div>
              </dl>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Account name, email, and role are managed by the platform identity system and are read-only here.</p>
            </Section>
            <Section title="Sign-in security" icon={ShieldCheck}>
              <p className="text-sm leading-6 text-slate-600">To change your password, request a secure reset link using your account email.</p>
              <Link to="/forgot-password" className="mt-4 inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
                Reset password
                <ArrowRight size={16} className="ml-2" />
              </Link>
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

function SimpleAdminList({ mode }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = mode === 'learning'
      ? adminService.getLearningResources({ search, pageSize: 100 }).then((result) => result.items)
      : mode === 'assessments'
        ? adminService.getAssessments(search)
        : mode === 'applications'
          ? adminService.getApplications()
          : mode === 'ai'
            ? adminService.getAiMonitoring().then((data) => data.recommendations)
            : Promise.resolve([])
    load.then(setItems).catch(() => setItems([]))
  }, [mode, search])

  const iconMap = { learning: BookOpen, assessments: ListChecks, applications: FileText, ai: Sparkles }
  const Icon = iconMap[mode] || Activity
  return <div className="space-y-6"><Header title={CONFIG[mode][0]} description={CONFIG[mode][1]} /><SearchBar value={search} onChange={setSearch} placeholder="Search records" /><Section title="Records" icon={Icon}>{items.length ? <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Card key={item.id} className="p-4"><div className="flex justify-between gap-3"><p className="font-semibold">{item.title || item.action || item.recommendation_type || item.jobs?.title || 'Platform record'}</p>{item.status || item.feedback_status ? <Badge tone="blue">{item.status || item.feedback_status}</Badge> : null}</div><p className="mt-2 text-sm text-slate-500">{item.description || item.message || item.entity_type || item.jobs?.employer_profiles?.company_name || 'Recorded data'}</p>{item.created_at ? <p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p> : null}</Card>)}</div> : <EmptyState>{mode === 'applications' ? 'No application data available yet.' : mode === 'ai' ? 'No stored AI recommendation records yet. AI generation is not enabled.' : 'No records found.'}</EmptyState>}</Section></div>
}

function AuditLogsView() {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const pageSize = 25

  useEffect(() => {
    let active = true
    adminService.getAuditLogs({ search, entityType, fromDate, toDate, page, pageSize })
      .then((result) => {
        if (active) {
          setData((current) => {
            if (!current?.checks?.length) return result
            const previousChecks = new Map(current.checks.map((check) => [check.key, check]))
            return {
              ...result,
              checks: result.checks.map((check) => ({
                ...check,
                lastSuccessfulAt: check.lastSuccessfulAt || previousChecks.get(check.key)?.lastSuccessfulAt || null,
              })),
            }
          })
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load audit logs.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [search, entityType, fromDate, toDate, page, refreshKey])

  const refresh = () => {
    setError('')
    setLoading(true)
    setRefreshKey((key) => key + 1)
  }
  const pageCount = Math.ceil((data?.total || 0) / pageSize)
  const rangeStart = data?.total ? page * pageSize + 1 : 0
  const rangeEnd = Math.min((page + 1) * pageSize, data?.total || 0)
  const hasFilters = Boolean(search || entityType || fromDate || toDate)
  const summarize = (summary) => Object.entries(summary || {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${typeof value === 'string' ? value : String(value)}`)

  return (
    <div className="space-y-6">
      <Header title="Audit Logs" description="Review recorded administrative activity. Logs are read-only; sensitive metadata is not displayed." />
      <Section
        title="Administrative activity"
        icon={ShieldCheck}
        action={<Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>}
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700">Search logs
            <div className="relative mt-1">
          <Search size={17} className="absolute left-3 top-3 text-slate-400" />
          <input
            className={`${INPUT} pl-10`}
            value={search}
            onChange={(event) => { setLoading(true); setSearch(event.target.value); setPage(0) }}
            placeholder="Action, entity, or description"
            aria-label="Search audit logs"
          />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700">Entity type
            <select className={`${INPUT} mt-1`} value={entityType} onChange={(event) => { setLoading(true); setEntityType(event.target.value); setPage(0) }}>
              <option value="">All entities</option>
              {['user', 'employer_verification_submission', 'career', 'skill', 'job', 'assessment', 'learning_resource', 'certificate_review', 'interview_policy_report'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">From date<input className={`${INPUT} mt-1`} type="date" value={fromDate} onChange={(event) => { setLoading(true); setFromDate(event.target.value); setPage(0) }} /></label>
          <label className="block text-sm font-medium text-slate-700">To date<input className={`${INPUT} mt-1`} type="date" value={toDate} onChange={(event) => { setLoading(true); setToDate(event.target.value); setPage(0) }} /></label>
        </div>
        {hasFilters ? <Button variant="ghost" className="mb-4" onClick={() => { setLoading(true); setSearch(''); setEntityType(''); setFromDate(''); setToDate(''); setPage(0) }}>Clear filters</Button> : null}
        {error ? <div className="mb-4 space-y-3"><QueryError message={error} /><Button variant="outline" onClick={refresh}>Try again</Button></div> : null}
        {loading && !data ? <div className="space-y-3" aria-label="Loading audit logs">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div> : null}
        {data && !loading && !error && data.items.length === 0 ? <EmptyState>{hasFilters ? 'No audit logs match the current filters.' : 'No administrative activity has been recorded yet.'}</EmptyState> : null}
        {data && data.items.length > 0 ? (
          <>
            <div className="space-y-3">
              {data.items.map((log) => (
                <article key={log.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{log.action || 'Administrative action'}</p>
                        {log.entity_type ? <Badge tone="blue">{log.entity_type}</Badge> : null}
                        {log.actor_role ? <Badge tone="slate">{log.actor_role}</Badge> : null}
                        <Badge tone={log.action_result === 'success' ? 'green' : 'red'}>{log.action_result || 'result unavailable'}</Badge>
                      </div>
                      {log.description ? <p className="mt-2 break-words text-sm text-slate-600">{log.description}</p> : null}
                      {log.entity_id ? <p className="mt-2 break-all text-xs text-slate-500">Record ID: {log.entity_id}</p> : null}
                      <p className="mt-2 text-xs text-slate-500">Admin: {log.admin?.full_name || log.admin?.email || 'Unknown administrator'}</p>
                      {log.before_summary || log.after_summary ? <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        {log.before_summary ? <div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold text-slate-600">Before</p><p className="mt-1 text-slate-500">{summarize(log.before_summary).join(' · ') || 'No summary'}</p></div> : null}
                        {log.after_summary ? <div className="rounded-lg bg-slate-50 p-3"><p className="font-semibold text-slate-600">After</p><p className="mt-1 text-slate-500">{summarize(log.after_summary).join(' · ') || 'No summary'}</p></div> : null}
                      </div> : null}
                    </div>
                    <time className="shrink-0 text-xs text-slate-500" dateTime={log.created_at}>{log.created_at ? new Date(log.created_at).toLocaleString() : 'Unknown time'}</time>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Showing {rangeStart}–{rangeEnd} of {data.total} logs</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setLoading(true); setPage((current) => Math.max(0, current - 1)) }} disabled={page === 0 || loading}><ArrowLeft size={16} />Previous</Button>
                <Button variant="outline" onClick={() => { setLoading(true); setPage((current) => current + 1) }} disabled={page + 1 >= pageCount || loading}>Next<ArrowRight size={16} /></Button>
              </div>
            </div>
          </>
        ) : null}
      </Section>
    </div>
  )
}

function AnalyticsView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dateRange, setDateRange] = useState('all')

  useEffect(() => {
    let active = true
    adminService.getDashboard(dateRange)
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load analytics.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey, dateRange])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }
  const metrics = [
    { label: 'Total users', value: data?.metrics.users, description: 'All registered platform accounts', icon: Users, to: '/admin/users' },
    { label: 'Students & graduates', value: data?.metrics.studentProfiles, description: 'Student profile records', icon: GraduationCapIcon, to: '/admin/users' },
    { label: 'Employers', value: data?.metrics.employers, description: 'Employer organization profiles', icon: Building2, to: '/admin/employers' },
    { label: 'Published jobs', value: data?.metrics.jobs, description: 'Published, non-demo opportunities', icon: BriefcaseBusiness, to: '/admin/jobs' },
    { label: 'Applications', value: data?.metrics.applications, description: 'Recorded applications across jobs', icon: FileText, to: '/admin/applications' },
    { label: 'Interviews', value: data?.metrics.interviews, description: 'Recorded interview activity', icon: CalendarDays, to: '/admin/applications' },
    { label: 'Employment records', value: data?.metrics.employment, description: 'Tracked employment records; not unique candidates', icon: CheckCircle2, to: '/admin/employers' },
    { label: 'Active employment', value: data?.metrics.activeEmployment, description: 'Records currently marked active', icon: CheckCircle2, to: '/admin/employers' },
    { label: 'Assessments', value: data?.metrics.assessments, description: 'Published, draft, and archived assessments', icon: ListChecks, to: '/admin/assessments' },
    { label: 'Published resources', value: data?.metrics.resources, description: 'Published, non-demo learning resources', icon: BookOpen, to: '/admin/learning' },
    { label: 'Skills', value: data?.metrics.skills, description: 'Skills in the shared taxonomy', icon: Layers3, to: '/admin/skills' },
    { label: 'Careers', value: data?.metrics.careers, description: 'Structured career definitions', icon: Target, to: '/admin/careers' },
  ]

  if (loading && !data) {
    return <div className="space-y-6"><Header title="Analytics" description="A snapshot of recorded platform activity and content." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>
  }

  if (error && !data) {
    return <div className="space-y-6"><Header title="Analytics" description="A snapshot of recorded platform activity and content." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>
  }

  return (
    <div className="space-y-6">
      <Header title="Analytics" description="Explore current totals from recorded platform data. These are point-in-time counts, not time-based trends." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-medium text-slate-700">Date range
          <select className={`${INPUT} mt-1.5 min-w-48`} value={dateRange} onChange={(event) => { setLoading(true); setDateRange(event.target.value) }}>
            {ADMIN_DASHBOARD_DATE_RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <p className="text-sm text-slate-500">{loading ? 'Updating counts…' : `Showing ${data?.dateRange?.label || 'all time'} records.`}</p>
        <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh data'}</Button>
      </div>
      {error ? <QueryError message={`Analytics data may be out of date. ${error}`} /> : null}
      <Section title="Platform activity" icon={BarChart3}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map(({ label, value, description, icon: Icon, to }) => (
            <Link key={label} to={to} className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value ?? 0}</p></div>
                <span className="rounded-xl bg-sky-50 p-2 text-sky-700"><Icon size={18} /></span>
              </div>
              <p className="mt-3 text-sm text-slate-500">{description}</p>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Record status and demo data" icon={Activity}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['All job records', data?.metrics.jobsTotal],
            ['Draft jobs', data?.metrics.draftJobs],
            ['Closed jobs', data?.metrics.closedJobs],
            ['Archived jobs', data?.metrics.archivedJobs],
            ['Demo jobs (excluded from published count)', data?.metrics.demoJobs],
            ['Published assessments', data?.metrics.publishedAssessments],
            ['Draft assessments', data?.metrics.draftAssessments],
            ['Archived assessments', data?.metrics.archivedAssessments],
            ['Published resources', data?.metrics.resources],
            ['Draft resources', data?.metrics.draftResources],
            ['Archived resources', data?.metrics.archivedResources],
            ['Demo resources (excluded from published count)', data?.metrics.demoResources],
            ['Completed employment records', data?.metrics.completedEmployment],
            ['Terminated employment records', data?.metrics.terminatedEmployment],
            ['Employers (demo excluded)', data?.metrics.employers],
            ['Demo employers', data?.metrics.demoEmployers],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value ?? 0}</p></div>)}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Only the explicitly seeded SkillBridge demo employer, jobs, and learning resources are tagged as demo. Legacy records without a reliable demo marker remain included; no records are guessed to be test data.</p>
      </Section>
      {!loading && !error && !data?.metrics.users && !data?.metrics.jobsTotal && !data?.metrics.applications && !data?.metrics.assessments && !data?.metrics.employment
        ? <EmptyState>No user, opportunity, application, assessment, or employment activity was recorded for this date range. Content catalog records are shown separately.</EmptyState>
        : null}
    </div>
  )
}

function EvaluationReportView() {
  const [report, setReport] = useState(null)
  const [setup, setSetup] = useState({ students: [], jobs: [], reviews: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [jobId, setJobId] = useState('')
  const [expectedMatch, setExpectedMatch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([adminService.getEvaluationReport(), adminService.getJobMatchEvaluationSetup()])
      .then(([evaluation, evaluationSetup]) => {
        if (!active) return
        setReport(evaluation)
        setSetup(evaluationSetup)
        setError('')
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load evaluation data.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setError('')
    setLoading(true)
    setRefreshKey((key) => key + 1)
  }
  const saveReview = async (event) => {
    event.preventDefault()
    setSavingReview(true)
    setReviewError('')
    setReviewNotice('')
    try {
      await adminService.saveJobMatchEvaluationExample(candidateId, jobId, expectedMatch === 'yes')
      setReviewNotice('Reviewed candidate-job example saved. Matching results will be recalculated on refresh.')
      setCandidateId('')
      setJobId('')
      setExpectedMatch('')
      refresh()
    } catch (saveError) {
      setReviewError(saveError.message || 'Unable to save the reviewed example.')
    } finally {
      setSavingReview(false)
    }
  }

  const formatAverage = (value, suffix = '/5') => value === null || value === undefined ? 'Unavailable' : `${Number(value).toFixed(1)}${suffix}`
  const formatPercent = (value) => value === null || value === undefined ? 'Unavailable' : `${Number(value).toFixed(1)}%`
  const numberOrUnavailable = (value) => value === null || value === undefined ? 'Unavailable' : value

  if (loading && !report) return <div className="space-y-6"><Header title={CONFIG.evaluation[0]} description={CONFIG.evaluation[1]} /><div role="status" className="h-64 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (error && !report) return <div className="space-y-6"><Header title={CONFIG.evaluation[0]} description={CONFIG.evaluation[1]} /><QueryError message={error} /><Button variant="outline" onClick={refresh}>Try again</Button></div>

  const metrics = report?.metrics
  const cards = [
    ['Career recommendation relevance', formatAverage(metrics?.recommendationRelevance.relevance.average), `${metrics?.recommendationRelevance.relevance.sampleSize || 0} relevance ratings · 1–5`],
    ['Career recommendation suitability', formatAverage(metrics?.recommendationRelevance.suitability.average), `${metrics?.recommendationRelevance.suitability.sampleSize || 0} suitability ratings · 1–5`],
    ['Recommendation acceptance', formatPercent(metrics?.recommendationEngagement.acceptanceRate), `${metrics?.recommendationEngagement.accepted || 0} accepted of ${metrics?.recommendationEngagement.sampleSize || 0} rated actions`],
    ['Mean assessment score', formatAverage(metrics?.assessmentPerformance.averageScore, '%'), `${metrics?.assessmentPerformance.scoredSampleSize || 0} scored results`],
    ['Assessment pass rate', formatPercent(metrics?.assessmentPerformance.passRate), `${metrics?.assessmentPerformance.passedCount || 0} passes from ${metrics?.assessmentPerformance.passSampleSize || 0} scored outcomes`],
    ['Assessment completion rate', formatPercent(metrics?.assessmentPerformance.completionRate), `${metrics?.assessmentPerformance.completedAttempts || 0} completed of ${metrics?.assessmentPerformance.startedAttempts || 0} tracked starts`],
    ['Reviewed matching accuracy', formatPercent(metrics?.matchingAccuracy.accuracy), `${metrics?.matchingAccuracy.sampleSize || 0} scored reviewed examples · threshold ${metrics?.matchingAccuracy.threshold}`],
    ['Matching precision', formatPercent(metrics?.matchingAccuracy.precision), `${metrics?.matchingAccuracy.precisionSampleSize || 0} predicted-suitable examples`],
    ['Matching recall', formatPercent(metrics?.matchingAccuracy.recall), `${metrics?.matchingAccuracy.recallSampleSize || 0} reviewed-suitable examples`],
    ['Matching F1', formatPercent(metrics?.matchingAccuracy.f1), `${metrics?.matchingAccuracy.sampleSize || 0} scored reviewed examples`],
    ['User satisfaction', formatAverage(metrics?.userSatisfaction.average), `${metrics?.userSatisfaction.sampleSize || 0} ratings · 1–5`],
  ]

  return <div className="space-y-6">
    <Header title={CONFIG.evaluation[0]} description={CONFIG.evaluation[1]} />
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Generated {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'time unavailable'}. Values are computed from stored records or the labeled test fixtures specified below.</p><Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh report'}</Button></div>
    {error ? <QueryError message={`Some previously loaded data may be stale. ${error}`} /> : null}
    <Section title="Evaluation summary" icon={BarChart3}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, sample]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-500">{sample}</p></div>)}</div>
    </Section>
    <Section title="Metric definitions and limitations" icon={FileText}>
      <dl className="space-y-4 text-sm leading-6 text-slate-700">
        <div><dt className="font-semibold text-slate-900">Recommendation relevance and suitability</dt><dd>Mean user-provided 1–5 ratings on saved career recommendations. Sample size is the number of recorded ratings for each dimension. Older useful/not-useful votes are shown separately and are not converted into rating scores. No ratings means unavailable, not zero.</dd></div>
        <div><dt className="font-semibold text-slate-900">Skills-gap identification</dt><dd>{metrics?.skillsGapIdentification.passed}/{metrics?.skillsGapIdentification.sampleSize} predefined deterministic test cases passed. Fixtures cover a missing skill, large and medium proficiency gaps, and no gap when a requirement is met. This is a test result, not observed performance on student profiles.</dd></div>
        <div><dt className="font-semibold text-slate-900">Assessment performance</dt><dd>{metrics?.assessmentPerformance.resultRows} stored result rows; {metrics?.assessmentPerformance.startedAttempts} tracked attempts started and {metrics?.assessmentPerformance.completedAttempts} completed. Completion rate uses completed tracked attempts divided by tracked starts. Score mean and pass rate use actual stored results and their respective sample counts; older results without a tracked start are excluded from completion-rate calculations.</dd></div>
        <div><dt className="font-semibold text-slate-900">Matching accuracy</dt><dd>Administrators label candidate-job examples as suitable or unsuitable. Stored match scores of at least {metrics?.matchingAccuracy.threshold} are counted as predicted suitable. Accuracy, precision, recall, and F1 are computed only for reviewed pairs with a current stored score; unscored reviewed examples are excluded and reported. Metrics remain unavailable when no scored reference examples exist. Results depend on the quality and representativeness of the reviewed examples.</dd></div>
        <div><dt className="font-semibold text-slate-900">Usability and satisfaction</dt><dd>Questionnaire means use actual submitted responses on a 1–5 scale. Item-specific sample sizes are shown below. Text comments are counted but never displayed in this report.</dd></div>
      </dl>
    </Section>
    <Section title="Predefined skills-gap test cases" icon={CheckCircle2}>
      <p className="mb-3 text-sm text-slate-600">Fixture pass rate: {metrics?.skillsGapIdentification.passed}/{metrics?.skillsGapIdentification.sampleSize}; {metrics?.skillsGapIdentification.datasetType}</p>
      <div className="space-y-2">{metrics?.skillsGapIdentification.testCases.map((testCase) => <div key={testCase.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><div><p className="font-medium text-slate-800">{testCase.id}</p><p className="text-slate-600">{testCase.description}</p></div><Badge tone={testCase.passed ? 'green' : 'red'}>{testCase.passed ? 'Passed' : 'Failed'}</Badge></div>)}</div>
    </Section>
    <Section title="Assessment performance" icon={FileText}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Stored result rows', metrics?.assessmentPerformance.resultRows, 'Stored assessment result records.'],
        ['Tracked attempts started', metrics?.assessmentPerformance.startedAttempts, 'Recorded when a student opens a published assessment.'],
        ['Tracked attempts completed', metrics?.assessmentPerformance.completedAttempts, 'Assessment submissions linked to a recorded attempt.'],
        ['Scored sample size', metrics?.assessmentPerformance.scoredSampleSize, 'Results with a numeric score.'],
        ['Completion rate', formatPercent(metrics?.assessmentPerformance.completionRate), metrics?.assessmentPerformance.completionRateUnavailableReason || 'Completed attempts divided by tracked starts.'],
      ].map(([label, value, detail]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">{label}: {value}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></div>)}</div>
    </Section>
    <Section title="Career recommendation engagement" icon={Target}>
      <p className="mb-3 text-sm text-slate-600">Latest recorded action for each student-career recommendation pair; updates replace that pair’s previous action rather than inflating counts.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Action sample', metrics?.recommendationEngagement.sampleSize],
        ['Accepted', metrics?.recommendationEngagement.accepted],
        ['Dismissed', metrics?.recommendationEngagement.dismissed],
        ['Explored', metrics?.recommendationEngagement.explored],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{numberOrUnavailable(value)}</p></div>)}</div>
      {metrics?.recommendationEngagement.unavailableReason ? <p className="mt-3 text-sm text-amber-800">{metrics.recommendationEngagement.unavailableReason}</p> : null}
    </Section>
    <Section title="Matching reference set" icon={Target}>
      <p className="mb-4 text-sm leading-6 text-slate-600">Add reviewed examples from real published jobs and stored candidate match scores. The current classification threshold is 60/100. Labels should be reviewed against job requirements; they are not automatically treated as ground truth without human review.</p>
      <form onSubmit={saveReview} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Candidate<select required className={`${INPUT} mt-1`} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}><option value="">Select candidate</option>{setup.students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Published job<select required className={`${INPUT} mt-1`} value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Select job</option>{setup.jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Reviewed outcome<select required className={`${INPUT} mt-1`} value={expectedMatch} onChange={(event) => setExpectedMatch(event.target.value)}><option value="">Select outcome</option><option value="yes">Suitable match</option><option value="no">Not a suitable match</option></select></label>
        <div className="flex items-end"><Button type="submit" disabled={savingReview}>{savingReview ? 'Saving…' : 'Save reviewed example'}</Button></div>
        {reviewError ? <p role="alert" className="sm:col-span-2 text-sm text-rose-700">{reviewError}</p> : null}
        {reviewNotice ? <p role="status" className="sm:col-span-2 text-sm text-emerald-700">{reviewNotice}</p> : null}
      </form>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Reviewed sample', metrics?.matchingAccuracy.reviewedExamples],
        ['Scored sample', metrics?.matchingAccuracy.sampleSize],
        ['Unscored reviewed examples', metrics?.matchingAccuracy.unscoredExamples],
        ['Accuracy', `${formatPercent(metrics?.matchingAccuracy.accuracy)} · n=${metrics?.matchingAccuracy.sampleSize || 0}`],
        ['Precision', `${formatPercent(metrics?.matchingAccuracy.precision)} · n=${metrics?.matchingAccuracy.precisionSampleSize || 0} predicted suitable`],
        ['Recall', `${formatPercent(metrics?.matchingAccuracy.recall)} · n=${metrics?.matchingAccuracy.recallSampleSize || 0} reviewed suitable`],
        ['F1', `${formatPercent(metrics?.matchingAccuracy.f1)} · n=${metrics?.matchingAccuracy.sampleSize || 0} scored examples`],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{numberOrUnavailable(value)}</p></div>)}</div>
      {metrics?.matchingAccuracy.unavailableReason ? <p className="mt-3 text-sm text-amber-800">{metrics.matchingAccuracy.unavailableReason}</p> : null}
      {setup.reviews.length ? <div className="mt-4 space-y-2">{setup.reviews.map((review) => <div key={review.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span>{review.candidate_name} × {review.job_title}</span><span>{review.expected_match ? 'Reviewed suitable' : 'Reviewed not suitable'} · {new Date(review.reviewed_at).toLocaleDateString()}</span></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No reviewed candidate-job examples yet.</p>}
    </Section>
    <Section title="Usability and user satisfaction" icon={Users}>
      <p className="mb-3 text-sm text-slate-600">{metrics?.usability.respondentCount} unique responses for questionnaire v1. Responses are updated per account rather than duplicated.</p>
      <div className="space-y-2">{metrics?.usability.questions.map((question) => <div key={question.label} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span className="font-medium text-slate-800">{question.label}</span><span>{formatAverage(question.average)} · n={question.sampleSize}</span></div>)}</div>
      <h3 className="mt-5 font-semibold text-slate-900">Overall satisfaction by workflow</h3>
      <div className="mt-2 space-y-2">{metrics?.usability.byWorkflow.map((workflow) => <div key={workflow.workflow} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span className="font-medium text-slate-800">{workflow.label}</span><span>{formatAverage(workflow.average)} · {workflow.respondentCount} respondents · n={workflow.sampleSize}</span></div>)}</div>
      <p className="mt-3 text-sm text-slate-600">Open comments submitted: {metrics?.usability.openFeedbackCount}. Comments are not exposed in this report.</p>
    </Section>
  </div>
}

function ReportsAdminView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reportType, setReportType] = useState('overview')
  const [report, setReport] = useState(null)
  const [dateRange, setDateRange] = useState('all')

  useEffect(() => {
    let active = true
    adminService.getDashboard(dateRange)
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load report data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey, dateRange])

  const refresh = () => {
    setLoading(true)
    setError('')
    setReport(null)
    setRefreshKey((key) => key + 1)
  }
  const reportRows = {
    overview: [
      ['Total users', data?.metrics.users],
      ['Student profiles', data?.metrics.studentProfiles],
      ['Employers', data?.metrics.employers],
      ['Published jobs', data?.metrics.jobs],
      ['All job records', data?.metrics.jobsTotal],
      ['Draft jobs', data?.metrics.draftJobs],
      ['Closed jobs', data?.metrics.closedJobs],
      ['Archived jobs', data?.metrics.archivedJobs],
      ['Demo jobs', data?.metrics.demoJobs],
      ['Applications', data?.metrics.applications],
      ['Interviews', data?.metrics.interviews],
      ['Employment records', data?.metrics.employment],
      ['Active employment records', data?.metrics.activeEmployment],
      ['Assessments', data?.metrics.assessments],
      ['Published assessments', data?.metrics.publishedAssessments],
      ['Draft assessments', data?.metrics.draftAssessments],
      ['Archived assessments', data?.metrics.archivedAssessments],
    ],
    opportunities: [
      ['Published jobs', data?.metrics.jobs],
      ['Draft jobs', data?.metrics.draftJobs],
      ['Closed jobs', data?.metrics.closedJobs],
      ['Archived jobs', data?.metrics.archivedJobs],
      ['Demo jobs', data?.metrics.demoJobs],
      ['Applications', data?.metrics.applications],
      ['Interviews', data?.metrics.interviews],
      ['Employment records', data?.metrics.employment],
      ['Employers', data?.metrics.employers],
    ],
    content: [
      ['Published resources', data?.metrics.resources],
      ['Draft resources', data?.metrics.draftResources],
      ['Archived resources', data?.metrics.archivedResources],
      ['Demo resources', data?.metrics.demoResources],
      ['Skills in taxonomy', data?.metrics.skills],
      ['Career definitions', data?.metrics.careers],
      ['Assessments', data?.metrics.assessments],
      ['Draft assessments', data?.metrics.draftAssessments],
      ['Archived assessments', data?.metrics.archivedAssessments],
    ],
  }
  const reportLabels = { overview: 'Platform overview', opportunities: 'Jobs & applications', content: 'Platform content' }

  const generateReport = () => {
    if (!data) return
    const rows = [
      { label: 'Date range', value: data.dateRange?.label || 'All time' },
      ...reportRows[reportType].map(([label, value]) => ({ label, value: value ?? 0 })),
    ]
    const quote = (value) => `"${String(value).replaceAll('"', '""')}"`
    const csv = [['Metric', 'Value'], ...rows.map(({ label, value }) => [label, value])]
      .map((row) => row.map(quote).join(','))
      .join('\r\n')
    setReport({
      title: reportLabels[reportType],
      rows,
      csv,
      dateRange: data.dateRange?.label || 'All time',
      generatedAt: new Date().toISOString(),
    })
  }

  const downloadReport = () => {
    if (!report) return
    const file = new Blob([`\uFEFF${report.csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `skillbridge-${reportType}-report-${report.generatedAt.slice(0, 10)}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return <div className="space-y-6"><Header title="Reports" description="Generate and download current reports from recorded platform data." /><div className="h-48 animate-pulse rounded-2xl bg-slate-100" /></div>
  }

  if (error && !data) {
    return <div className="space-y-6"><Header title="Reports" description="Generate and download current reports from recorded platform data." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>
  }

  return (
    <div className="space-y-6">
      <Header title="Reports" description="Generate downloadable summaries from current database records, with a selectable record date range." />
      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm font-medium text-slate-700">Report type
            <select className={`${INPUT} mt-1.5`} value={reportType} onChange={(event) => { setReportType(event.target.value); setReport(null) }}>
              {Object.entries(reportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Date range
            <select className={`${INPUT} mt-1.5`} value={dateRange} onChange={(event) => { setLoading(true); setReport(null); setDateRange(event.target.value) }}>
              {ADMIN_DASHBOARD_DATE_RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateReport} disabled={!data || loading}><FileText size={16} />Generate report</Button>
            <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh data'}</Button>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">Counts come from database records in the selected range. Only explicitly tagged demo records are excluded from platform-published job and resource totals. No personal applicant data is included.</p>
      </Card>
      {error ? <QueryError message={`Showing the last successfully loaded snapshot. ${error}`} /> : null}

      {report ? (
        <Section title={report.title} icon={FileText} action={<Button variant="outline" size="sm" onClick={downloadReport}><Download size={15} />Download CSV</Button>}>
          <p className="mb-4 text-sm text-slate-500">Generated {new Date(report.generatedAt).toLocaleString()} · Date range: {report.dateRange}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3 font-semibold">Metric</th><th className="px-3 py-3 text-right font-semibold">Value</th></tr></thead>
              <tbody>{report.rows.map(({ label, value }) => <tr key={label} className="border-b border-slate-100 last:border-0"><th scope="row" className="px-3 py-3 font-medium text-slate-700">{label}</th><td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{value}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      ) : (
        <EmptyState>Select a report type and generate a preview. You can then download the report as a CSV file.</EmptyState>
      )}
    </div>
  )
}

function DataQualityView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getDataQualityOverview()
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load data quality checks.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }

  if (loading && !data) return <div className="space-y-6"><Header title="Data Quality" description="Review record integrity across platform data." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (error && !data) return <div className="space-y-6"><Header title="Data Quality" description="Review record integrity across platform data." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>

  const summary = data.summary || {}

  return (
    <div className="space-y-6">
      <Header title="Data Quality" description="Review record integrity and validation coverage across platform data. Live service availability is shown in System Health." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{summary.checkedAt ? `Last checked ${new Date(summary.checkedAt).toLocaleString()}` : 'Data quality check results'}</p>
        <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Checking…' : 'Run checks again'}</Button>
      </div>
      {error ? <QueryError message={`Showing the last successfully loaded results. ${error}`} /> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4"><p className="text-sm text-slate-500">Records checked</p><p className="mt-2 text-3xl font-bold">{summary.totalRecordsChecked ?? 0}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">Valid records</p><p className="mt-2 text-3xl font-bold">{summary.validRecords ?? 0}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">Require attention</p><p className="mt-2 text-3xl font-bold">{summary.recordsNeedingAttention ?? 0}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">Quality score</p><p className="mt-2 text-3xl font-bold">{summary.totalRecordsChecked ? `${summary.dataQualityScore ?? 0}%` : '—'}</p><p className="mt-1 text-xs text-slate-500">{summary.totalRecordsChecked ? 'Valid records / all records checked' : 'No records checked yet'}</p></Card>
      </div>

      <Section title="Entity checks" icon={Target}>
        <div className="space-y-3">
          {(data.sections || []).length ? data.sections.map((section) => (
            <div key={section.entity} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{section.entity}</p>
                  <p className="text-sm text-slate-500">{section.description}</p>
                </div>
                <Badge tone={section.issues ? 'amber' : 'green'}>{section.issues ? `${section.issues} issues` : 'Clean'}</Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total</p><p className="text-xl font-bold">{section.total ?? 0}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-[0.12em] text-slate-500">Valid</p><p className="text-xl font-bold">{section.valid ?? 0}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attention</p><p className="text-xl font-bold">{section.issues ?? 0}</p></div>
              </div>
            </div>
          )) : <EmptyState>No data quality records were available for the current workspace.</EmptyState>}
        </div>
      </Section>

      <Section title="Detected issues" icon={AlertTriangle} action={<span className="text-sm text-slate-500">{(data.issues || []).length} total</span>}>
        {(data.issues || []).length ? <><div className="space-y-3">{data.issues.slice(0, 12).map((issue, index) => <div key={`${issue.entity}-${issue.recordId}-${index}`} className="rounded-xl border border-slate-200 p-3"><p className="font-medium text-slate-800">{issue.entity} · <span className="font-mono text-xs">{issue.recordId}</span></p><p className="mt-1 text-sm text-slate-600">{issue.problem}</p><p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">{issue.severity} · {issue.status}</p></div>)}</div>{data.issues.length > 12 ? <p className="mt-4 text-sm text-slate-500">Showing the first 12 issues of {data.issues.length}. Use the entity counts above to locate other affected records.</p> : null}</> : <EmptyState>No integrity issues were detected in the records currently checked.</EmptyState>}
      </Section>
    </div>
  )
}

const SYSTEM_HEALTH_TONES = {
  operational: 'green',
  degraded: 'amber',
  unavailable: 'red',
  not_configured: 'amber',
  not_verified: 'amber',
  unknown: 'slate',
}

function SystemHealthView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getSystemHealth()
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load system health checks.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }

  if (loading && !data) {
    return <div className="space-y-6"><Header title="System Health" description="Check platform service availability and recent incidents." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>
  }
  if (error && !data) {
    return <div className="space-y-6"><Header title="System Health" description="Check platform service availability and recent incidents." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>
  }

  const incidents = data.incidents || {}
  const counts = incidents.counts || {}
  return (
    <div className="space-y-6">
      <Header title="System Health" description="Live checks for platform services. A service is marked operational only after its check succeeds." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Overall status: <Badge tone={SYSTEM_HEALTH_TONES[data.status] || 'slate'}>{data.status || 'unknown'}</Badge>
          {data.checkedAt ? ` · Checked ${new Date(data.checkedAt).toLocaleString()}` : ''}
        </p>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking…' : 'Refresh checks'}
        </Button>
      </div>
      {error ? <QueryError message={`Showing the last successful health response. ${error}`} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data.checks || []).map((check) => (
          <Card key={check.key} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{check.label}</h3>
              <Badge tone={SYSTEM_HEALTH_TONES[check.status] || 'slate'}>{(check.status || 'unknown').replaceAll('_', ' ')}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{check.message}</p>
            <dl className="mt-4 space-y-1 text-xs text-slate-500">
              <div><dt className="inline font-medium">Last checked: </dt><dd className="inline">{check.checkedAt ? new Date(check.checkedAt).toLocaleString() : 'Not checked'}</dd></div>
              <div><dt className="inline font-medium">Last successful check: </dt><dd className="inline">{check.lastSuccessfulAt ? new Date(check.lastSuccessfulAt).toLocaleString() : 'None recorded'}</dd></div>
              {Number.isFinite(check.responseTimeMs) ? <div><dt className="inline font-medium">Response time: </dt><dd className="inline">{check.responseTimeMs} ms</dd></div> : null}
              {check.errorCode ? <div><dt className="inline font-medium">Diagnostic code: </dt><dd className="inline">{check.errorCode}</dd></div> : null}
            </dl>
          </Card>
        ))}
      </div>

      <Section title="Recent incidents (24 hours)" icon={AlertTriangle}>
        {incidents.available ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ['Recorded API error samples', counts.apiErrors],
                ['Recorded rate-limit samples', counts.rateLimitEvents],
                ['Rejected API-token samples', counts.failedAuthentication],
                ['Client-reported failed sign-ins', counts.reportedSignInFailures],
                ['Service-check failure samples', counts.serviceFailures],
              ].map(([label, count]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{count ?? '—'}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">{incidents.message} Repeated events are sampled to reduce noise. Sign-in failures are privacy-safe browser reports and may not include all Supabase Auth activity; compare with Supabase Auth logs.</p>
            {incidents.recent?.length ? (
              <div className="mt-4 space-y-2">
                {incidents.recent.map((incident) => (
                  <div key={incident.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{incident.message}</p>
                      <Badge tone={incident.severity === 'error' ? 'red' : 'amber'}>{incident.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {incident.service.replaceAll('_', ' ')}
                      {incident.route_category ? ` · ${incident.route_category} API` : ''}
                      {incident.http_status ? ` · HTTP ${incident.http_status}` : ''}
                      {` · ${new Date(incident.occurred_at).toLocaleString()}`}
                    </p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">No incidents are currently recorded.</p>}
          </>
        ) : <QueryError message={incidents.message || 'Incident history is unavailable.'} />}
      </Section>
    </div>
  )
}

function SecurityOverviewView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getSecurityOverview()
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load the security overview.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }

  if (loading && !data) return <div className="space-y-6"><Header title="Security Overview" description="Review configured application security controls and known gaps." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>
  if (error && !data) return <div className="space-y-6"><Header title="Security Overview" description="Review configured application security controls and known gaps." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>

  return (
    <div className="space-y-6">
      <Header title="Security Overview" description="Review application-level security configuration, implemented controls, and known gaps. This is not a live infrastructure audit or penetration test." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{data.note} {data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}.` : ''}</p>
        <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh overview'}</Button>
      </div>
      {error ? <QueryError message={`Showing the last successfully loaded overview. ${error}`} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data.checks || []).map((check) => (
          <Card key={check.key} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{check.label}</h3>
              <Badge tone={check.tone || 'slate'}>{check.status}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{check.description}</p>
          </Card>
        ))}
      </div>

      <Section title="Active control set" icon={ShieldCheck}>
        <ul className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          {(data.controls || []).map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-sky-700" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function AiMonitoringView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    adminService.getAiMonitoring()
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load AI monitoring records.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setError('')
    setRefreshKey((key) => key + 1)
  }
  const metrics = [
    ['Monitored requests', data?.metrics.requests, 'ai_request_events'],
    ['Successful requests', data?.metrics.successfulRequests, 'ai_request_events'],
    ['Fallback responses', data?.metrics.fallbackRequests, 'ai_request_events'],
    ['Validation errors', data?.metrics.validationErrors, 'ai_request_events'],
    ['Unavailable requests', data?.metrics.unavailableRequests, 'ai_request_events'],
    ['Request failures', data?.metrics.failedRequests, 'ai_request_events'],
    ['Gemini availability (24h)', data?.metrics.geminiAvailability24h, 'Google Gemini responses'],
    ['Stored recommendations', data?.metrics.recommendations, 'ai_recommendations'],
    ['Feedback records', data?.metrics.feedback, 'ai_feedback'],
    ['Career recommendation feedback', data?.metrics.careerFeedback, 'career_feedback'],
    ['Decision logs', data?.metrics.decisions, 'ai_decision_logs'],
    ['Open review items', data?.metrics.openReviews, 'ai_review_queue'],
    ['Governance events', data?.metrics.governanceEvents, 'ai_governance_events'],
    ['Career recommendations', data?.metrics.careerRecommendations, 'career_recommendations'],
    ['Job matches', data?.metrics.jobMatches, 'job_matches'],
  ]
  const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Date unavailable'
  const formatValue = (value) => String(value || 'Not recorded').replaceAll('_', ' ')
  const statusTone = (status) => ['validated', 'approved', 'resolved', 'closed', 'passed', 'success', 'ok'].includes(String(status).toLowerCase()) ? 'green' : ['failed', 'rejected', 'critical', 'invalid', 'unavailable', 'validation_error', 'failure'].includes(String(status).toLowerCase()) ? 'red' : ['open', 'pending', 'review', 'fallback'].includes(String(status).toLowerCase()) ? 'amber' : 'slate'
  const feedbackActivity = [
    ...(data?.feedback || []).map((item) => ({ ...item, source: 'AI recommendation' })),
    ...(data?.careerFeedback || []).map((item) => ({ ...item, source: 'Career recommendation' })),
  ].sort((first, second) => new Date(second.created_at) - new Date(first.created_at)).slice(0, 20)
  const requestIssues = (data?.requestEvents || []).filter((item) => (
    ['fallback', 'validation_error', 'unavailable', 'failure'].includes(item.request_outcome)
  ))

  if (loading && !data) {
    return <div className="space-y-6"><Header title="AI Monitoring" description="Review stored AI decisions, governance records, and human review activity." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}</div><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /></div>
  }
  if (error && !data) {
    return <div className="space-y-6"><Header title="AI Monitoring" description="Review stored AI decisions, governance records, and human review activity." /><QueryError message={error} /><Button variant="outline" onClick={refresh}><RefreshCw size={16} />Try again</Button></div>
  }

  return (
    <div className="space-y-6">
      <Header title="AI Monitoring" description="Review stored AI and recommendation records. This page does not generate recommendations or expose private user prompts, outputs, or feedback comments." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Request counts are exact. Activity lists show up to 20 recent records; Gemini availability uses the last 24 hours.</p>
        <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Refreshing…' : 'Refresh monitoring data'}</Button>
      </div>
      {error ? <QueryError message={`Showing the last successfully loaded records. ${error}`} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, source]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value === null ? '—' : value ?? 0}{label === 'Gemini availability (24h)' && value !== null ? '%' : ''}</p>
            <p className="mt-1 text-xs text-slate-400">Source: {source}</p>
          </Card>
        ))}
      </div>

      <Section title="Recent AI requests" icon={Activity}>
        {data.requestEvents.length ? <div className="space-y-3">{data.requestEvents.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold capitalize text-slate-900">{formatValue(item.feature_type)}</p>
              <div className="flex gap-2"><Badge tone={statusTone(item.request_outcome)}>{formatValue(item.request_outcome)}</Badge><Badge tone={statusTone(item.validation_status)}>{formatValue(item.validation_status)}</Badge></div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{formatValue(item.model_provider)} · {formatValue(item.model_identifier)} · {item.duration_ms} ms · HTTP {item.http_status}</p>
            <p className="mt-1 text-xs text-slate-500">Provider: {formatValue(item.provider_status)}{item.error_category ? ` · Error category: ${formatValue(item.error_category)}` : ''}{item.provider_response_id ? ` · Provider reference: ${item.provider_response_id}` : ''}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
          </div>
        ))}</div> : <EmptyState>No AI requests have been recorded yet.</EmptyState>}
      </Section>

      <Card className="border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">Gemini availability: {data.metrics.geminiAvailability24h === null ? 'No Gemini requests in the last 24 hours.' : `${data.metrics.geminiAvailability24h}% of attempted Gemini requests received a provider response.`}</p>
        <p className="mt-1 text-xs text-slate-500">{data.metrics.geminiRequests24h} Gemini requests were attempted in the last 24 hours. Prompts, CV contents, and AI response bodies are not stored in these telemetry records.</p>
      </Card>

      <Card className="border-amber-200 bg-amber-50/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">Fairness assessment</h3><p className="mt-1 text-sm text-slate-600">Comparable-group fairness metrics are not configured in this monitoring view.</p></div>
          <Badge tone="slate">Not assessed</Badge>
        </div>
      </Card>

      <Section title="Review queue activity" icon={AlertTriangle} action={<Badge tone={data.metrics.openReviews ? 'amber' : 'green'}>{data.metrics.openReviews} open</Badge>}>
        {data.reviewQueue.length ? <div className="space-y-3">{data.reviewQueue.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold capitalize text-slate-900">{formatValue(item.feature_type)}</p>
              <div className="flex gap-2"><Badge tone={statusTone(item.severity)}>{formatValue(item.severity)}</Badge><Badge tone={statusTone(item.review_status)}>{formatValue(item.review_status)}</Badge></div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}{item.recommendation_id ? ` · Recommendation ${item.recommendation_id}` : ''}</p>
          </div>
        ))}</div> : <EmptyState>No AI items are currently in the human review queue.</EmptyState>}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="AI decision logs" icon={Sparkles}>
          {data.decisions.length ? <><p className="mb-3 text-xs text-slate-500">Most recent 20 decision records. Failure entries here are not a complete historical error log.</p><div className="space-y-3">{data.decisions.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-slate-900">{formatValue(item.feature_type)}</p><Badge tone={statusTone(item.validation_status)}>{formatValue(item.validation_status)}</Badge></div>
              <p className="mt-2 text-sm text-slate-600">{formatValue(item.model_provider)} · {formatValue(item.model_version)}</p>
              <p className="mt-1 text-xs text-slate-500">Confidence: {formatValue(item.confidence_score)}{item.related_entity_type ? ` · Related: ${formatValue(item.related_entity_type)}` : ''}</p>
              <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
            </div>
          ))}</div></> : <EmptyState>No AI decision logs have been recorded.</EmptyState>}
        </Section>
        <Section title="Governance events" icon={ShieldCheck}>
          {data.governanceEvents.length ? <div className="space-y-3">{data.governanceEvents.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4"><p className="font-semibold capitalize text-slate-900">{formatValue(item.event_type)}</p><p className="mt-2 text-sm text-slate-600">{item.summary}</p><p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p></div>
          ))}</div> : <EmptyState>No AI governance events have been recorded.</EmptyState>}
        </Section>
      </div>

      <Section title="Recent failures and validation issues" icon={AlertTriangle} action={<span className="text-sm text-slate-500">From latest request and decision records</span>}>
        {requestIssues.length || data.errors.length ? <div className="space-y-3">
          {requestIssues.map((item) => (
            <div key={`request-${item.id}`} className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-slate-900">{formatValue(item.feature_type)}</p><Badge tone={statusTone(item.request_outcome)}>{formatValue(item.request_outcome)}</Badge></div>
              <p className="mt-2 text-sm text-slate-600">{formatValue(item.model_provider)} · {formatValue(item.model_identifier)} · {formatValue(item.error_category)}</p>
              <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
            </div>
          ))}
          {data.errors.map((item) => (
          <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-slate-900">{formatValue(item.feature_type)}</p><Badge tone="red">{formatValue(item.validation_status)}</Badge></div>
            <p className="mt-2 text-sm text-slate-600">{formatValue(item.model_provider)} · {formatValue(item.model_version)}</p>
            <p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
          </div>
          ))}
        </div> : <EmptyState>{data.decisions.length ? 'No failed, invalid, or error validation status appears in the latest request or decision records.' : 'No request or decision logs are available to check for validation failures.'}</EmptyState>}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Stored recommendations" icon={Sparkles}>
          {data.recommendations.length ? <div className="space-y-3">{data.recommendations.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-slate-900">{formatValue(item.recommendation_type)}</p>{item.feedback_status ? <Badge tone={statusTone(item.feedback_status)}>{formatValue(item.feedback_status)}</Badge> : null}</div>
              <p className="mt-2 text-sm text-slate-600">{item.model_name || 'Model not recorded'}</p><p className="mt-2 text-xs text-slate-400">{formatDate(item.created_at)}</p>
            </div>
          ))}</div> : <EmptyState>No stored AI recommendation records have been recorded. This does not indicate that no other platform matching or deterministic recommendation activity has occurred.</EmptyState>}
        </Section>
        <Section title="Feedback activity" icon={Activity}>
          {feedbackActivity.length ? <div className="space-y-3">{feedbackActivity.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div><p className="font-medium text-slate-900">{item.source}{item.suitability_rating ? ` · suitability ${item.suitability_rating}/5` : item.is_useful ? ' · marked useful' : ' · marked not useful'}</p>{item.recommendation_id ? <p className="mt-1 text-xs text-slate-500">Recommendation {item.recommendation_id}</p> : null}</div>
              <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
            </div>
          ))}</div> : <EmptyState>No recommendation feedback has been recorded.</EmptyState>}
        </Section>
      </div>
    </div>
  )
}

function InterviewPolicyReportsView() {
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [savingId, setSavingId] = useState('')
  const [notes, setNotes] = useState({})
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    adminService.getInterviewPolicyReports(status)
      .then((result) => {
        if (!active) return
        setReports(result)
        setLoadError(null)
        setUpdatedAt(Date.now())
      })
      .catch((error) => {
        if (active) setLoadError(error)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [status, refreshKey])

  const review = async (report, nextStatus) => {
    setSavingId(report.id)
    setActionError(null)
    setNotice('')
    try {
      await adminService.reviewInterviewPolicyReport(report.id, nextStatus, notes[report.id] || '')
      setNotice('Interview report review saved.')
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setActionError(error)
    } finally {
      setSavingId('')
    }
  }

  const categoryLabel = (value) => INTERVIEW_REPORT_CATEGORIES.find((item) => item.value === value)?.label || 'Other concern'
  return <div className="space-y-6">
    <Header title="Interview Reports" description="Review reports from students about interview instructions. Reports are visible only to the reporting student and authorised administrators." />
    <Section title="Review queue" icon={ShieldCheck} action={<label className="text-sm font-medium text-slate-600">Status <select className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option></select></label>}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LastUpdated value={updatedAt} />
        <Button type="button" variant="outline" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</Button>
      </div>
      {actionError ? <div className="mb-3"><RequestError error={actionError} fallback="The review could not be saved." /></div> : null}
      {notice ? <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      {loadError ? <div className="space-y-3"><RequestError error={loadError} fallback="Interview reports could not be loaded." /><Button type="button" variant="outline" onClick={() => setRefreshKey((key) => key + 1)}>Try again</Button></div> : loading ? <div role="status" className="space-y-3"><div className="h-28 animate-pulse rounded-xl bg-slate-100" /><div className="h-28 animate-pulse rounded-xl bg-slate-100" /></div> : reports.length ? <div className="space-y-4">
        {reports.map((report) => {
          const interview = report.interviews
          const application = interview?.applications
          const title = application?.jobs?.title || 'Interview'
          return <article key={report.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold text-slate-900">{categoryLabel(report.category)}</p><p className="mt-1 text-sm text-slate-600">{report.profiles?.full_name || 'Student'} · {report.profiles?.email || 'Email unavailable'}</p><p className="mt-1 text-sm text-slate-500">{title} · Interview {interview?.scheduled_at ? formatInterviewDateTime(interview.scheduled_at) : 'time unavailable'}</p></div>
              <Badge tone={report.status === 'resolved' ? 'green' : report.status === 'dismissed' ? 'slate' : report.status === 'reviewing' ? 'blue' : 'amber'}>{report.status.replaceAll('_', ' ')}</Badge>
            </div>
            {report.details ? <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{report.details}</p> : <p className="mt-3 text-sm italic text-slate-500">No additional details provided.</p>}
            {report.resolution_note ? <p className="mt-3 text-sm text-slate-600"><span className="font-medium">Review note:</span> {report.resolution_note}</p> : null}
            {['open', 'reviewing'].includes(report.status) ? <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Internal review note<textarea className={`${INPUT} mt-1 min-h-20`} maxLength={2000} value={notes[report.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} /></label>
              <div className="flex flex-wrap gap-2">
                {report.status === 'open' ? <Button type="button" variant="outline" size="sm" disabled={Boolean(savingId)} onClick={() => void review(report, 'reviewing')}>Mark reviewing</Button> : null}
                <Button type="button" size="sm" disabled={Boolean(savingId)} onClick={() => void review(report, 'resolved')}>{savingId === report.id ? 'Saving…' : 'Resolve'}</Button>
                <Button type="button" variant="outline" size="sm" disabled={Boolean(savingId)} onClick={() => void review(report, 'dismissed')}>Dismiss</Button>
              </div>
            </div> : null}
            <p className="mt-3 text-xs text-slate-400">Reported {report.created_at ? new Date(report.created_at).toLocaleString() : 'time unavailable'}</p>
          </article>
        })}
      </div> : <EmptyState>No interview reports match this status.</EmptyState>}
    </Section>
  </div>
}

export default function AdminModulePage({ mode = 'dashboard' }) { const { id } = useParams(); const { pathname } = useLocation(); const content = mode === 'dashboard' ? <AdminDashboard /> : mode === 'users' ? <UsersView detailId={id} /> : mode === 'employers' ? <EmployersView detailId={id} /> : mode === 'employer-verifications' ? <EmployerVerificationReviewsView /> : mode === 'interview-reports' ? <InterviewPolicyReportsView /> : mode === 'jobs' ? <JobsView detailId={id} /> : mode === 'skills' ? <SkillsCatalogView /> : mode === 'careers' ? <CareerAdminView detailId={id} editing={pathname.endsWith('/edit')} creating={pathname.endsWith('/create')} /> : mode === 'learning' ? <LearningAdminView id={id} editing={pathname.endsWith('/edit')} creating={pathname.endsWith('/create')} /> : mode === 'opportunities' ? <CareerOpportunityAdminView /> : mode === 'certificates' ? <CertificateReviewsView /> : mode === 'evaluation' ? <EvaluationReportView /> : mode === 'assessments' ? pathname.endsWith('/create') ? <Navigate to="/admin/assessments" replace /> : pathname.endsWith('/edit') ? <Navigate to={`/admin/assessments/${id}`} replace /> : <AssessmentsAdminView id={id} /> : mode === 'applications' ? <ApplicationsAdminView id={id} /> : mode === 'audit' ? <AuditLogsView /> : mode === 'reports' ? <ReportsAdminView /> : mode === 'settings' ? <AdminSettingsView /> : mode === 'analytics' ? <AnalyticsView /> : mode === 'data-quality' ? <DataQualityView /> : mode === 'health' ? <SystemHealthView /> : mode === 'security' ? <SecurityOverviewView /> : mode === 'ai' ? <AiMonitoringView /> : mode === 'labour-market' ? <LabourMarketModulePage /> : <SimpleAdminList mode={mode} />; return <AppShell title={CONFIG[mode]?.[0] || 'Administration'} subtitle={CONFIG[mode]?.[1] || ''} showBackButton={mode === 'dashboard'}>{content}</AppShell> }
