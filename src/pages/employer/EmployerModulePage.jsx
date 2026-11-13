import { ArrowLeft, ArrowRight, BarChart3, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2, FileText, Layers3, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Target, TrendingUp, Users, UserCheck, ClipboardCheck, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { analyticsService } from '../../services/analyticsService'
import { candidateService } from '../../services/candidateService'
import { formatApplicationStatus, normalizeApplicationStatus } from '../../services/applicationService'
import { companyService } from '../../services/companyService'
import { employerService } from '../../services/employerService'
import { feedbackService } from '../../services/feedbackService'
import { interviewService } from '../../services/interviewService'
import { jobService } from '../../services/jobService'
import { INTERNSHIP_TYPES } from '../../services/internshipService'
import { notificationService } from '../../services/notificationService'
import { offerService } from '../../services/offerService'
import { AppShell } from '../../components/layout/AppShell'
import { skillService } from '../../services/skillService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { ProfilePictureUploader } from '../../components/ui/ProfilePictureUploader'
import { detectSkillsInJob } from '../../utils/skillDetection'
import { buildJobAssessment } from '../../utils/jobAssessmentGenerator'
import { compareAssessmentsForDuplicates } from '../../utils/duplicateDetection'
import { validateCompanyLogoFile } from '../../utils/companyLogoValidation'
import {
  validateEmployerVerificationDocument,
} from '../../utils/employerVerificationValidation'
import { filterSkillCatalog, isSelectableSkill, SKILL_CATEGORIES } from '../../utils/skillCatalog'
import { EMPLOYER_JOB_TYPES, validateEmployerJob } from '../../utils/employerJobValidation'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { LastUpdated, RequestError } from '../../components/ui/RequestState'
import { InterviewConductNotice } from '../../components/interviews/InterviewConductNotice'
import { APPLICATION_LIFECYCLE } from '../../constants/database'
import { applicationStatusTone, isApplicationInProgress, isApplicationTerminal } from '../../utils/applicationStatus.js'
import { formatInterviewDateTime, getLocalTimeZone, getSafeMeetingUrl, toLocalInterviewDateTime, validateInterviewMeetingUrl } from '../../utils/interviewPolicy'

const CONFIG = {
  company: ['Company Profile', 'Present your organisation clearly to future candidates.'],
  jobs: ['Jobs', 'Create, publish and manage your open opportunities.'],
  candidates: ['Candidates', 'Review candidates connected to your employer-owned jobs.'],
  applications: ['Applications', 'Move applications through a documented hiring journey.'],
  recruitment: ['Recruitment', 'Manage the pipeline without losing historical events.'],
  interviews: ['Interviews', 'Schedule and review interviews for your applications.'],
  employees: ['Employees', 'Track people hired through SkillBridge.'],
  analytics: ['Analytics', 'Understand your hiring activity from recorded data.'],
  notifications: ['Notifications', 'Review employer-side updates and reminders.'],
  feedback: ['Feedback', 'Record competency feedback for candidates you have legitimately worked with.'],
  settings: ['Settings', 'Manage company-facing preferences.'],
}

const INPUT = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'
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

function EmptyState({ children, to, action = 'Get started' }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">{children}{to ? <Link to={to} className="mt-3 inline-flex items-center font-semibold text-sky-700">{action}<ArrowRight size={15} className="ml-1" /></Link> : null}</div>
}

function LoadError({ message, onRetry }) {
  return <RequestError error={message} fallback="We could not load this employer information." onRetry={onRetry} retryLabel="Retry" />
}

function Header({ title, description, back }) {
  return <div className="mb-6">{back ? <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"><ArrowLeft size={15} /> Back</Link> : null}<p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Employer workspace</p><h2 className="mt-1 text-3xl font-bold text-slate-900">{title}</h2><p className="mt-2 text-slate-600">{description}</p></div>
}

function Section({ title, icon: Icon, children, action }) {
  return <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon size={19} className="text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">{title}</h3></div>{action}</div>{children}</Card>
}

function CompanyEditor({ employerId, showPicture = false }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [logoMessage, setLogoMessage] = useState('')
  const logoInput = useRef(null)
  const logoPreviewRef = useRef('')
  const [verificationSubmissions, setVerificationSubmissions] = useState([])
  const [verificationForm, setVerificationForm] = useState({
    legal_business_name: '',
    registration_number: '',
    registration_authority: '',
    registration_country: 'Malawi',
    representative_name: '',
    representative_role: '',
  })
  const [verificationFile, setVerificationFile] = useState(null)
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [verificationMessage, setVerificationMessage] = useState('')
  const verificationInput = useRef(null)

  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      if (!active) return
      setLoading(true)
      setError('')
      try {
        const [result, submissions] = await Promise.all([
          companyService.getProfile(employerId),
          companyService.getVerificationSubmissions(employerId),
        ])
        if (active) {
          setForm(result)
          setVerificationSubmissions(submissions)
          setVerificationForm((current) => ({
            ...current,
            legal_business_name: current.legal_business_name || result.company_name || '',
            registration_country: current.registration_country || result.country || 'Malawi',
          }))
          setError('')
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load the company profile.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [employerId, retry])

  useEffect(() => () => {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current)
  }, [])

  if (!form && error) return <div className="space-y-4"><LoadError message={error} onRetry={() => setRetry((count) => count + 1)} /></div>
  if (loading && !form) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading company profile" />
  if (!form) return null

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setMessage('')
    setError('')
  }
  const save = async (event) => {
    event.preventDefault()
    const requiredFields = ['company_name', 'industry', 'email', 'description']
    if (requiredFields.some((field) => !form[field]?.trim())) {
      setError('Company name, industry, email, and description are required.')
      return
    }
    for (const field of ['website']) {
      if (!form[field]?.trim()) continue
      try {
        const url = new URL(form[field])
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL protocol')
      } catch {
        setError('Website must be a valid HTTP or HTTPS URL.')
        return
      }
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await companyService.updateProfile(employerId, form)
      setForm(saved)
      setMessage('Company profile saved.')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the company profile.')
    } finally {
      setSaving(false)
    }
  }

  const selectLogo = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const validation = validateCompanyLogoFile(file)
    if (!validation.valid) {
      setLogoError(validation.message)
      setLogoFile(null)
      if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current)
      logoPreviewRef.current = ''
      setLogoPreview('')
      event.target.value = ''
      return
    }
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current)
    logoPreviewRef.current = URL.createObjectURL(file)
    setLogoPreview(logoPreviewRef.current)
    setLogoError('')
    setLogoMessage('')
    setLogoFile(file)
  }

  const uploadLogo = async () => {
    if (!logoFile) {
      setLogoError('Choose a PNG or image file first.')
      return
    }
    setLogoBusy(true)
    setLogoError('')
    setLogoMessage('')
    try {
      const updated = await companyService.uploadLogo(employerId, logoFile)
      setForm(updated)
      setLogoFile(null)
      if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current)
      logoPreviewRef.current = ''
      setLogoPreview('')
      setLogoMessage('Company logo uploaded successfully.')
      if (logoInput.current) logoInput.current.value = ''
    } catch (uploadError) {
      setLogoError(uploadError.message || 'Unable to upload the company logo.')
      try {
        setForm(await companyService.getProfile(employerId))
      } catch (refreshError) {
        setLogoError(`${uploadError.message || 'Unable to upload the company logo.'} ${refreshError.message || 'Unable to refresh the company profile.'}`)
      }
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = async () => {
    if (!form.logo_url || !window.confirm('Remove the company logo?')) return
    setLogoBusy(true)
    setLogoError('')
    setLogoMessage('')
    try {
      const updated = await companyService.removeLogo(employerId, form.logo_url)
      setForm(updated)
      setLogoMessage('Company logo removed.')
    } catch (removeError) {
      setLogoError(removeError.message || 'Unable to remove the company logo.')
      try {
        setForm(await companyService.getProfile(employerId))
      } catch (refreshError) {
        setLogoError(`${removeError.message || 'Unable to remove the company logo.'} ${refreshError.message || 'Unable to refresh the company profile.'}`)
      }
    } finally {
      setLogoBusy(false)
    }
  }

  const selectVerificationFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const validation = validateEmployerVerificationDocument(file)
    if (!validation.valid) {
      setVerificationError(validation.message)
      setVerificationFile(null)
      event.target.value = ''
      return
    }
    setVerificationFile(file)
    setVerificationError('')
    setVerificationMessage('')
  }

  const submitVerification = async (event) => {
    event.preventDefault()
    if (!verificationFile) {
      setVerificationError('Choose a business registration certificate, licence, or official organisation letter.')
      return
    }
    setVerificationBusy(true)
    setVerificationError('')
    setVerificationMessage('')
    try {
      const submission = await companyService.submitVerification(employerId, verificationForm, verificationFile)
      setVerificationSubmissions((current) => [submission, ...current])
      setForm((current) => ({ ...current, verification_status: 'pending', verified: false }))
      setVerificationFile(null)
      if (verificationInput.current) verificationInput.current.value = ''
      setVerificationMessage('Your verification request was submitted. You can continue using your employer workspace while it is reviewed.')
    } catch (submitError) {
      setVerificationError(submitError.message || 'Unable to submit employer verification.')
    } finally {
      setVerificationBusy(false)
    }
  }

  return <div className="space-y-6">
    {showPicture ? <ProfilePictureUploader profile={profile} /> : null}
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={save} className="space-y-6">
        <div><h3 className="text-lg font-semibold text-slate-900">Tell candidates about your organisation</h3><p className="mt-1 text-sm text-slate-600">Keep your company details accurate so candidates can learn about the organisation behind each opportunity.</p></div>
        <Section title="Company information" icon={Building2}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Company name</span><input required maxLength={120} className={INPUT} value={form.company_name || ''} onChange={(event) => update('company_name', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Industry</span><input required maxLength={100} className={INPUT} value={form.industry || ''} onChange={(event) => update('industry', event.target.value)} placeholder="e.g. Education, agriculture, technology" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Company email</span><input required type="email" maxLength={254} className={INPUT} value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Phone</span><input type="tel" maxLength={40} className={INPUT} value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Website</span><input type="url" maxLength={2048} className={INPUT} value={form.website || ''} onChange={(event) => update('website', event.target.value)} placeholder="https://example.com" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Country</span><input maxLength={100} className={INPUT} value={form.country || ''} onChange={(event) => update('country', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">District</span><input maxLength={100} className={INPUT} value={form.district || ''} onChange={(event) => update('district', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">City</span><input maxLength={100} className={INPUT} value={form.city || ''} onChange={(event) => update('city', event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Company size</span><input maxLength={60} className={INPUT} value={form.company_size || ''} onChange={(event) => update('company_size', event.target.value)} placeholder="e.g. 11–50 employees" /></label>
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                {logoPreview || form.logo_url
                  ? <img src={logoPreview || form.logo_url} alt="Company logo preview" className="h-full w-full object-contain" />
                  : <Building2 className="text-slate-300" size={32} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Company logo</p>
                <p className="mt-1 text-sm text-slate-600">Upload a PNG, JPEG, or WebP image up to 5 MB.</p>
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a company logo image" onChange={selectLogo} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={logoBusy} onClick={() => logoInput.current?.click()}><Upload size={15} />Choose image</Button>
                  {logoFile ? <Button type="button" size="sm" disabled={logoBusy} onClick={() => void uploadLogo()}>{logoBusy ? 'Uploading…' : 'Upload logo'}</Button> : null}
                  {form.logo_url ? <Button type="button" variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" disabled={logoBusy} onClick={() => void removeLogo()}>{logoBusy ? 'Please wait…' : 'Remove logo'}</Button> : null}
                  {logoFile ? <Button type="button" variant="ghost" size="sm" disabled={logoBusy} onClick={() => { setLogoFile(null); if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current); logoPreviewRef.current = ''; setLogoPreview(''); if (logoInput.current) logoInput.current.value = '' }}>Cancel selection</Button> : null}
                </div>
                {logoFile ? <p className="mt-2 truncate text-xs text-slate-500">Selected: {logoFile.name}</p> : null}
                {logoError ? <p role="alert" className="mt-2 text-sm text-rose-700">{logoError}</p> : null}
                {logoMessage ? <p role="status" className="mt-2 text-sm text-emerald-700">{logoMessage}</p> : null}
              </div>
            </div>
          </div>
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Company description</span><textarea required maxLength={3000} className={`${INPUT} min-h-36`} value={form.description || ''} onChange={(event) => update('description', event.target.value)} placeholder="Describe your organisation, what it does, and the work environment candidates can expect." /><span className="mt-1 block text-right text-xs text-slate-500">{form.description?.length || 0}/3000</span></label>
        </Section>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving || loading}>{saving ? 'Saving...' : 'Save company profile'}</Button>{message ? <span role="status" className="text-sm text-emerald-700">{message}</span> : null}{error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}{loading ? <span role="status" className="text-sm text-slate-500">Refreshing company details…</span> : null}</div>
      </form>
      <div className="space-y-6">
        <Section title="Verification" icon={ShieldCheck}>
          <EmployerVerificationBadge status={form.verification_status} />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            {form.verification_status === 'verified'
              ? 'An administrator approved your submitted company evidence.'
              : form.verification_status === 'pending'
                ? 'Your evidence is awaiting administrator review. You can continue using your employer workspace while it is reviewed.'
                : form.verification_status === 'rejected'
                  ? 'Review the administrator feedback below, then submit corrected information and evidence.'
                  : 'Submit your legal organisation details and supporting evidence to request verification.'}
          </p>
        </Section>
        {form.verification_status !== 'pending' && form.verification_status !== 'verified' ? (
          <Section title={form.verification_status === 'rejected' ? 'Resubmit verification' : 'Request verification'} icon={FileText}>
            <p className="mb-4 text-sm leading-6 text-slate-600">Provide your registered organisation details and upload a business registration certificate, government licence, or official organisation letter. Only PDF, JPEG, and PNG files up to 10 MB are accepted.</p>
            <form className="space-y-4" onSubmit={(event) => void submitVerification(event)}>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Legal business or organisation name</span><input required maxLength={160} className={INPUT} value={verificationForm.legal_business_name} onChange={(event) => setVerificationForm((current) => ({ ...current, legal_business_name: event.target.value }))} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Business registration or licence number</span><input required maxLength={100} className={INPUT} value={verificationForm.registration_number} onChange={(event) => setVerificationForm((current) => ({ ...current, registration_number: event.target.value }))} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Registration authority</span><input required maxLength={160} className={INPUT} placeholder="e.g. Registrar General or government licensing body" value={verificationForm.registration_authority} onChange={(event) => setVerificationForm((current) => ({ ...current, registration_authority: event.target.value }))} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Registration country</span><input required maxLength={100} className={INPUT} value={verificationForm.registration_country} onChange={(event) => setVerificationForm((current) => ({ ...current, registration_country: event.target.value }))} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Authorised representative</span><input required maxLength={120} className={INPUT} value={verificationForm.representative_name} onChange={(event) => setVerificationForm((current) => ({ ...current, representative_name: event.target.value }))} /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Representative role</span><input required maxLength={100} className={INPUT} placeholder="e.g. Director, HR Manager" value={verificationForm.representative_role} onChange={(event) => setVerificationForm((current) => ({ ...current, representative_role: event.target.value }))} /></label>
              </div>
              <div>
                <input ref={verificationInput} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Choose company verification evidence" onChange={selectVerificationFile} />
                <Button type="button" variant="outline" size="sm" disabled={verificationBusy} onClick={() => verificationInput.current?.click()}><Upload size={15} />Choose evidence</Button>
                {verificationFile ? <p className="mt-2 truncate text-xs text-slate-500">Selected: {verificationFile.name}</p> : null}
              </div>
              {verificationError ? <p role="alert" className="text-sm text-rose-700">{verificationError}</p> : null}
              {verificationMessage ? <p role="status" className="text-sm text-emerald-700">{verificationMessage}</p> : null}
              <Button type="submit" disabled={verificationBusy}>{verificationBusy ? 'Submitting…' : 'Submit for verification'}</Button>
            </form>
          </Section>
        ) : null}
        {verificationSubmissions.length ? (
          <Section title="Verification history" icon={CheckCircle2}>
            <div className="space-y-4">
              {verificationSubmissions.map((submission) => (
                <article key={submission.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><EmployerVerificationBadge status={submission.status} /><span className="text-xs text-slate-500">Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'date unavailable'}</span></div>
                  {submission.reviewer_feedback ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"><span className="font-semibold">Administrator feedback:</span> {submission.reviewer_feedback}</p> : null}
                  {submission.document_url ? <a className="mt-3 inline-flex text-sm font-medium text-sky-700 underline" href={submission.document_url} target="_blank" rel="noreferrer">View submitted evidence</a> : null}
                  {submission.employer_verification_events?.length ? <ul className="mt-3 space-y-1 text-xs text-slate-500">{submission.employer_verification_events.map((item) => <li key={item.id}>{item.action === 'approved' ? 'Approved' : item.action === 'rejected' ? 'Rejected' : 'Submitted'} · {item.created_at ? new Date(item.created_at).toLocaleString() : 'date unavailable'}</li>)}</ul> : null}
                </article>
              ))}
            </div>
          </Section>
        ) : null}
        <Section title="Profile tips" icon={Target}><ul className="space-y-3 text-sm leading-6 text-slate-600"><li>Use your organisation’s official name and contact email.</li><li>Add a short, clear description to help candidates understand your work.</li><li>Upload a clear, square logo image so candidates can recognize your organisation.</li></ul></Section>
      </div>
    </div>
  </div>
}

function EmployerDashboard({ employerId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return null
      setLoading(true)
      setError('')
      return employerService.getDashboard(employerId)
    }).then((result) => {
      if (active && result) {
        setData(result)
        setUpdatedAt(new Date())
      }
    })
      .catch((loadError) => { if (active) setError(loadError) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employerId, retry])
  if (!data && error) return <div className="space-y-6"><Header title="Employer Dashboard" description="Overview of your jobs and hiring activity." /><LoadError message={error} onRetry={() => setRetry((count) => count + 1)} /></div>
  if (loading && !data) return <div className="grid gap-4 md:grid-cols-3" aria-label="Loading employer dashboard"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>
  if (!data) return null
  const activeJobs = data.activeJobCount || 0
  const inReview = data.applications.filter((item) => isApplicationInProgress(item.status)).length
  const hired = data.applications.filter((item) => item.status === 'accepted').length
  const outstandingOffers = data.applications.filter((item) => normalizeApplicationStatus(item.status) === 'offer').length
  const metrics = [['Active Jobs', activeJobs], ['Applications', data.applications.length], ['In Progress', inReview], ['Upcoming Interviews', data.interviewCount], ['Outstanding Offers', outstandingOffers], ['Accepted', hired]]
  const stages = ['applied', 'under_review', 'shortlisted', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed']
  return <div className="space-y-6">
    <Card className="overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-6 text-white sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-300">Employer overview</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{data.company?.company_name ? `Welcome, ${data.company.company_name}` : 'Your hiring at a glance'}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Review your open opportunities, candidate pipeline, and upcoming interviews.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/employer/jobs/create"><Button size="sm"><Plus size={15} /> Create a job</Button></Link>
        <Link to="/employer/applications"><Button size="sm" variant="outline" className="border-slate-500 bg-white text-slate-800 hover:bg-slate-100">Review applications</Button></Link>
        <Link to="/employer/company"><Button size="sm" variant="outline" className="border-slate-500 bg-transparent text-white hover:bg-white/10">Company profile</Button></Link>
      </div>
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <LastUpdated value={updatedAt} />
      {error ? <div className="min-w-0 flex-1"><RequestError error={error} fallback="We could not refresh the employer dashboard." stale onRetry={() => setRetry((count) => count + 1)} /></div> : null}
    </div>
    {loading ? <p role="status" className="text-sm text-slate-500">Refreshing dashboard…</p> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <Card key={label} className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-slate-900">{value}</p></Card>)}</div>
    <Section title="Recruitment pipeline" icon={Target}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{stages.map((stage) => <Link key={stage} to={`/employer/recruitment?stage=${stage}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50"><p className="text-sm capitalize text-slate-500">{stage.replaceAll('_', ' ')}</p><p className="mt-2 text-2xl font-bold text-slate-900">{data.applications.filter((item) => item.status === stage).length}</p></Link>)}</div></Section>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Section title="Recent applications" icon={Users} action={<Link to="/employer/applications" className="text-sm font-semibold text-sky-700">View all</Link>}>{data.applications.length ? <div className="space-y-3">{data.applications.slice(0, 5).map((item) => <Link key={item.id} to={`/employer/applications/${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-300"><div className="flex min-w-0 items-center gap-3"><Avatar src={item.student_profiles?.profiles?.avatar_url} name={item.student_profiles?.profiles?.full_name || 'Candidate'} size="sm" /><div className="min-w-0"><p className="truncate font-medium text-slate-800">{item.student_profiles?.profiles?.full_name || 'Candidate'}</p><p className="truncate text-sm text-slate-500">{item.jobs?.title || 'Job'} · {item.applied_at && Number.isFinite(new Date(item.applied_at).getTime()) ? new Date(item.applied_at).toLocaleDateString() : 'Application date unavailable'}</p></div></div><Badge tone="blue">{item.status.replaceAll('_', ' ')}</Badge></Link>)}</div> : <EmptyState>Applications will appear here when candidates apply to your published opportunities.</EmptyState>}</Section>
      <Section title="Upcoming interviews" icon={CalendarDays} action={<Link to="/employer/interviews" className="text-sm font-semibold text-sky-700">View interviews</Link>}>{data.interviews.length ? data.interviews.slice(0, 5).map((item) => {
        const meetingUrl = getSafeMeetingUrl(item.meeting_url)
        return <div key={item.id} className="mb-3 rounded-xl border border-slate-200 p-3"><p className="font-medium text-slate-800">{item.applications?.jobs?.title || 'Interview'}</p><p className="text-sm text-slate-500">{formatInterviewDateTime(item.scheduled_at)} · {item.status}</p>{item.location ? <p className="mt-1 text-xs text-slate-500">{item.location}</p> : null}{meetingUrl ? <a className="mt-2 inline-flex text-sm font-medium text-sky-700 underline" href={meetingUrl} target="_blank" rel="noopener noreferrer">Join interview</a> : item.meeting_url ? <p className="mt-2 text-xs text-amber-800">Meeting link hidden: secure HTTPS link required.</p> : null}{item.notes ? <p className="mt-2 text-xs text-slate-600"><span className="font-semibold">Employer-provided notes (not SkillBridge policy):</span> {item.notes}</p> : null}</div>
      }) : <EmptyState>No upcoming interviews yet.</EmptyState>}</Section>
    </div>
  </div>
}

function JobEditor({ employerId, jobId }) {
  const [form, setForm] = useState({ title: '', department: '', description: '', location: '', employment_type: 'full_time', work_mode: 'onsite', salary_min: '', salary_max: '', currency: 'MWK', experience_required: '', education_required: '', application_deadline: '', opportunity_type: '', eligible_programmes_text: '', required_documents_text: '', status: 'draft' })
  const createJobId = useRef(null)
  const [skillCatalog, setSkillCatalog] = useState([])
  const [selectedSkills, setSelectedSkills] = useState([])
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategory, setSkillCategory] = useState('')
  const [skillCatalogWarning, setSkillCatalogWarning] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [skillError, setSkillError] = useState('')
  const [duplicateCandidates, setDuplicateCandidates] = useState([])
  const [duplicateCheckError, setDuplicateCheckError] = useState('')
  const [duplicateCheckPublish, setDuplicateCheckPublish] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(Boolean(jobId))
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(true)
  useEffect(() => {
    createJobId.current = jobId || null
  }, [jobId])
  useEffect(() => {
    let active = true
    Promise.allSettled([
      skillService.listSkillsWithAliases(),
      jobId ? jobService.getEmployerJobs(employerId) : Promise.resolve([]),
    ])
      .then(([catalogResult, jobsResult]) => {
        if (!active) return
        if (catalogResult.status === 'fulfilled') {
          setSkillCatalog(catalogResult.value.skills)
          setSkillCatalogWarning(catalogResult.value.warning)
          setSkillError(catalogResult.value.warning)
        } else {
          setSkillCatalogWarning('')
          setSkillError(catalogResult.reason?.message || 'Unable to load the skill catalog.')
        }
        if (jobsResult.status === 'rejected') {
          setError(jobsResult.reason?.message || 'Unable to load job details.')
          return
        }
        const jobs = jobsResult.value
        const job = jobs.find((item) => item.id === jobId)
        if (job) {
          setForm({
            ...job,
            eligible_programmes_text: (job.eligible_programmes || []).join('\n'),
            required_documents_text: (job.required_documents || []).join('\n'),
          })
          setSelectedSkills((job.job_skills || []).map((item) => ({
            skill_id: item.skill_id,
            name: item.skills?.name || '',
            category: item.skills?.category || '',
            required_level: item.required_level,
            importance: item.importance,
            is_required: item.is_required !== false,
            is_selectable: isSelectableSkill(item.skills),
          })))
        } else if (jobId) {
          setError('Job not found or not owned by this employer.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setSkillCatalogLoading(false)
        }
      })
    return () => { active = false }
  }, [employerId, jobId])
  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setDuplicateCandidates([])
    setDuplicateCheckError('')
  }
  const filteredSkillCatalog = filterSkillCatalog(skillCatalog, {
    query: skillSearch,
    category: skillCategory,
  })
  const requiredSkills = selectedSkills.filter((skill) => skill.is_required !== false)
  const preferredSkills = selectedSkills.filter((skill) => skill.is_required === false)
  const detectJobSkills = () => {
    const detected = detectSkillsInJob(form, skillCatalog)
    setSelectedSkills((current) => {
      const selectedById = new Map(current.map((item) => [item.skill_id, item]))
      for (const skill of detected) {
        if (!selectedById.has(skill.id)) {
          selectedById.set(skill.id, {
            skill_id: skill.id,
            name: skill.name,
            category: skill.category,
            required_level: 'intermediate',
            importance: 50,
            is_required: true,
            is_selectable: true,
          })
        }
      }
      return [...selectedById.values()]
    })
    setSkillError([
      detected.length
        ? `${detected.length} skill${detected.length === 1 ? '' : 's'} detected in the opportunity details. Review the selections before saving.`
        : 'No catalog skills matched the opportunity details. Add skill names to the job description or search the catalog below.',
      skillCatalogWarning,
    ].filter(Boolean).join(' '))
  }
  const toggleSkill = (skill) => {
    setSelectedSkills((current) => current.some((item) => item.skill_id === skill.id)
      ? current.filter((item) => item.skill_id !== skill.id)
      : [...current, { skill_id: skill.id, name: skill.name, category: skill.category, required_level: 'intermediate', importance: 50, is_required: true, is_selectable: true }])
  }
  const setSkillRequirement = (skillId, isRequired) => setSelectedSkills((current) => current.map((item) => item.skill_id === skillId ? { ...item, is_required: isRequired } : item))
  const updateSkillRequirement = (skillId, field, value) => setSelectedSkills((current) => current.map((item) => item.skill_id === skillId ? { ...item, [field]: value } : item))
  const renderSelectedSkill = (skill, isRequired) => (
    <div key={skill.skill_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{skill.name || 'Previously linked skill (not currently available)'}</p>
        {skill.category ? <p className="text-xs text-slate-500">{skill.category}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Requirement type for ${skill.name || 'selected skill'}`}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          value={isRequired ? 'required' : 'preferred'}
          onChange={(event) => setSkillRequirement(skill.skill_id, event.target.value === 'required')}
        >
          <option value="required">Required</option>
          <option value="preferred">Preferred</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600">Level
          <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={skill.required_level || 'intermediate'} onChange={(event) => updateSkillRequirement(skill.skill_id, 'required_level', event.target.value)}>
            {['beginner', 'intermediate', 'advanced', 'expert'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => toggleSkill({ id: skill.skill_id })}>Remove</Button>
      </div>
    </div>
  )
  const save = async (event, publish = false, allowPossibleDuplicate = false) => {
    event?.preventDefault()
    setError('')
    setMessage('')
    const status = jobId || form.id ? form.status : 'draft'
    const jobForValidation = {
      ...form,
      employer_id: employerId,
      employment_type: form.opportunity_type
        ? (form.opportunity_type === 'graduate_internship' ? 'graduate' : 'internship')
        : form.employment_type,
      status,
      job_skills: selectedSkills,
    }
    const validationError = validateEmployerJob(jobForValidation, { publishing: publish || status === 'published' })
    if (validationError) {
      setError(validationError)
      return
    }
    const currentDate = new Date()
    const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    if (publish && form.application_deadline && form.application_deadline < today) {
      setError('Update the application deadline before publishing this opportunity.')
      return
    }
    if (!allowPossibleDuplicate) {
      setSaving(true)
      setDuplicateCandidates([])
      setDuplicateCheckError('')
      try {
        const duplicates = await jobService.findPotentialDuplicates(jobForValidation)
        if (duplicates.length) {
          setDuplicateCandidates(duplicates)
          setDuplicateCheckPublish(publish)
          return
        }
      } catch (duplicateCheckFailure) {
        setDuplicateCheckError(duplicateCheckFailure.message || 'Unable to check for similar job listings.')
        setDuplicateCheckPublish(publish)
        return
      } finally {
        setSaving(false)
      }
    }
    setSaving(true)
    try {
      const stableJobId = jobId || form.id || createJobId.current || crypto.randomUUID()
      createJobId.current = stableJobId
      const saved = await jobService.saveEmployerJob({
        id: stableJobId,
        employer_id: employerId,
        title: form.title.trim(),
        department: form.department || null,
        description: form.description.trim(),
        location: form.location || null,
        employment_type: form.opportunity_type
          ? (form.opportunity_type === 'graduate_internship' ? 'graduate' : 'internship')
          : form.employment_type,
        work_mode: form.work_mode || null,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        currency: form.currency || 'MWK',
        experience_required: form.experience_required || null,
        education_required: form.education_required || null,
        application_deadline: form.application_deadline || null,
        opportunity_type: form.opportunity_type || null,
        eligible_programmes: (form.eligible_programmes_text || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        min_study_year: form.min_study_year ? Number(form.min_study_year) : null,
        max_study_year: form.max_study_year ? Number(form.max_study_year) : null,
        placement_start_date: form.placement_start_date || null,
        placement_end_date: form.placement_end_date || null,
        duration_weeks: form.duration_weeks ? Number(form.duration_weeks) : null,
        positions_available: form.positions_available ? Number(form.positions_available) : null,
        responsibilities: form.responsibilities || null,
        learning_objectives: form.learning_objectives || null,
        required_documents: (form.required_documents_text || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        application_instructions: form.application_instructions || null,
        status,
        job_skills: selectedSkills,
      })
      setForm((current) => ({ ...current, id: saved.id }))
      await jobService.syncJobSkills(saved.id, selectedSkills)
      setForm((current) => ({
        ...current,
        id: saved.id,
        job_skills: selectedSkills.map((item) => ({
          skill_id: item.skill_id,
          skills: { name: item.name, category: item.category },
          required_level: item.required_level,
          importance: item.importance,
          is_required: item.is_required,
        })),
      }))
      if (publish) {
        await jobService.publishJob(saved.id, employerId)
        setForm((current) => ({ ...current, status: 'published' }))
      }
      setDuplicateCandidates([])
      setDuplicateCheckError('')
      setMessage(publish ? 'Job published.' : 'Job saved.')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save this job.')
    } finally {
      setSaving(false)
    }
  }
  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
  if (error && jobId && !form.title) return <div className="space-y-4"><Header title="Edit job" description="Define a clear opportunity before publishing it." back="/employer/jobs" /><LoadError message={error} /></div>
  return <div className="space-y-6"><Header title={jobId || form.id ? 'Edit job' : 'Create job'} description="Create a job or a practical placement. Only published database records appear to candidates." back="/employer/jobs" /><form onSubmit={(event) => save(event, false)}><Section title="Opportunity details" icon={BriefcaseBusiness}><div className="grid gap-4 sm:grid-cols-2">{[['title', 'Opportunity title'], ['department', 'Department / field'], ['location', 'Location'], ['experience_required', 'Experience required'], ['education_required', 'Education required'], ['application_deadline', 'Application deadline']].map(([field, label]) => <label key={field}><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><input type={field === 'application_deadline' ? 'date' : 'text'} required={field === 'title'} className={INPUT} value={form[field] || ''} onChange={(event) => update(field, event.target.value)} /></label>)}<label><span className="mb-1.5 block text-sm font-medium text-slate-700">Opportunity category</span><select className={INPUT} value={form.opportunity_type || ''} onChange={(event) => update('opportunity_type', event.target.value)}><option value="">Standard job</option>{INTERNSHIP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-medium text-slate-700">Employment type</span><select required className={INPUT} value={form.employment_type} onChange={(event) => update('employment_type', event.target.value)}>{EMPLOYER_JOB_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-medium text-slate-700">Work mode</span><select className={INPUT} value={form.work_mode || 'onsite'} onChange={(event) => update('work_mode', event.target.value)}>{['onsite', 'remote', 'hybrid'].map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-medium text-slate-700">Stipend / salary minimum</span><input type="number" min="0" className={INPUT} value={form.salary_min || ''} onChange={(event) => update('salary_min', event.target.value)} /></label><label><span className="mb-1.5 block text-sm font-medium text-slate-700">Stipend / salary maximum</span><input type="number" min="0" className={INPUT} value={form.salary_max || ''} onChange={(event) => update('salary_max', event.target.value)} /></label></div><label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span><textarea required className={`${INPUT} min-h-36`} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
    {form.opportunity_type ? <div className="mt-5 space-y-4 rounded-2xl border border-sky-100 bg-sky-50 p-4"><h3 className="font-semibold text-slate-900">Placement requirements and details</h3><label className="block text-sm font-medium text-slate-700">Eligible academic programmes (one per line; exact programme names)<textarea className={`${INPUT} mt-1 min-h-20`} value={form.eligible_programmes_text || ''} onChange={(event) => update('eligible_programmes_text', event.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2">{[['min_study_year', 'Minimum year of study'], ['max_study_year', 'Maximum year of study'], ['placement_start_date', 'Placement start date'], ['placement_end_date', 'Placement end date'], ['duration_weeks', 'Duration in weeks'], ['positions_available', 'Available positions']].map(([field, label]) => <label key={field} className="text-sm font-medium text-slate-700">{label}<input type={field.includes('date') ? 'date' : 'number'} min={field.includes('date') ? undefined : '1'} className={`${INPUT} mt-1`} value={form[field] || ''} onChange={(event) => update(field, event.target.value)} /></label>)}</div><label className="block text-sm font-medium text-slate-700">Responsibilities<textarea className={`${INPUT} mt-1 min-h-20`} value={form.responsibilities || ''} onChange={(event) => update('responsibilities', event.target.value)} /></label><label className="block text-sm font-medium text-slate-700">Learning objectives<textarea className={`${INPUT} mt-1 min-h-20`} value={form.learning_objectives || ''} onChange={(event) => update('learning_objectives', event.target.value)} /></label><label className="block text-sm font-medium text-slate-700">Required documents (one per line; applicants provide a secure HTTPS link for each)<textarea className={`${INPUT} mt-1 min-h-20`} value={form.required_documents_text || ''} onChange={(event) => update('required_documents_text', event.target.value)} /></label><label className="block text-sm font-medium text-slate-700">Application instructions<textarea className={`${INPUT} mt-1 min-h-20`} value={form.application_instructions || ''} onChange={(event) => update('application_instructions', event.target.value)} /></label></div> : null}
    <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Skills</h3>
          <p className="mt-1 text-sm text-slate-600">Add approved skills from the catalog or detect suggestions, then mark each as required or preferred.</p>
        </div>
        <Button type="button" variant="outline" onClick={detectJobSkills} disabled={skillCatalogLoading || !skillCatalog.length}>Detect skills</Button>
      </div>
      {skillError ? <p role="alert" className="mt-3 text-sm text-amber-800">{skillError}</p> : null}
      {skillCatalogLoading ? <p role="status" className="mt-3 text-sm text-slate-600">Loading skill catalog…</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="relative block">
          <span className="sr-only">Search skills</span>
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" className={`${INPUT} pl-9`} placeholder="Search skill names or aliases" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} disabled={skillCatalogLoading || !skillCatalog.length} />
        </label>
        <label className="sr-only" htmlFor="job-skill-category">Filter skills by category</label>
        <select id="job-skill-category" aria-label="Filter skills by category" className={INPUT} value={skillCategory} onChange={(event) => setSkillCategory(event.target.value)} disabled={skillCatalogLoading || !skillCatalog.length}>
          <option value="">All professional categories</option>
          {SKILL_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {skillCatalog.length ? <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-sky-100 bg-white p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {filteredSkillCatalog.map((skill) => <label key={skill.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm">
            <input type="checkbox" checked={selectedSkills.some((item) => item.skill_id === skill.id)} onChange={() => toggleSkill(skill)} />
            <span><span className="block font-medium text-slate-800">{skill.name}</span><span className="text-slate-500">{skill.category}</span></span>
          </label>)}
        </div>
        {!filteredSkillCatalog.length ? <p role="status" className="p-3 text-sm text-slate-600">No approved skills match the current search and category.</p> : null}
      </div> : !skillCatalogLoading ? <p role="status" className="mt-3 text-sm text-amber-800">{skillError || 'The skill catalog is empty. Contact an administrator to add catalog skills.'}</p> : null}
      {selectedSkills.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section aria-label={`Required skills (${requiredSkills.length})`} className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
          <h4 className="text-sm font-semibold text-slate-800">Required skills ({requiredSkills.length})</h4>
          {requiredSkills.length ? requiredSkills.map((skill) => renderSelectedSkill(skill, true)) : <p className="text-xs text-slate-500">Move the core competencies needed for this opportunity here.</p>}
        </section>
        <section aria-label={`Preferred skills (${preferredSkills.length})`} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-800">Preferred skills ({preferredSkills.length})</h4>
          {preferredSkills.length ? preferredSkills.map((skill) => renderSelectedSkill(skill, false)) : <p className="text-xs text-slate-500">Optional competencies that strengthen an application.</p>}
        </section>
      </div> : <p className="mt-3 text-sm text-slate-600">No skills selected. Search above to add job requirements.</p>}
      {!requiredSkills.length ? <p role="status" className="mt-3 text-sm text-amber-800">At least one required skill is needed before publishing. Drafts can be saved without required skills.</p> : null}
      <p className="mt-3 text-xs text-slate-500">Only approved skills can be assigned to new requirements. Suggested skills are added as required and can be changed to preferred.</p>
    </div>
    {duplicateCandidates.length ? <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-950">Possible duplicate job listing</h3>
      <p className="mt-1 text-sm text-amber-900">These existing listings match the employer, normalized title, location, employment type, dates, and description. Separate vacancies are allowed; review before continuing.</p>
      <ul className="mt-3 space-y-2 text-sm text-amber-950">{duplicateCandidates.map(({ job: duplicate, comparison }) => <li key={duplicate.id} className="rounded-lg bg-white/70 p-3">
        <p className="font-semibold">{duplicate.title} · {duplicate.employer_profiles?.company_name || 'Your company'}</p>
        <p className="mt-1">{duplicate.location || 'Location not set'} · {(duplicate.employment_type || 'job').replaceAll('_', ' ')} · {duplicate.status} · Description similarity {Math.round(comparison.descriptionSimilarity * 100)}%</p>
        <p className="text-xs">Posted {duplicate.published_at || duplicate.created_at ? new Date(duplicate.published_at || duplicate.created_at).toLocaleDateString() : 'date unavailable'} · Closes {duplicate.application_deadline || 'not specified'}</p>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDuplicateCandidates([])}>Continue editing</Button><Button type="button" size="sm" onClick={() => void save(null, duplicateCheckPublish, true)}>Save as a separate vacancy</Button></div>
    </div> : null}
    {duplicateCheckError ? <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm text-rose-800">Duplicate checking failed: {duplicateCheckError}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void save(null, duplicateCheckPublish)}>Retry check</Button><Button type="button" size="sm" onClick={() => void save(null, duplicateCheckPublish, true)}>Save without duplicate check</Button></div>
    </div> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="submit" variant="outline" disabled={saving}>{saving ? 'Checking…' : 'Save changes'}</Button><Button type="button" disabled={saving} onClick={() => save(null, true)}>{saving ? 'Checking…' : 'Publish opportunity'}</Button>{message ? <span role="status" className="text-sm text-emerald-700">{message}</span> : null}{error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}</div></Section></form></div>
}

function JobSkillsView({ employerId, jobId }) {
  const [job, setJob] = useState(null)
  const [skills, setSkills] = useState([])
  const [skillId, setSkillId] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategory, setSkillCategory] = useState('')
  const [level, setLevel] = useState('intermediate')
  const [importance, setImportance] = useState(50)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jobs, skillList] = await Promise.all([
        jobService.getEmployerJobs(employerId),
        skillService.listSkillsWithAliases(),
      ])
      setJob(jobs.find((item) => item.id === jobId) || null)
      setSkills(skillList.skills)
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load job requirements.')
    } finally {
      setLoading(false)
    }
  }, [employerId, jobId])
  useEffect(() => {
    let active = true
    Promise.all([jobService.getEmployerJobs(employerId), skillService.listSkillsWithAliases()])
      .then(([jobs, skillCatalog]) => {
        if (active) {
          setJob(jobs.find((item) => item.id === jobId) || null)
          setSkills(skillCatalog.skills)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load job requirements.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employerId, jobId])
  if (loading && !job) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
  if (error && !job) return <div className="space-y-4"><Header title="Required skills" description="Manage skills required for this job." back="/employer/jobs" /><LoadError message={error} onRetry={load} /></div>
  if (!job) return <EmptyState to="/employer/jobs" action="Back to jobs">Job not found or not owned by this employer.</EmptyState>
  const filteredSkills = filterSkillCatalog(skills, { query: skillSearch, category: skillCategory })
  const requirements = job.job_skills || []
  const add = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await jobService.addJobSkill({ job_id: jobId, skill_id: skillId, required_level: level, importance: Number(importance) })
      await load()
    } catch (saveError) {
      setError(saveError.message || 'Unable to add this required skill.')
    } finally {
      setSaving(false)
    }
  }
  const remove = async (requirementId) => {
    setSaving(true)
    setError('')
    try {
      await jobService.removeJobSkill(requirementId)
      await load()
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove this required skill.')
    } finally {
      setSaving(false)
    }
  }
  return <div className="space-y-6">
    <Header title="Required skills" description={`Define the central skill taxonomy required for ${job.title}.`} back={`/employer/jobs/${jobId}/edit`} />
    {error ? <LoadError message={error} onRetry={load} /> : null}
    <Section title="Add requirement" icon={Target}>
      <form onSubmit={add} className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(12rem,1fr)_8rem_5rem_auto]">
        <input aria-label="Search skills" type="search" className={INPUT} placeholder="Search skill names or aliases" value={skillSearch} onChange={(event) => { setSkillSearch(event.target.value); setSkillId('') }} />
        <select aria-label="Filter skills by category" className={INPUT} value={skillCategory} onChange={(event) => { setSkillCategory(event.target.value); setSkillId('') }}>
          <option value="">All professional categories</option>
          {SKILL_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select required aria-label="Select a skill" className={INPUT} value={skillId} onChange={(event) => setSkillId(event.target.value)}>
          <option value="">Select a skill</option>
          {filteredSkills.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
        </select>
        <select aria-label="Required skill level" className={INPUT} value={level} onChange={(event) => setLevel(event.target.value)}>
          {['beginner', 'intermediate', 'advanced', 'expert'].map((item) => <option key={item}>{item}</option>)}
        </select>
        <input aria-label="Skill importance" type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={importance} onChange={(event) => setImportance(event.target.value)} />
        <Button type="submit" disabled={saving || !filteredSkills.length}><Plus size={15} /> Add</Button>
      </form>
      {!filteredSkills.length ? <p role="status" className="mt-3 text-sm text-slate-600">No approved skills match the current search and category.</p> : null}
    </Section>
    <Section title="Current requirements" icon={Layers3}>
      {requirements.length ? requirements.map((item) => <div key={item.id} className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 p-3">
        <div><p className="font-semibold text-slate-800">{item.skills?.name || 'Previously linked skill (not currently available)'}</p><p className="text-sm text-slate-500">{item.required_level} · importance {item.importance}</p></div>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => remove(item.id)}>Remove</Button>
      </div>) : <EmptyState>Add skills from the central taxonomy before publishing.</EmptyState>}
    </Section>
  </div>
}

function JobsView({ employerId }) {
  const [jobs, setJobs] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [busyJobId, setBusyJobId] = useState('')
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const result = await jobService.getEmployerJobs(employerId)
      setJobs(result)
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load your jobs.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return null
      setLoading(true)
      setError('')
      return jobService.getEmployerJobs(employerId)
    }).then((result) => {
      if (active && result) setJobs(result)
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Unable to load your jobs.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [employerId, retry])
  if (!jobs.length && error && !loading) return <div className="space-y-6"><Header title="Jobs" description="Manage drafts, published opportunities and closed roles." /><LoadError message={error} onRetry={() => setRetry((count) => count + 1)} /></div>
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const deadlinePassed = (job) => Boolean(job.application_deadline) && job.application_deadline < today
  const isExpired = (job) => job.status === 'published' && deadlinePassed(job)
  const filteredJobs = jobs.filter((job) =>
    (!status || job.status === status)
    && `${job.title} ${job.location || ''} ${job.department || ''} ${job.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const statusCounts = {
    all: jobs.length,
    published: jobs.filter((job) => job.status === 'published' && !isExpired(job)).length,
    draft: jobs.filter((job) => job.status === 'draft').length,
    closed: jobs.filter((job) => job.status === 'closed' || isExpired(job)).length,
  }
  const changeStatus = async (action, jobId) => {
    setError('')
    setBusyJobId(jobId)
    try {
      await action(jobId, employerId)
      await load(false)
    } catch (actionError) {
      setError(actionError.message || 'Unable to update this job.')
    } finally {
      setBusyJobId('')
    }
  }
  const statusTone = (job) => isExpired(job) ? 'amber' : job.status === 'published' ? 'green' : job.status === 'closed' || job.status === 'archived' ? 'slate' : 'amber'
  const statusLabel = (job) => isExpired(job) ? 'Expired' : job.status.replaceAll('_', ' ')
  return <div className="space-y-6">
    <Header title="Jobs" description="Create and manage your opportunities, monitor applications, and keep deadlines current." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['All opportunities', statusCounts.all], ['Open to applications', statusCounts.published], ['Drafts', statusCounts.draft], ['Closed or expired', statusCounts.closed]].map(([label, count]) => <Card key={label} className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{loading ? '—' : count}</p></Card>)}
    </div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Search jobs" className={`${INPUT} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, location, department, or description" /></div>
      <select aria-label="Filter jobs by status" className={INPUT} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'published', 'closed', 'archived'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
      <Button type="button" variant="outline" disabled={loading} onClick={() => setRetry((count) => count + 1)}>Refresh</Button>
    </div>
    {error ? <LoadError message={error} onRetry={() => setRetry((count) => count + 1)} /> : null}
    <Section title={`Your opportunities${loading ? '' : ` · ${filteredJobs.length}`}`} icon={BriefcaseBusiness} action={<Link to="/employer/jobs/create"><Button size="sm"><Plus size={15} /> Create job</Button></Link>}>
      {loading && !jobs.length ? <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading jobs"><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /><div className="h-52 animate-pulse rounded-2xl bg-slate-100" /></div>
        : filteredJobs.length ? <div className="grid gap-4 lg:grid-cols-2">{filteredJobs.map((job) => {
          const pastDeadline = deadlinePassed(job)
          const opportunityType = INTERNSHIP_TYPES.find(([type]) => type === job.opportunity_type)?.[1]
            || (job.employment_type || 'Opportunity').replaceAll('_', ' ')
          const deadline = job.application_deadline
            ? new Date(`${job.application_deadline}T00:00:00`).toLocaleDateString()
            : 'No deadline'
          return <Card key={job.id} className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-slate-900">{job.title}</h3><p className="mt-1 text-sm capitalize text-slate-500">{job.location || 'Malawi'} · {opportunityType}</p></div>
              <Badge tone={statusTone(job)} className="shrink-0 capitalize">{statusLabel(job)}</Badge>
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{job.description}</p>
            {pastDeadline ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The application deadline has passed. Update it before publishing or reopening this opportunity.</p> : null}
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <div><p className="text-xs text-slate-500">Applications</p><p className="mt-1 font-semibold text-slate-900">{job.applications?.length || 0}</p></div>
              <div><p className="text-xs text-slate-500">Deadline</p><p className="mt-1 font-semibold text-slate-900">{deadline}</p></div>
              <div><p className="text-xs text-slate-500">Required skills</p><p className="mt-1 font-semibold text-slate-900">{job.job_skills?.filter((skill) => skill.is_required !== false).length || 0}</p></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Created {job.created_at && Number.isFinite(new Date(job.created_at).getTime()) ? new Date(job.created_at).toLocaleDateString() : '—'} · Updated {job.updated_at && Number.isFinite(new Date(job.updated_at).getTime()) ? new Date(job.updated_at).toLocaleDateString() : '—'}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Link to={`/employer/jobs/${job.id}/edit`}><Button size="sm" variant="secondary">{pastDeadline ? 'Update deadline' : 'Edit'}</Button></Link>
              <Link to={`/employer/jobs/${job.id}/skills`}><Button size="sm" variant="outline">Skills</Button></Link>
              <Link to={`/employer/applications?job=${job.id}`}><Button size="sm" variant="outline">Applications</Button></Link>
              {job.status === 'published' ? <Button size="sm" variant="outline" disabled={busyJobId === job.id} onClick={() => void changeStatus(jobService.closeJob, job.id)}>{busyJobId === job.id ? 'Updating…' : 'Close'}</Button>
                : job.status === 'draft' || job.status === 'closed' ? pastDeadline ? null : <Button size="sm" disabled={busyJobId === job.id} onClick={() => void changeStatus(jobService.publishJob, job.id)}>{busyJobId === job.id ? 'Publishing…' : job.status === 'closed' ? 'Reopen' : 'Publish'}</Button> : null}
            </div>
          </Card>
        })}</div>
        : <EmptyState>{jobs.length ? 'No jobs match these filters. Try a different search or status.' : "You haven't created any opportunities yet. Use Create job above to add your first job or placement."}</EmptyState>}
    </Section>
  </div>
}

function CandidatesView({ employerId }) {
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCandidates(await candidateService.list(employerId))
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load candidates.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    let active = true
    candidateService.list(employerId)
      .then((result) => { if (active) { setCandidates(result); setError(''); setLoading(false) } })
      .catch((loadError) => { if (active) { setError(loadError.message || 'Unable to load candidates.'); setLoading(false) } })
    return () => { active = false }
  }, [employerId])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return candidates.filter((item) => {
      const itemStatus = normalizeApplicationStatus(item.status)
      const profile = item.student_profiles?.profiles
      const searchableFields = [
        profile?.full_name,
        profile?.email,
        item.jobs?.title,
        item.student_profiles?.institution,
        item.student_profiles?.programme,
        formatApplicationStatus(itemStatus),
      ]
      return (!status || itemStatus === status)
        && (!query || searchableFields.some((field) => String(field || '').toLowerCase().includes(query)))
    })
  }, [candidates, search, status])
  const uniqueCandidateCount = useMemo(
    () => new Set(candidates.map((item) => item.student_id)).size,
    [candidates],
  )
  const inReviewCount = useMemo(
    () => candidates.filter((item) => isApplicationInProgress(item.status)).length,
    [candidates],
  )
  const offerCount = useMemo(
    () => candidates.filter((item) => normalizeApplicationStatus(item.status) === 'offer').length,
    [candidates],
  )
  if (error) return <div className="space-y-6"><Header title="Candidates" description="Review recruitment-relevant candidate information from your applications." /><LoadError message={error} onRetry={load} /></div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Candidates" description="Review candidate applications and progress across your opportunities." />
      <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh candidates">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Applications', candidates.length],
        ['Unique candidates', uniqueCandidateCount],
        ['In progress', inReviewCount],
        ['Outstanding offers', offerCount],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input aria-label="Search candidates, jobs, education or status" className={`${INPUT} pl-9`} placeholder="Search name, email, job, institution…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <select aria-label="Filter candidates by application status" className={INPUT} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>
        {APPLICATION_LIFECYCLE.map((itemStatus) => <option key={itemStatus} value={itemStatus}>{formatApplicationStatus(itemStatus)}</option>)}
      </select>
    </div>
    {loading ? <p className="text-sm text-slate-500" role="status">Loading candidates…</p> : filtered.length ? <div className="grid gap-4 lg:grid-cols-2">
      {filtered.map((item) => {
        const name = item.student_profiles?.profiles?.full_name || 'Candidate'
        const match = item.job_matches?.[0]
        const applicationStatus = normalizeApplicationStatus(item.status)
        const locationDetails = [item.student_profiles?.institution, item.student_profiles?.programme].filter(Boolean).join(' · ')
        const matchSummary = item.match_refresh_error
          ? `Match unavailable: ${item.match_refresh_error}`
          : match?.calculation_status === 'completed'
          ? `Job match: ${Math.round(match.match_score)}%`
          : match?.calculation_status === 'unavailable'
            ? `Match unavailable: ${match.calculation_reason || 'The opportunity cannot be matched right now.'}`
            : `Match pending: ${match?.calculation_reason || 'Analysis will refresh when reviewed.'}`
        return <Card key={item.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={item.student_profiles?.profiles?.avatar_url} name={name} size="md" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{name}</p>
                <p className="truncate text-sm text-slate-500">{item.jobs?.title || 'Opportunity'}</p>
              </div>
            </div>
            <Badge tone={applicationStatusTone(applicationStatus)}>{formatApplicationStatus(applicationStatus)}</Badge>
          </div>
          {locationDetails ? <p className="mt-3 text-sm text-slate-600">{locationDetails}</p> : null}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            <span>{matchSummary}</span>
            <span>Applied {item.applied_at && Number.isFinite(new Date(item.applied_at).getTime()) ? new Date(item.applied_at).toLocaleDateString() : 'Date unavailable'}</span>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Link to={`/employer/candidates/${item.id}`}><Button size="sm">Review application</Button></Link>
          </div>
        </Card>
      })}
    </div> : candidates.length ? <EmptyState>No applications match these filters. Try another search or status.</EmptyState> : <EmptyState>No candidates have applied to your jobs yet. New applications will appear here for review.</EmptyState>}
  </div>
}

function CandidateDetailView({ applicationId, employerId, backTo = '/employer/candidates' }) {
  const [candidate, setCandidate] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => candidateService.getCandidate(applicationId, employerId).then((record) => { setCandidate(record); setError('') }).catch((loadError) => setError(loadError.message || 'Unable to load this application.')), [applicationId, employerId])
  useEffect(() => {
    let active = true
    candidateService.getCandidate(applicationId, employerId)
      .then((result) => { if (active) { setCandidate(result); setError('') } })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load this application.') })
    return () => { active = false }
  }, [applicationId, employerId])
  if (!candidate && error) return <div className="space-y-4"><Header title="Application" description="Review candidate information for your job." back={backTo} /><LoadError message={error} onRetry={load} /></div>
  if (!candidate) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
  const student = candidate.student_profiles
  const profile = student?.profiles
  const skills = profile?.user_skills || []
  const matches = candidate.job_matches || []
  const match = candidate.match_refresh_error
    ? { calculation_status: 'unavailable', calculation_reason: candidate.match_refresh_error }
    : matches[0]
  return <div className="space-y-6"><Header title={profile?.full_name || 'Candidate review'} description={`${candidate.jobs?.title || 'Application'} · ${formatApplicationStatus(candidate.status)}`} back={backTo} /><div className="grid gap-6 xl:grid-cols-2"><Section title="Candidate overview" icon={Users}><div className="flex items-center gap-3"><Avatar src={profile?.avatar_url} name={profile?.full_name || 'Candidate'} size="lg" /><div><p className="text-lg font-semibold text-slate-900">{profile?.full_name || 'Candidate'}</p><p className="text-sm text-slate-500">{profile?.email}</p></div></div><p className="mt-4 text-sm text-slate-600">{student?.institution || 'Institution not provided'} · {student?.programme || 'Programme not provided'} · {student?.education_level || ''}</p><p className="mt-2 text-sm text-slate-500">Applied {candidate.applied_at && Number.isFinite(new Date(candidate.applied_at).getTime()) ? new Date(candidate.applied_at).toLocaleString() : 'Date unavailable'} · Updated {candidate.updated_at && Number.isFinite(new Date(candidate.updated_at).getTime()) ? new Date(candidate.updated_at).toLocaleString() : 'Date unavailable'}</p>{candidate.cv_url ? <a className="mt-3 inline-flex font-medium text-sky-700 underline" href={candidate.cv_url} target="_blank" rel="noreferrer">View submitted CV</a> : null}{candidate.cover_letter ? <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cover letter</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{candidate.cover_letter}</p></div> : null}</Section><Section title="Applied job and match" icon={Target}><p className="font-semibold">{candidate.jobs?.title}</p>{match?.calculation_status === 'completed' ? <><div className="mt-3 flex flex-wrap gap-2"><Badge tone="green">Match {Math.round(match.match_score)}%</Badge><Badge tone="blue">Skills {match.skills_score ?? 'n/a'}</Badge><Badge tone="slate">Education {match.education_score ?? 'n/a'}</Badge></div><p className="mt-4 text-sm leading-6 text-slate-600">{match.explanation || 'No match explanation recorded.'}</p><p className="mt-2 text-xs text-slate-500">Evidence-based guidance only; this score does not make or replace a hiring decision.{match.calculated_at ? ` Calculated ${new Date(match.calculated_at).toLocaleString()}.` : ''}</p></> : <p className="mt-3 text-sm text-slate-500">{match?.calculation_status === 'unavailable' ? match.calculation_reason : match?.calculation_reason || 'Match analysis is pending and will refresh when reviewed.'}</p>}</Section><Section title="Education" icon={Building2}>{student?.education?.length ? student.education.map((item) => <div key={item.id} className="mb-2 rounded-xl border border-slate-200 p-3"><p className="font-medium">{item.qualification} · {item.institution}</p><p className="text-sm text-slate-500">{item.programme} · {item.start_year || '—'}–{item.end_year || '—'}</p></div>) : <EmptyState>No education records provided.</EmptyState>}</Section><Section title="Skills" icon={Layers3}>{skills.length ? skills.map((item) => <div key={item.id} className="mb-2 flex justify-between rounded-xl border border-slate-200 p-3 text-sm"><span>{item.skills?.name}</span><Badge tone="blue">{item.level}</Badge></div>) : <EmptyState>No recruitment-visible skills recorded.</EmptyState>}</Section><Section title="Projects and certificates" icon={BriefcaseBusiness}>{student?.projects?.length || student?.certificates?.length ? <div className="space-y-2">{student.projects?.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><p className="font-medium">{item.title}</p><p className="text-sm text-slate-500">{item.description}</p>{item.repository_url ? <a className="text-sm text-sky-700 underline" href={item.repository_url} target="_blank" rel="noreferrer">Repository</a> : null}{item.live_url ? <a className="ml-3 text-sm text-sky-700 underline" href={item.live_url} target="_blank" rel="noreferrer">Live project</a> : null}</div>)}{student.certificates?.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><p className="font-medium">{item.title} · {item.issuer}</p>{item.credential_url ? <a className="text-sm text-sky-700 underline" href={item.credential_url} target="_blank" rel="noreferrer">View certificate</a> : null}</div>)}</div> : <EmptyState>No projects or certificates recorded.</EmptyState>}</Section><Section title="Assessment results" icon={ClipboardCheck}>{student?.assessment_results?.length ? student.assessment_results.map((result) => <div key={result.id} className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="font-medium">{result.assessments?.title || 'Assessment'}</p><p className="text-sm text-slate-500">{result.level || 'Completed'} · {result.completed_at ? new Date(result.completed_at).toLocaleDateString() : 'In progress'}</p></div><Badge tone={result.passed ? 'green' : 'slate'}>{result.percentage}%</Badge></div>) : <EmptyState>No assessment results available.</EmptyState>}</Section><Section title="Recruitment history" icon={CalendarDays}><p className="mb-3 text-sm text-slate-600">Current status: <strong>{formatApplicationStatus(candidate.status)}</strong></p>{candidate.application_events?.length ? candidate.application_events.map((event) => <div key={event.id} className="mb-2 rounded-xl border border-slate-200 p-3"><p className="font-medium">{event.title}</p><p className="text-sm text-slate-500">{event.description || event.event_type} · {event.event_date && Number.isFinite(new Date(event.event_date).getTime()) ? new Date(event.event_date).toLocaleString() : 'Date unavailable'}</p></div>) : <EmptyState>No recruitment history recorded yet.</EmptyState>}</Section></div></div>
}

function ApplicationsView({ employerId, applicationId }) {
  const [applications, setApplications] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [searchParams] = useSearchParams()
  const jobFilter = searchParams.get('job') || ''
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await employerService.getDashboard(employerId)
      setApplications(data.applications || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load applications.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    if (applicationId) return undefined
    let active = true
    setLoading(true)
    employerService.getDashboard(employerId)
      .then((result) => { if (active) { setApplications(result.applications || []); setError(''); setLoading(false) } })
      .catch((loadError) => { if (active) { setError(loadError.message || 'Unable to load applications.'); setLoading(false) } })
    return () => { active = false }
  }, [employerId, applicationId])
  const update = async (id, nextStatus) => {
    setBusyId(id)
    setError('')
    try {
      await employerService.updateApplication(id, nextStatus)
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Unable to update the application.')
    } finally {
      setBusyId('')
    }
  }
  const makeOffer = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await offerService.create({ p_application_id: id, p_salary: null, p_currency: 'MWK', p_start_date: null, p_expiry_date: null, p_notes: 'Offer created from employer workspace.' })
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Unable to create an offer.')
    } finally {
      setBusyId('')
    }
  }
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return applications.filter((item) => {
      const applicationStatus = normalizeApplicationStatus(item.status)
      const searchable = [
        item.student_profiles?.profiles?.full_name,
        item.student_profiles?.profiles?.email,
        item.jobs?.title,
        formatApplicationStatus(applicationStatus),
      ].some((field) => String(field || '').toLowerCase().includes(query))
      return (!status || applicationStatus === status)
        && (!jobFilter || item.job_id === jobFilter)
        && (!query || searchable)
    })
  }, [applications, search, status, jobFilter])
  const applicationCounts = useMemo(() => ({
    total: applications.length,
    new: applications.filter((item) => ['applied', 'under_review'].includes(normalizeApplicationStatus(item.status))).length,
    inProgress: applications.filter((item) => ['shortlisted', 'assessment', 'interview'].includes(normalizeApplicationStatus(item.status))).length,
    offers: applications.filter((item) => normalizeApplicationStatus(item.status) === 'offer').length,
  }), [applications])
  if (applicationId) return <CandidateDetailView applicationId={applicationId} employerId={employerId} backTo="/employer/applications" />
  if (error && applications.length === 0) return <div className="space-y-6"><Header title="Applications" description="Review applications to your jobs and move candidates through the documented hiring workflow." /><LoadError message={error} onRetry={load} /></div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Applications" description="Review applications to your jobs and move candidates through the hiring process." />
      <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh applications">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Total applications', applicationCounts.total],
        ['New / under review', applicationCounts.new],
        ['In progress', applicationCounts.inProgress],
        ['Outstanding offers', applicationCounts.offers],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    {jobFilter ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      Showing applications for {applications.find((item) => item.job_id === jobFilter)?.jobs?.title || 'the selected opportunity'}.
      <Link to="/employer/applications" className="font-semibold underline">Clear job filter</Link>
    </div> : null}
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input aria-label="Search applicants or jobs" className={`${INPUT} pl-9`} placeholder="Search name, email or opportunity…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <select aria-label="Filter applications by status" className={INPUT} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>
        {APPLICATION_LIFECYCLE.map((itemStatus) => <option key={itemStatus} value={itemStatus}>{formatApplicationStatus(itemStatus)}</option>)}
      </select>
    </div>
    {error ? <LoadError message={error} onRetry={load} /> : null}
    {loading ? <p className="text-sm text-slate-500" role="status">Loading applications…</p> : filtered.length ? <div className="grid gap-4 lg:grid-cols-2">
      {filtered.map((item) => {
        const name = item.student_profiles?.profiles?.full_name || 'Candidate'
        const applicationStatus = normalizeApplicationStatus(item.status)
        const terminal = isApplicationTerminal(applicationStatus)
        const hasOffer = applicationStatus === 'offer'
        const canShortlist = ['applied', 'under_review'].includes(applicationStatus)
        const canOffer = ['shortlisted', 'assessment', 'interview'].includes(applicationStatus)
        const busy = busyId === item.id
        const appliedAt = item.applied_at && Number.isFinite(new Date(item.applied_at).getTime()) ? new Date(item.applied_at).toLocaleDateString() : 'Date unavailable'
        const updatedAt = item.updated_at && Number.isFinite(new Date(item.updated_at).getTime()) ? new Date(item.updated_at).toLocaleDateString() : null
        return <Card key={item.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={item.student_profiles?.profiles?.avatar_url} name={name} size="md" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{name}</p>
                <p className="truncate text-sm text-slate-500">{item.jobs?.title || 'Opportunity'}</p>
              </div>
            </div>
            <Badge tone={['offer', 'accepted'].includes(applicationStatus) ? 'green' : ['rejected', 'withdrawn', 'expired', 'position_closed'].includes(applicationStatus) ? 'slate' : 'blue'}>{formatApplicationStatus(applicationStatus)}</Badge>
          </div>
          {item.student_profiles?.profiles?.email ? <p className="mt-3 truncate text-sm text-slate-600">{item.student_profiles.profiles.email}</p> : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>Applied {appliedAt}</span>
            {updatedAt ? <span>Updated {updatedAt}</span> : null}
          </div>
          {busy ? <p className="mt-3 text-xs font-medium text-sky-700" role="status">Updating application…</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Link to={`/employer/applications/${item.id}`}><Button size="sm" variant="outline">Review</Button></Link>
            {!terminal && !hasOffer && canShortlist ? <Button size="sm" disabled={busy} onClick={() => update(item.id, 'shortlisted')}>Shortlist</Button> : null}
            {!terminal && !hasOffer && canOffer ? <Button size="sm" variant="outline" disabled={busy} onClick={() => makeOffer(item.id)}>{busy ? 'Working…' : 'Make offer'}</Button> : null}
            {!terminal && !hasOffer ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Reject ${name}'s application for ${item.jobs?.title || 'this opportunity'}?`)) void update(item.id, 'rejected') }}>Reject</Button> : null}
            {hasOffer ? <span className="self-center text-xs text-slate-500">Offer recorded</span> : null}
          </div>
        </Card>
      })}
    </div> : <EmptyState>{applications.length ? 'No applications match these filters. Try changing your search or status.' : 'No applications have been received yet. Applications to your published opportunities will appear here.'}</EmptyState>}
  </div>
}

function RecruitmentView({ employerId }) {
  const [applications, setApplications] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedStage = searchParams.get('stage') || ''
  const statuses = ['applied', 'under_review', 'shortlisted', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed']
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await employerService.getDashboard(employerId)
      setApplications(data.applications || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the recruitment pipeline.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    let active = true
    setLoading(true)
    employerService.getDashboard(employerId)
      .then((result) => { if (active) { setApplications(result.applications || []); setError(''); setLoading(false) } })
      .catch((loadError) => { if (active) { setError(loadError.message || 'Unable to load the recruitment pipeline.'); setLoading(false) } })
    return () => { active = false }
  }, [employerId])
  const advance = async (application) => {
    const currentStatus = normalizeApplicationStatus(application.status)
    const nextStage = {
      applied: 'under_review',
      under_review: 'shortlisted',
      shortlisted: 'assessment',
      assessment: 'interview',
    }[currentStatus]
    if (!nextStage) return
    setBusyId(application.id)
    setError('')
    try {
      await employerService.updateApplication(application.id, nextStage)
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Unable to advance this application.')
    } finally {
      setBusyId('')
    }
  }
  const makeOffer = async (application) => {
    setBusyId(application.id)
    setError('')
    try {
      await offerService.create({
        p_application_id: application.id,
        p_salary: null,
        p_currency: 'MWK',
        p_start_date: null,
        p_expiry_date: null,
        p_notes: 'Offer created from the recruitment pipeline.',
      })
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Unable to create an offer.')
    } finally {
      setBusyId('')
    }
  }
  const query = search.trim().toLowerCase()
  const matchingApplications = applications.filter((item) => {
    const applicationStatus = normalizeApplicationStatus(item.status)
    const searchable = [
      item.student_profiles?.profiles?.full_name,
      item.student_profiles?.profiles?.email,
      item.jobs?.title,
      formatApplicationStatus(applicationStatus),
    ].some((field) => String(field || '').toLowerCase().includes(query))
    return statuses.includes(applicationStatus)
      && (!query || searchable)
  })
  const visible = matchingApplications.filter((item) => (
    !selectedStage || normalizeApplicationStatus(item.status) === selectedStage
  ))
  const counts = Object.fromEntries(statuses.map((stage) => [
    stage,
    matchingApplications.filter((item) => normalizeApplicationStatus(item.status) === stage).length,
  ]))
  const activeCount = applications.filter((item) => isApplicationInProgress(item.status)).length
  const offerCount = applications.filter((item) => normalizeApplicationStatus(item.status) === 'offer').length
  const closedCount = applications.filter((item) => isApplicationTerminal(item.status)).length
  const stageLabel = (stage) => formatApplicationStatus(stage)
  const nextStageByStatus = { applied: 'under_review', under_review: 'shortlisted', shortlisted: 'assessment', assessment: 'interview' }
  const statusTone = applicationStatusTone
  const formatPipelineDate = (value) => value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString()
    : 'Date unavailable'
  if (error && applications.length === 0) return <div className="space-y-6"><Header title="Recruitment pipeline" description="Track candidates through each stage of your hiring process." /><LoadError message={error} onRetry={load} /></div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Recruitment pipeline" description="Track candidates through each stage of your hiring process." />
      <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh recruitment pipeline">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ['In progress', activeCount],
        ['Outstanding offers', offerCount],
        ['Closed applications', closedCount],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input aria-label="Search recruitment pipeline" className={`${INPUT} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate, email, job or stage…" />
      </div>
      <select aria-label="Filter pipeline stage" className={INPUT} value={selectedStage} onChange={(event) => setSearchParams(event.target.value ? { stage: event.target.value } : {})}>
        <option value="">All stages</option>
        {statuses.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
      </select>
    </div>
    {error ? <LoadError message={error} onRetry={load} /> : null}
    {loading ? <p className="text-sm text-slate-500" role="status">Loading recruitment pipeline…</p> : applications.length === 0 ? <EmptyState>No applications have entered the recruitment pipeline yet.</EmptyState> : visible.length === 0 ? <EmptyState>No candidates match this search or stage filter.</EmptyState> : <div className="flex max-w-full gap-4 overflow-x-auto pb-3">
      {statuses.filter((stage) => !selectedStage || stage === selectedStage).map((stage) => {
        const stageApplications = visible.filter((application) => normalizeApplicationStatus(application.status) === stage)
        const emptyStage = stageApplications.length === 0
        return <section key={stage} aria-label={`${stageLabel(stage)} stage`} className={`min-w-64 flex-1 rounded-2xl p-3 ${['offer', 'accepted'].includes(stage) ? 'bg-emerald-50' : ['rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed'].includes(stage) ? 'bg-slate-100' : 'bg-sky-50'}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800">{stageLabel(stage)}</h3>
            <Badge tone={statusTone(stage)}>{counts[stage]}</Badge>
          </div>
          {emptyStage ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500">No applications at this stage.</p> : <div className="mt-3 space-y-3">
            {stageApplications.map((item) => {
              const name = item.student_profiles?.profiles?.full_name || 'Candidate'
              const applicationStatus = normalizeApplicationStatus(item.status)
              const nextStage = nextStageByStatus[applicationStatus]
              const busy = busyId === item.id
              return <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{name}</p>
                  <Badge tone={statusTone(applicationStatus)}>{stageLabel(applicationStatus)}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.jobs?.title || 'Opportunity'}</p>
                {item.student_profiles?.profiles?.email ? <p className="mt-1 break-all text-xs text-slate-500">{item.student_profiles.profiles.email}</p> : null}
                <p className="mt-2 text-xs text-slate-500">Applied {formatPipelineDate(item.applied_at)} · Updated {formatPipelineDate(item.updated_at)}</p>
                <Link className="mt-3 inline-flex text-sm font-medium text-sky-700" to={`/employer/applications/${item.id}`}>Review application <ArrowRight size={15} className="ml-1" /></Link>
                {nextStage ? <Button size="sm" className="mt-3 flex w-full" disabled={busy} onClick={() => void advance(item)}>{busy ? 'Updating…' : `Move to ${stageLabel(nextStage)}`}</Button> : applicationStatus === 'interview' ? <Button size="sm" className="mt-3 flex w-full" disabled={busy} onClick={() => void makeOffer(item)}>{busy ? 'Creating offer…' : 'Create offer'}</Button> : null}
              </Card>
            })}
          </div>}
        </section>
      })}
    </div>}
  </div>
}

function AssessmentsView({ employerId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobsLoading, setJobsLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generationMessage, setGenerationMessage] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [duplicateAssessmentCandidates, setDuplicateAssessmentCandidates] = useState([])
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await employerService.getJobAssessments(employerId))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load your job assessments.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    let active = true
    employerService.getJobAssessments(employerId)
      .then((result) => { if (active) { setData(result); setError(''); setLoading(false) } })
      .catch((loadError) => { if (active) { setError(loadError.message || 'Unable to load your job assessments.'); setLoading(false) } })
    return () => { active = false }
  }, [employerId])
  useEffect(() => {
    let active = true
    jobService.getEmployerJobs(employerId)
      .then((jobList) => { if (active) setJobs(jobList) })
      .catch((loadError) => { if (active) setGenerationError(loadError.message || 'Unable to load your jobs.') })
      .finally(() => { if (active) setJobsLoading(false) })
    return () => { active = false }
  }, [employerId])
  const generateAssessment = async (allowSimilar = false) => {
    const selectedJob = jobs.find((job) => job.id === selectedJobId)
    if (!selectedJob) {
      setGenerationError('Select a job first.')
      return
    }
    setGenerationError('')
    setGenerationMessage('')
    let generated
    try {
      generated = buildJobAssessment(selectedJob)
    } catch (generationFailure) {
      setGenerationError(generationFailure.message || 'Unable to generate an assessment for this job.')
      return
    }

    const proposedAssessment = {
      id: 'proposed-assessment',
      title: generated.title,
      job_id: selectedJob.id,
      assessment_type: 'job',
      status: 'published',
      assessment_questions: generated.questions,
    }
    const duplicateMatches = (data?.assignments || [])
      .filter((assignment) => assignment.job_id === selectedJob.id && assignment.assessments?.status !== 'archived')
      .map((assignment) => {
        const existing = {
          ...assignment.assessments,
          job_assessments: [{ job_id: assignment.job_id }],
        }
        return {
          assignment,
          comparison: compareAssessmentsForDuplicates(existing, proposedAssessment),
        }
      })
      .filter(({ comparison }) => comparison.isPossibleDuplicate)
    const exactMatches = duplicateMatches.filter(({ comparison }) => comparison.sameQuestionSet)
    if (exactMatches.length > 1) {
      setGenerationError('Multiple identical assessments are already assigned to this job. Ask an administrator to review them before generating another.')
      return
    }
    if (exactMatches.length === 1) {
      const existingStatus = exactMatches[0].assignment.assessments?.status || 'unknown status'
      setGenerationMessage(`An identical assessment already exists for this job (${existingStatus}). No additional copy was created.`)
      return
    }
    if (duplicateMatches.length && !allowSimilar) {
      setDuplicateAssessmentCandidates(duplicateMatches)
      return
    }

    setDuplicateAssessmentCandidates([])
    setGenerating(true)
    try {
      await employerService.generateJobAssessment(selectedJob.id, generated)
      setGenerationMessage(`Generated and assigned a ${generated.questions.length}-question assessment to ${selectedJob.title}. Candidates who apply to this job can take it.`)
      await load()
    } catch (generationFailure) {
      setGenerationError(generationFailure.message || 'Unable to generate an assessment for this job.')
    } finally {
      setGenerating(false)
    }
  }
  const query = search.trim().toLowerCase()
  const allAssignments = data?.assignments || []
  const assignments = allAssignments.filter(({ jobs, assessments }) =>
    `${jobs?.title || ''} ${assessments?.title || ''} ${assessments?.assessment_type || ''}`
      .toLowerCase()
      .includes(query),
  )
  const assessmentIds = new Set(allAssignments.map((assignment) => assignment.assessment_id))
  const results = (data?.results || []).filter((result) => {
    if (!assessmentIds.has(result.assessment_id)) return false
    const resultSearch = `${result.student_profiles?.profiles?.full_name || ''} ${result.assessments?.title || ''} ${(result.job_titles || []).join(' ')}`.toLowerCase()
    return !query || resultSearch.includes(query)
  })
  const completedResults = results.filter((result) => Boolean(result.completed_at))
  const passedResults = completedResults.filter((result) => result.passed)
  const assignmentCount = assignments.length
  const requiredCount = assignments.filter((assignment) => assignment.required).length
  if (error && !data) return <div className="space-y-6"><Header title="Assessments" description="Review assessments assigned to your jobs and candidate results." /><LoadError message={error} onRetry={load} /></div>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Assessments" description="Review assessments assigned to your jobs and the results candidates have recorded." />
      <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh assessments">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Assigned assessments', assignmentCount],
        ['Required', requiredCount],
        ['Completed results', completedResults.length],
        ['Passed', passedResults.length],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    <Section title="Generate a job assessment" icon={Sparkles}>
      <p className="mb-4 text-sm leading-6 text-slate-600">Create and assign an automatically generated multiple-choice assessment from the required skills on one of your jobs. Candidates who apply to that job will see the assessment.</p>
      <p className="mb-4 text-sm leading-6 text-slate-600">An assessment record can be assigned to multiple jobs, but this generator creates a job-specific assessment and does not provide an assessment reuse selector.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1"><span className="sr-only">Choose job for assessment</span><select className={INPUT} value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} disabled={jobsLoading || !jobs.length}><option value="">{jobsLoading ? 'Loading your jobs…' : jobs.length ? 'Choose a job' : 'No jobs available'}</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}{job.status !== 'published' ? ` (${job.status})` : ''}</option>)}</select></label>
        <Button type="button" disabled={generating || jobsLoading || !selectedJobId} onClick={() => void generateAssessment()}><Sparkles size={16} />{generating ? 'Generating…' : 'Generate assessment'}</Button>
      </div>
      {selectedJobId && !jobs.find((job) => job.id === selectedJobId)?.job_skills?.some((skill) => skill.is_required !== false) ? <p className="mt-3 text-sm text-amber-800">Add required skills in the job editor before generating its assessment.</p> : null}
      {duplicateAssessmentCandidates.length ? <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="font-semibold text-amber-950">Possible similar assessment already assigned</p>
        <p className="mt-1 text-sm text-amber-900">Review these records before creating another. An exact match already assigned to this job is not duplicated; this confirmation is only for similar, non-identical content.</p>
        <ul className="mt-2 space-y-1 text-sm text-amber-950">{duplicateAssessmentCandidates.map(({ assignment, comparison }) => <li key={assignment.id}>{assignment.assessments?.title || 'Assessment'} · {assignment.assessments?.status || 'unknown status'} · {Math.round(comparison.questionSimilarity * 100)}% question-text similarity</li>)}</ul>
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDuplicateAssessmentCandidates([])}>Cancel</Button><Button type="button" size="sm" onClick={() => void generateAssessment(true)}>Generate a separate assessment</Button></div>
      </div> : null}
      {generationError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{generationError}</p> : null}
      {generationMessage ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{generationMessage}</p> : null}
    </Section>
    <div className="relative">
      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
      <input aria-label="Search job assessments and candidates" className={`${INPUT} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by job, assessment, type or candidate…" />
    </div>
    {error ? <LoadError message={error} onRetry={load} /> : null}
    {loading ? <p className="text-sm text-slate-500" role="status">Loading assessments…</p> : <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Assessments assigned to jobs" icon={ClipboardCheck}>
        {assignments.length ? <div className="space-y-3">{assignments.map((assignment) => {
          const assessment = assignment.assessments
          const assessmentStatus = assessment?.status || 'Unknown'
          const statusTone = assessmentStatus === 'published' ? 'green' : assessmentStatus === 'archived' ? 'slate' : 'amber'
          const meta = [
            assessment?.assessment_type,
            assessment?.duration_minutes ? `${assessment.duration_minutes} min` : null,
            assessment?.difficulty,
          ].filter(Boolean)
          return <Card key={assignment.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{assessment?.title || 'Assessment'}</p>
                <p className="mt-1 text-sm text-slate-500">{assignment.jobs?.title || 'Opportunity'}</p>
              </div>
              <Badge tone={assignment.required ? 'blue' : 'slate'}>{assignment.required ? 'Required' : 'Optional'}</Badge>
            </div>
            {assessment?.description ? <p className="mt-3 text-sm leading-5 text-slate-600">{assessment.description}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone}>{assessmentStatus}</Badge>
              {meta.map((item) => <span key={item} className="text-xs text-slate-500">{item}</span>)}
              {assessment?.passing_score != null ? <span className="text-xs text-slate-500">Pass mark: {assessment.passing_score}%</span> : null}
            </div>
          </Card>
        })}</div> : <EmptyState>{query ? 'No assigned assessments match this search.' : 'No assessments are assigned to your jobs yet.'}</EmptyState>}
      </Section>
      <Section title="Candidate results" icon={Users}>
        {results.length ? <div className="space-y-3">{results.map((result) => {
          const name = result.student_profiles?.profiles?.full_name || 'Candidate'
          const complete = Boolean(result.completed_at)
          const percentage = Number(result.percentage)
          const scoreLabel = complete && Number.isFinite(percentage) ? `${Math.round(percentage)}%` : complete ? 'Completed' : 'Incomplete'
          const resultDate = result.completed_at && Number.isFinite(new Date(result.completed_at).getTime())
            ? new Date(result.completed_at).toLocaleDateString()
            : null
          return <Card key={result.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={result.student_profiles?.profiles?.avatar_url} name={name} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{name}</p>
                <p className="truncate text-sm text-slate-500">{result.assessments?.title || 'Assessment'}{result.job_titles?.length ? ` · ${result.job_titles.join(', ')}` : ''}{resultDate ? ` · ${resultDate}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {complete ? <Badge tone={result.passed ? 'green' : 'red'}>{result.passed ? 'Passed' : 'Not passed'}</Badge> : <Badge tone="amber">Incomplete</Badge>}
              <span className="text-sm font-semibold text-slate-700">{scoreLabel}</span>
            </div>
          </Card>
        })}</div> : <EmptyState>{query ? 'No candidate results match this search.' : 'No candidate results are available for your assigned assessments yet.'}</EmptyState>}
      </Section>
    </div>}
  </div>
}

function InterviewsView({ employerId }) {
  const [interviews, setInterviews] = useState([])
  const [applications, setApplications] = useState([])
  const [currentTime, setCurrentTime] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ p_application_id: '', p_scheduled_at: '', p_duration_minutes: '45', p_location: '', p_meeting_url: '', p_interview_type: 'structured', p_notes: '' })
  const [editingInterviewId, setEditingInterviewId] = useState('')
  const [search, setSearch] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleRequestError, setScheduleRequestError] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [interviewList, dashboard] = await Promise.all([
        interviewService.list(employerId),
        employerService.getDashboard(employerId),
      ])
      setInterviews(interviewList)
      setApplications(dashboard.applications || [])
      setCurrentTime(Date.now())
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load interviews.')
    } finally {
      setLoading(false)
    }
  }, [employerId])
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([interviewService.list(employerId), employerService.getDashboard(employerId)])
      .then(([interviewList, dashboard]) => {
        if (active) {
          setInterviews(interviewList)
          setApplications(dashboard.applications || [])
          setCurrentTime(Date.now())
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load interviews.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employerId])
  const eligibleApplications = applications.filter((application) => isApplicationInProgress(application.status))
  const query = search.trim().toLowerCase()
  const visibleInterviews = interviews.filter((interview) => {
    const name = interview.applications?.student_profiles?.profiles?.full_name || ''
    const jobTitle = interview.applications?.jobs?.title || ''
    return `${name} ${jobTitle} ${interview.interview_type || ''} ${interview.status || ''}`.toLowerCase().includes(query)
  })
  const now = currentTime || 0
  const upcomingInterviews = visibleInterviews
    .filter((interview) => new Date(interview.scheduled_at).getTime() >= now && !['cancelled', 'completed'].includes(interview.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const pastInterviews = visibleInterviews
    .filter((interview) => new Date(interview.scheduled_at).getTime() < now || ['cancelled', 'completed'].includes(interview.status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
  const minDateTime = currentTime
    ? new Date(currentTime - new Date(currentTime).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : ''
  const schedule = async (event) => {
    event.preventDefault()
    setScheduleError('')
    setScheduleRequestError(null)
    const scheduledAt = new Date(form.p_scheduled_at)
    const duration = Number(form.p_duration_minutes)
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setScheduleError('Choose a future date and time for the interview.')
      return
    }
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      setScheduleError('Interview duration must be between 5 minutes and 8 hours.')
      return
    }
    const meetingLink = validateInterviewMeetingUrl(form.p_meeting_url)
    if (!meetingLink.valid) {
      setScheduleError('Meeting link must be a valid HTTPS URL without embedded credentials.')
      return
    }
    if (form.p_notes.length > 4000 || form.p_location.length > 500) {
      setScheduleError('Location must be 500 characters or fewer and interview notes must be 4,000 characters or fewer.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const interview = {
        ...form,
        p_scheduled_at: scheduledAt.toISOString(),
        p_duration_minutes: duration,
        p_location: form.p_location.trim() || null,
        p_meeting_url: meetingLink.url,
        p_notes: form.p_notes.trim() || null,
      }
      if (editingInterviewId) {
        await interviewService.update({ ...interview, p_interview_id: editingInterviewId })
      } else {
        await interviewService.schedule(interview)
      }
      setEditingInterviewId('')
      setForm({ p_application_id: '', p_scheduled_at: '', p_duration_minutes: '45', p_location: '', p_meeting_url: '', p_interview_type: 'structured', p_notes: '' })
      await load()
    } catch (scheduleError) {
      setScheduleRequestError(scheduleError)
    } finally {
      setSaving(false)
    }
  }
  const renderInterview = (item) => {
    const candidateName = item.applications?.student_profiles?.profiles?.full_name || 'Candidate'
    const meetingUrl = getSafeMeetingUrl(item.meeting_url)
    const statusTone = item.status === 'scheduled' || item.status === 'rescheduled'
      ? 'blue'
      : item.status === 'completed'
        ? 'green'
        : 'slate'
    return <Card key={item.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar src={item.applications?.student_profiles?.profiles?.avatar_url} name={candidateName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{candidateName}</p>
            <p className="truncate text-sm text-slate-500">{item.applications?.jobs?.title || 'Opportunity'}</p>
          </div>
        </div>
        <Badge tone={statusTone}>{item.status}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{formatInterviewDateTime(item.scheduled_at)}</span>
        {item.duration_minutes ? <span>{item.duration_minutes} minutes</span> : null}
        {item.interview_type ? <span className="capitalize">{item.interview_type.replaceAll('_', ' ')}</span> : null}
      </div>
      {item.location ? <p className="mt-2 text-sm text-slate-600">Location: {item.location}</p> : null}
      {meetingUrl ? <a className="mt-2 inline-flex text-sm font-medium text-sky-700 underline" href={meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting link</a> : item.meeting_url ? <p className="mt-2 text-sm text-amber-800">Saved link hidden because it is not a valid secure HTTPS URL.</p> : null}
      {item.notes ? <div className="mt-2 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Employer-provided interview notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p><p className="mt-2 text-xs text-slate-500">These instructions are not SkillBridge policy.</p></div> : null}
      {item.feedback ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><span className="font-medium text-slate-700">Interview feedback:</span> {item.feedback}</div> : null}
      {['scheduled', 'rescheduled'].includes(item.status) && new Date(item.scheduled_at).getTime() >= now ? <Button type="button" className="mt-3" variant="outline" size="sm" onClick={() => {
        setEditingInterviewId(item.id)
        setForm({
          p_application_id: item.applications?.id || '',
          p_scheduled_at: toLocalInterviewDateTime(item.scheduled_at),
          p_duration_minutes: String(item.duration_minutes || 45),
          p_location: item.location || '',
          p_meeting_url: meetingUrl,
          p_interview_type: item.interview_type || 'structured',
          p_notes: item.notes || '',
        })
        setScheduleError('')
        setScheduleRequestError(null)
      }}>Update / reschedule</Button> : null}
    </Card>
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Interviews" description="Schedule and review interviews connected to your applications." />
      <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh interviews">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    {error ? <LoadError message={error} onRetry={load} /> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ['Upcoming', interviews.filter((item) => new Date(item.scheduled_at).getTime() >= now && !['cancelled', 'completed'].includes(item.status)).length],
        ['Completed', interviews.filter((item) => item.status === 'completed').length],
        ['Total scheduled', interviews.length],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    <Section title={editingInterviewId ? 'Update interview' : 'Schedule interview'} icon={CalendarDays}>
      <div className="mb-4"><InterviewConductNotice audience="employer" /></div>
      {!loading && !eligibleApplications.length && !editingInterviewId ? <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">There are no active applications to schedule. Interviews can be scheduled for applications still in the hiring process.</p> : null}
      <form onSubmit={schedule} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700">Application
          <select required disabled={Boolean(editingInterviewId)} className={INPUT} value={form.p_application_id} onChange={(event) => setForm({ ...form, p_application_id: event.target.value })}>
            <option value="">Select candidate and job</option>
            {eligibleApplications.map((item) => <option key={item.id} value={item.id}>{item.student_profiles?.profiles?.full_name || 'Candidate'} · {item.jobs?.title || 'Opportunity'}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Date and time <span className="font-normal text-slate-500">(your local time: {getLocalTimeZone()})</span>
          <input required type="datetime-local" min={minDateTime} className={INPUT} value={form.p_scheduled_at} onChange={(event) => setForm({ ...form, p_scheduled_at: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Interview format
          <select className={INPUT} value={form.p_interview_type} onChange={(event) => setForm({ ...form, p_interview_type: event.target.value })}>
            <option value="structured">Structured</option>
            <option value="technical">Technical</option>
            <option value="behavioral">Behavioral</option>
            <option value="screening">Screening</option>
            <option value="panel">Panel</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Duration (minutes)
          <input type="number" min="5" max="480" step="5" required className={INPUT} value={form.p_duration_minutes} onChange={(event) => setForm({ ...form, p_duration_minutes: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Location (optional)
          <input maxLength={500} className={INPUT} placeholder="Office address or room" value={form.p_location} onChange={(event) => setForm({ ...form, p_location: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">Meeting link (optional)
          <input type="url" className={INPUT} placeholder="https://…" value={form.p_meeting_url} onChange={(event) => setForm({ ...form, p_meeting_url: event.target.value })} />
          <span className="block text-xs font-normal text-slate-500">Only secure HTTPS links are accepted.</span>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">Notes for the candidate (optional)
          <textarea rows="3" maxLength={4000} className={INPUT} placeholder="Role-related instructions or information for the candidate" value={form.p_notes} onChange={(event) => setForm({ ...form, p_notes: event.target.value })} />
          <span className="block text-xs font-normal text-slate-500">Clearly role-related, employer-provided information. Do not request passwords, PINs, financial details, or unrelated sensitive information.</span>
        </label>
        {scheduleError ? <p role="alert" className="md:col-span-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{scheduleError}</p> : null}
        {scheduleRequestError ? <div className="md:col-span-2"><RequestError error={scheduleRequestError} fallback="The interview could not be saved." /></div> : null}
        <div className="md:col-span-2">
          <Button type="submit" disabled={saving || loading || (!editingInterviewId && eligibleApplications.length === 0)}>{saving ? 'Saving…' : editingInterviewId ? 'Save interview changes' : 'Schedule interview'}</Button>
          {editingInterviewId ? <Button type="button" className="ml-2" variant="outline" disabled={saving} onClick={() => {
            setEditingInterviewId('')
            setForm({ p_application_id: '', p_scheduled_at: '', p_duration_minutes: '45', p_location: '', p_meeting_url: '', p_interview_type: 'structured', p_notes: '' })
            setScheduleError('')
            setScheduleRequestError(null)
          }}>Cancel edit</Button> : null}
        </div>
      </form>
    </Section>
    <Section title="Interview schedule" icon={CalendarDays}>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input aria-label="Search interviews" className={`${INPUT} pl-9`} placeholder="Search candidate, job, format or status…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {loading ? <p className="text-sm text-slate-500" role="status">Loading interviews…</p> : interviews.length ? visibleInterviews.length ? <div className="space-y-5">
        <div>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-800">Upcoming</h3><Badge tone="blue">{upcomingInterviews.length}</Badge></div>
          {upcomingInterviews.length ? <div className="space-y-3">{upcomingInterviews.map(renderInterview)}</div> : <EmptyState>No upcoming interviews match this search.</EmptyState>}
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-800">Past and cancelled</h3><Badge tone="slate">{pastInterviews.length}</Badge></div>
          {pastInterviews.length ? <div className="space-y-3">{pastInterviews.map(renderInterview)}</div> : <EmptyState>No past or cancelled interviews match this search.</EmptyState>}
        </div>
      </div> : <EmptyState>No interviews match this search.</EmptyState> : <EmptyState>No interviews scheduled yet. Choose an active application above to arrange one.</EmptyState>}
    </Section>
  </div>
}

function FeedbackDashboard({ employerId }) {
  const [candidates, setCandidates] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    candidate_id: '',
    relationship_key: '',
    feedback_type: 'employment',
    reviewer_role: 'Supervisor',
    review_date: new Date().toISOString().slice(0, 10),
    organization: '',
    project_name: '',
    strengths: '',
    improvement_areas: '',
    evidence: '',
    development_plan: '',
    next_review_goals: '',
    overall_summary: '',
    competencies: [
      { name: 'Communication', rating: 3, evidence: '', comment: '', not_observed: false },
      { name: 'Teamwork and collaboration', rating: 3, evidence: '', comment: '', not_observed: false },
      { name: 'Professionalism', rating: 3, evidence: '', comment: '', not_observed: false },
    ],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [candidateList, feedbackList] = await Promise.all([
        feedbackService.listEligibleCandidates(employerId),
        feedbackService.listForEmployer(employerId),
      ])
      setCandidates(candidateList)
      setFeedback(feedbackList)
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load feedback data.')
    } finally {
      setLoading(false)
    }
  }, [employerId])

  useEffect(() => { void load() }, [load])

  const updateCompetency = (index, field, value) => {
    setForm((current) => ({
      ...current,
      competencies: current.competencies.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }))
  }

  const addCompetency = () => {
    setForm((current) => ({
      ...current,
      competencies: [...current.competencies, { name: '', rating: 3, evidence: '', comment: '', not_observed: false }],
    }))
  }

  const removeCompetency = (index) => {
    setForm((current) => ({
      ...current,
      competencies: current.competencies.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    setSuccessMessage('')
    if (!form.candidate_id) {
      setSubmitError('Select a candidate before submitting feedback.')
      return
    }
    const selectedCandidate = candidates.find((candidate) => candidate.candidate_id === form.candidate_id)
    const relationship = selectedCandidate?.relationships.find((item) => `${item.type}:${item.id}` === form.relationship_key)
    if (!relationship) {
      setSubmitError('Select the application or employment relationship this feedback is based on.')
      return
    }
    if (!form.reviewer_role.trim()) {
      setSubmitError('Enter your role when reviewing this candidate.')
      return
    }
    if (!form.review_date) {
      setSubmitError('Choose the date this feedback was assessed.')
      return
    }

    setSaving(true)
    try {
      await feedbackService.submitFeedback({
        employer_id: employerId,
        candidate_id: form.candidate_id,
        job_id: relationship.job_id,
        application_id: relationship.application_id,
        employment_id: relationship.employment_id,
        feedback_type: form.feedback_type,
        reviewer_role: form.reviewer_role,
        review_date: form.review_date,
        organization: form.organization,
        project_name: form.project_name,
        strengths: form.strengths,
        improvement_areas: form.improvement_areas,
        evidence: form.evidence,
        development_plan: form.development_plan,
        next_review_goals: form.next_review_goals,
        overall_summary: form.overall_summary,
        competencies: form.competencies.filter((item) => item.name.trim()),
      })
      setSuccessMessage('Feedback submitted successfully and is available to the candidate.')
      setForm({
        candidate_id: '',
        relationship_key: '',
        feedback_type: 'employment',
        reviewer_role: 'Supervisor',
        review_date: new Date().toISOString().slice(0, 10),
        organization: '',
        project_name: '',
        strengths: '',
        improvement_areas: '',
        evidence: '',
        development_plan: '',
        next_review_goals: '',
        overall_summary: '',
        competencies: [
          { name: 'Communication', rating: 3, evidence: '', comment: '', not_observed: false },
          { name: 'Teamwork and collaboration', rating: 3, evidence: '', comment: '', not_observed: false },
          { name: 'Professionalism', rating: 3, evidence: '', comment: '', not_observed: false },
        ],
      })
      await load()
    } catch (submitError) {
      setSubmitError(submitError.message || 'Unable to submit feedback.')
    } finally {
      setSaving(false)
    }
  }

  const selectedCandidate = candidates.find((candidate) => candidate.candidate_id === form.candidate_id)
  const feedbackTypes = ['employment', 'internship', 'placement', 'apprenticeship', 'graduate_programme', 'interview', 'assessment', 'project']
  const feedbackDate = (value) => value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString()
    : 'Date unavailable'
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Header title="Feedback" description="Share evidence-based competency feedback with candidates connected to your organization." />
      <Button variant="outline" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh feedback">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ['Eligible candidates', candidates.length],
        ['Feedback submitted', feedback.length],
        ['Awaiting acknowledgement', feedback.filter((item) => !item.employer_feedback_acknowledgements?.some((ack) => ['acknowledged', 'disputed'].includes(ack.status))).length],
      ].map(([label, value]) => <Card key={label} className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </Card>)}
    </div>
    {error ? <LoadError message={error} onRetry={load} /> : null}
    {successMessage ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</p> : null}
    {submitError ? <div role="alert"><LoadError message={submitError} /></div> : null}
    {loading ? <p className="text-sm text-slate-500" role="status">Loading feedback records…</p> : <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={submit} className="space-y-6">
        <Section title="Candidate feedback" icon={Users}>
          {candidates.length ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Candidate</span>
              <select required className={INPUT} value={form.candidate_id} onChange={(event) => setForm((current) => ({ ...current, candidate_id: event.target.value, relationship_key: '' }))}>
                <option value="">Select a candidate</option>
                {candidates.map((candidate) => <option key={candidate.candidate_id} value={candidate.candidate_id}>{candidate.full_name}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Related application or employment</span>
              <select required className={INPUT} value={form.relationship_key} disabled={!selectedCandidate} onChange={(event) => setForm((current) => ({ ...current, relationship_key: event.target.value }))}>
                <option value="">Select the relationship this review is based on</option>
                {selectedCandidate?.relationships.map((relationship) => <option key={`${relationship.type}:${relationship.id}`} value={`${relationship.type}:${relationship.id}`}>{relationship.type === 'employment' ? 'Employment' : 'Application'} · {relationship.title} · {relationship.status}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Feedback type</span>
              <select className={INPUT} value={form.feedback_type} onChange={(event) => setForm((current) => ({ ...current, feedback_type: event.target.value }))}>
                {feedbackTypes.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Reviewer role</span>
              <input required className={INPUT} value={form.reviewer_role} onChange={(event) => setForm((current) => ({ ...current, reviewer_role: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Assessment date</span>
              <input required type="date" max={new Date().toISOString().slice(0, 10)} className={INPUT} value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Organization</span>
              <input className={INPUT} value={form.organization} onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Project or assignment</span>
              <input className={INPUT} value={form.project_name} onChange={(event) => setForm((current) => ({ ...current, project_name: event.target.value }))} />
            </label>
          </div> : <EmptyState>No candidates with an application or employment relationship are available for feedback.</EmptyState>}
        </Section>
        <Section title="Competencies" icon={ClipboardCheck}>
          <p className="mb-4 text-sm text-slate-500">Rate observed competencies from 1–5, or mark them as not observed. Add evidence to make ratings actionable.</p>
          <div className="space-y-4">
            {form.competencies.map((competency, index) => <div key={`${competency.name || 'new'}-${index}`} className="rounded-xl border border-slate-200 p-4">
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.7fr_auto]">
                <input aria-label={`Competency ${index + 1} name`} className={INPUT} value={competency.name} placeholder="Competency name" onChange={(event) => updateCompetency(index, 'name', event.target.value)} />
                <select aria-label={`Competency ${index + 1} rating`} className={INPUT} value={competency.not_observed ? 'not_observed' : competency.rating} onChange={(event) => { const nextValue = event.target.value; updateCompetency(index, 'not_observed', nextValue === 'not_observed'); updateCompetency(index, 'rating', nextValue === 'not_observed' ? 0 : Number(nextValue)); }}>
                  <option value={1}>1 - Needs development</option>
                  <option value={2}>2 - Developing</option>
                  <option value={3}>3 - Expected competence</option>
                  <option value={4}>4 - Strong competence</option>
                  <option value={5}>5 - Advanced competence</option>
                  <option value="not_observed">Not observed</option>
                </select>
                <Button type="button" variant="ghost" className="text-rose-700" onClick={() => removeCompetency(index)}>Remove</Button>
              </div>
              <textarea aria-label={`Evidence for ${competency.name || `competency ${index + 1}`}`} className={`${INPUT} mt-3 min-h-20`} placeholder="Evidence or examples" value={competency.evidence} onChange={(event) => updateCompetency(index, 'evidence', event.target.value)} />
              <textarea aria-label={`Comments for ${competency.name || `competency ${index + 1}`}`} className={`${INPUT} mt-3 min-h-20`} placeholder="Strengths or improvement comments" value={competency.comment} onChange={(event) => updateCompetency(index, 'comment', event.target.value)} />
            </div>)}
            <Button type="button" variant="outline" onClick={addCompetency}>Add competency</Button>
          </div>
        </Section>
        <Section title="Overall feedback" icon={CheckCircle2}>
          <div className="space-y-4">
            <textarea aria-label="Demonstrated strengths" className={`${INPUT} min-h-24`} placeholder="Demonstrated strengths" value={form.strengths} onChange={(event) => setForm((current) => ({ ...current, strengths: event.target.value }))} />
            <textarea aria-label="Areas for improvement" className={`${INPUT} min-h-24`} placeholder="Areas for improvement" value={form.improvement_areas} onChange={(event) => setForm((current) => ({ ...current, improvement_areas: event.target.value }))} />
            <textarea aria-label="Supporting evidence" className={`${INPUT} min-h-24`} placeholder="Practical examples or supporting evidence" value={form.evidence} onChange={(event) => setForm((current) => ({ ...current, evidence: event.target.value }))} />
            <textarea aria-label="Development plan" className={`${INPUT} min-h-24`} placeholder="Recommended training or development activities" value={form.development_plan} onChange={(event) => setForm((current) => ({ ...current, development_plan: event.target.value }))} />
            <textarea aria-label="Next review goals" className={`${INPUT} min-h-24`} placeholder="Goals for next review period" value={form.next_review_goals} onChange={(event) => setForm((current) => ({ ...current, next_review_goals: event.target.value }))} />
            <textarea aria-label="Overall summary" className={`${INPUT} min-h-24`} placeholder="Overall assessment summary" value={form.overall_summary} onChange={(event) => setForm((current) => ({ ...current, overall_summary: event.target.value }))} />
          </div>
        </Section>
        <Button type="submit" disabled={saving || candidates.length === 0}>{saving ? 'Submitting feedback…' : 'Submit feedback'}</Button>
      </form>
      <Section title="Submitted feedback" icon={ClipboardCheck}>
        <div className="space-y-3">
          {feedback.length ? feedback.map((item) => {
            const acknowledgement = item.employer_feedback_acknowledgements?.[0]
            const acknowledgementTone = acknowledgement?.status === 'acknowledged' ? 'green' : acknowledgement?.status === 'disputed' ? 'red' : 'amber'
            return <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.student_profiles?.profiles?.full_name || 'Candidate'}</p>
                  <p className="mt-1 text-sm capitalize text-slate-500">{item.feedback_type?.replaceAll('_', ' ')} · {feedbackDate(item.review_date)}</p>
                  {item.jobs?.title ? <p className="mt-1 text-xs text-slate-500">{item.jobs.title}</p> : null}
                </div>
                <Badge tone={acknowledgement ? acknowledgementTone : 'slate'}>{acknowledgement?.status || item.status || 'Submitted'}</Badge>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-600">{item.overall_summary || 'No overall summary provided.'}</p>
              {item.employer_feedback_competencies?.length ? <div className="mt-3 flex flex-wrap gap-2">{item.employer_feedback_competencies.slice(0, 3).map((competency) => <Badge key={competency.id} tone="blue">{competency.name}: {competency.not_observed ? 'Not observed' : competency.rating}</Badge>)}</div> : null}
            </div>
          }) : <EmptyState>No feedback has been submitted yet.</EmptyState>}
        </div>
      </Section>
    </div>}
  </div>
}

function SimpleEmployerList({ mode, employerId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = mode === 'employees'
        ? await employerService.getDashboard(employerId).then((data) => data.employees || [])
        : mode === 'analytics'
          ? await analyticsService.getEmployerAnalytics(employerId)
          : await notificationService.list(employerId)
      setItems(result)
      setError('')
    } catch (loadError) {
      setError(loadError.message || `Unable to load ${mode}.`)
    } finally {
      setLoading(false)
    }
  }, [employerId, mode])
  useEffect(() => {
    let active = true
    setLoading(true)
    const request = mode === 'employees'
      ? employerService.getDashboard(employerId).then((data) => data.employees || [])
      : mode === 'analytics'
        ? analyticsService.getEmployerAnalytics(employerId)
        : notificationService.list(employerId)
    request
      .then((result) => {
        if (active) {
          setItems(result)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || `Unable to load ${mode}.`)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employerId, mode])
  const titles = { employees: ['Employees', 'No employees have been hired through SkillBridge yet.'], analytics: ['Hiring analytics', 'Not enough data yet.'], notifications: ['Notifications', 'No employer notifications yet.'] }
  if (mode === 'analytics') {
    const analytics = Array.isArray(items) ? null : items
    const maxMonthlyApplications = Math.max(1, ...(analytics?.monthlyApplications || []).map((month) => month.count))
    const maxStageApplications = Math.max(1, ...(analytics?.applications?.stages || []).map((stage) => stage.count))
    return <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header title="Hiring analytics" description="A snapshot of your jobs, applicant pipeline and hiring activity, based on records linked to your organisation." />
        <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh hiring analytics">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {loading ? <p className="text-sm text-slate-500" role="status">Loading hiring analytics…</p> : analytics ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total jobs', value: analytics.jobs.total, detail: `${analytics.jobs.published} published`, icon: BriefcaseBusiness, tone: 'text-sky-700 bg-sky-50' },
            { label: 'Applications', value: analytics.applications.total, detail: `${analytics.applications.perJob ?? '—'} per job`, icon: Users, tone: 'text-violet-700 bg-violet-50' },
            { label: 'Accepted', value: analytics.applications.accepted, detail: `${analytics.applications.acceptanceRate ?? '—'}${analytics.applications.acceptanceRate == null ? '' : '%'} of applications`, icon: UserCheck, tone: 'text-emerald-700 bg-emerald-50' },
            { label: 'Active employees', value: analytics.employees.active, detail: `${analytics.employees.total} total employment records`, icon: Building2, tone: 'text-amber-700 bg-amber-50' },
          ].map(({ label, value, detail, icon: Icon, tone }) => <Card key={label} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
              <span className={`rounded-xl p-2.5 ${tone}`}><Icon size={19} /></span>
            </div>
          </Card>)}
        </div>
        {analytics.hasData ? <div className="grid gap-5 xl:grid-cols-2">
          <Section title="Application activity" icon={TrendingUp}>
            <p className="mb-5 text-sm text-slate-500">Applications received by month over the last six months.</p>
            <div className="grid grid-cols-6 gap-2 sm:gap-4" aria-label="Applications received during the last six months">
              {analytics.monthlyApplications.map((month) => <div key={month.key} className="flex min-w-0 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{month.count}</span>
                <div className="flex h-28 w-full items-end justify-center rounded-lg bg-slate-50 p-1.5">
                  <div className="w-full max-w-8 rounded-t-md bg-sky-600 transition-all" style={{ height: `${month.count ? Math.max(8, (month.count / maxMonthlyApplications) * 100) : 0}%` }} title={`${month.count} applications`} />
                </div>
                <span className="truncate text-xs text-slate-500">{month.label}</span>
              </div>)}
            </div>
            <p className="mt-4 text-xs text-slate-500">Counts are based on application submission dates.</p>
          </Section>
          <Section title="Current application pipeline" icon={Layers3}>
            <p className="mb-5 text-sm text-slate-500">Each application is counted once in its current recorded status.</p>
            <div className="space-y-4">
              {analytics.applications.stages.map((stage) => <div key={stage.key}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">{stage.label}</span><span className="font-semibold text-slate-900">{stage.count}</span></div>
                <ProgressBar value={(stage.count / maxStageApplications) * 100} tone={stage.key === 'accepted' ? 'green' : stage.key === 'unsuccessful' ? 'amber' : 'blue'} />
              </div>)}
              {analytics.applications.other ? <p className="text-xs text-slate-500">{analytics.applications.other} applications are in other or not-yet-submitted statuses.</p> : null}
              {!analytics.applications.total ? <p className="text-sm text-slate-500">Application stages will appear once candidates apply to your jobs.</p> : null}
            </div>
          </Section>
          <Section title="Jobs attracting applicants" icon={BarChart3}>
            {analytics.topJobs.length ? <div className="divide-y divide-slate-100">
              {analytics.topJobs.map((job, index) => <div key={job.id || `${job.title}-${index}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0"><p className="truncate font-medium text-slate-800">{job.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{job.status.replaceAll('_', ' ')}</p></div>
                <Badge tone={job.applicationCount ? 'blue' : 'slate'}>{job.applicationCount} {job.applicationCount === 1 ? 'application' : 'applications'}</Badge>
              </div>)}
            </div> : <EmptyState to="/employer/jobs">Create a job to start tracking interest and applications.</EmptyState>}
          </Section>
          <Section title="Job portfolio" icon={BriefcaseBusiness}>
            <div className="grid grid-cols-2 gap-3">
              {[['Published', analytics.jobs.published], ['Drafts', analytics.jobs.drafts], ['Closed or archived', analytics.jobs.closed], ['Average applications per job', analytics.applications.perJob ?? '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
              </div>)}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Acceptance rate reflects applications currently marked Accepted; it is not a cohort-based conversion rate.</p>
          </Section>
        </div> : <EmptyState to="/employer/jobs" action="Manage jobs">Your hiring analytics will populate as you create jobs and receive applications.</EmptyState>}
      </> : null}
    </div>
  }
  const employeeStatusTone = (status) => status === 'active' ? 'green' : status === 'on_leave' ? 'amber' : 'slate'
  const formatEmployeeDate = (value) => value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString()
    : 'Not recorded'
  const filteredEmployees = mode === 'employees'
    ? items.filter((item) => {
      const profile = item.student_profiles?.profiles
      return `${profile?.full_name || ''} ${profile?.email || ''} ${item.position || ''} ${item.jobs?.title || ''} ${item.status || ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    })
    : []
  const activeEmployees = mode === 'employees' ? items.filter((item) => item.status === 'active').length : 0
  const completedEmployees = mode === 'employees' ? items.filter((item) => item.status === 'completed').length : 0
  const onLeaveEmployees = mode === 'employees' ? items.filter((item) => item.status === 'on_leave').length : 0
  if (mode === 'employees') {
    return <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header title="Employees" description="Track employment records and progress for people hired through SkillBridge." />
        <Button variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh employees">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total employees', items.length],
          ['Active', activeEmployees],
          ['Completed', completedEmployees],
          ['On leave', onLeaveEmployees],
        ].map(([label, value]) => <Card key={label} className="p-4">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </Card>)}
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input aria-label="Search employees" className={`${INPUT} pl-9`} placeholder="Search employee, role, job or status…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {error ? <LoadError message={error} onRetry={load} /> : null}
      {loading ? <p className="text-sm text-slate-500" role="status">Loading employees…</p> : filteredEmployees.length ? <div className="grid gap-4 lg:grid-cols-2">
        {filteredEmployees.map((employee) => {
          const person = employee.student_profiles?.profiles
          const name = person?.full_name || 'Employee'
          const progress = employee.employment_progress || []
          const latestProgress = [...progress].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          return <Card key={employee.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={person?.avatar_url} name={name} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{name}</p>
                  <p className="truncate text-sm text-slate-500">{employee.position || employee.jobs?.title || 'Position not recorded'}</p>
                </div>
              </div>
              <Badge tone={employeeStatusTone(employee.status)}>{String(employee.status || 'unknown').replaceAll('_', ' ')}</Badge>
            </div>
            {person?.email ? <p className="mt-3 truncate text-sm text-slate-600">{person.email}</p> : null}
            {employee.jobs?.title ? <p className="mt-2 text-sm text-slate-600">Hired for {employee.jobs.title}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div><p className="text-xs text-slate-500">Start date</p><p className="mt-1 font-medium text-slate-800">{formatEmployeeDate(employee.start_date)}</p></div>
              <div><p className="text-xs text-slate-500">End date</p><p className="mt-1 font-medium text-slate-800">{employee.end_date ? formatEmployeeDate(employee.end_date) : 'Ongoing'}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">{progress.length} progress {progress.length === 1 ? 'review' : 'reviews'}</span>
              {latestProgress ? <span className="text-slate-500">{latestProgress.period_label || `Updated ${formatEmployeeDate(latestProgress.created_at)}`}{latestProgress.overall_score != null ? ` · ${latestProgress.overall_score}%` : ''}</span> : null}
            </div>
          </Card>
        })}
      </div> : items.length ? <EmptyState>No employees match this search. Try a different name, role, job, or status.</EmptyState> : <EmptyState>No employees have been hired through SkillBridge yet. Employment records created from accepted offers will appear here.</EmptyState>}
    </div>
  }
  return <div className="space-y-6"><Header title={titles[mode][0]} description={CONFIG[mode][1]} />{error ? <LoadError message={error} onRetry={load} /> : null}{error ? null : loading ? <p className="text-sm text-slate-500">Loading {titles[mode][0].toLowerCase()}...</p> : items.length ? <div className="grid gap-4 md:grid-cols-2">{items.map((item) => <Card key={item.id}><div className="p-5"><p className="font-semibold text-slate-900">{item.position || item.title || item.name || item.jobs?.title || 'Hiring record'}</p><p className="mt-2 text-sm text-slate-500">{item.status || item.message || item.description || 'Recorded employer data'}</p>{item.employment_progress?.length ? <p className="mt-2 text-sm text-slate-500">{item.employment_progress.length} progress reviews</p> : null}</div></Card>)}</div> : <EmptyState>{titles[mode][1]}</EmptyState>}</div>
}

export default function EmployerModulePage({ mode = 'company', detailId }) {
  const { user } = useAuth()
  const params = useParams()
  const employerId = user.id
  const id = detailId || params.id
  const content = mode === 'company' || mode === 'settings' ? <><Header title={CONFIG[mode][0]} description={CONFIG[mode][1]} /><CompanyEditor employerId={employerId} showPicture={mode === 'settings'} /></> : mode === 'dashboard' ? <EmployerDashboard employerId={employerId} /> : mode === 'jobEditor' ? <JobEditor employerId={employerId} jobId={id} /> : mode === 'jobSkills' ? <JobSkillsView employerId={employerId} jobId={id} /> : mode === 'jobs' ? <JobsView employerId={employerId} /> : mode === 'candidates' && id ? <CandidateDetailView applicationId={id} employerId={employerId} /> : mode === 'candidates' ? <CandidatesView employerId={employerId} /> : mode === 'applications' ? <ApplicationsView employerId={employerId} applicationId={id} /> : mode === 'assessments' ? <AssessmentsView employerId={employerId} /> : mode === 'recruitment' ? <RecruitmentView employerId={employerId} /> : mode === 'interviews' ? <InterviewsView employerId={employerId} /> : mode === 'feedback' ? <FeedbackDashboard employerId={employerId} /> : <SimpleEmployerList mode={mode} employerId={employerId} />
  return <AppShell title={CONFIG[mode]?.[0] || 'Employer workspace'} subtitle={CONFIG[mode]?.[1] || ''} showBackButton={mode === 'dashboard'}>{content}</AppShell>
}
