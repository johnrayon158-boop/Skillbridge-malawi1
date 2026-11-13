import { supabase, supabaseConfigStatus } from './supabase'
import { requireData } from './serviceUtils'
import { ADMIN_JOB_DETAIL_SELECT } from '../utils/adminJobDetails.js'
import { buildCareerOpportunityPayload } from '../utils/careerOpportunityValidation.js'
import { validateCareerDefinition } from '../utils/careerDefinitionValidation.js'
import { getDataQualityProblems } from '../utils/dataQuality'
import { buildSecurityOverview } from '../utils/securityOverview'
import { ALLOWED_JOB_STATUSES, computeDataQualityScore } from '../utils/dataValidation'
import { clearCacheByPrefix } from '../utils/performanceCache'
import {
  normalizeSkillCatalogName,
  validateSkillCandidate,
} from '../utils/skillCatalog'
import { calculateEvaluationReport } from '../utils/evaluationMetrics.js'
import { evaluateSkillsGapCases } from '../utils/skillsGapEvaluation.js'
import { validateLearningResource } from '../utils/learningResourceValidation.js'
import { normalizeCertificateReview } from '../utils/certificateWorkflow.js'
import { getAdminDashboardData } from './adminDashboardData.js'

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_URL
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl, window.location.origin)
      if (import.meta.env.PROD && ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname)) {
        return window.location.origin
      }
    } catch {
      return configuredUrl.replace(/\/+$/, '')
    }
    return configuredUrl.replace(/\/+$/, '')
  }
  return import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : window.location.origin
}

async function getApiSecurityConfiguration() {
  let response
  try {
    response = await fetch(`${getApiBaseUrl()}/health`, { headers: { Accept: 'application/json' } })
  } catch {
    return {
      corsConfiguration: { available: false, reason: 'The API health endpoint could not be reached from this browser.' },
      rateLimitConfiguration: null,
    }
  }
  if (!response.ok) {
    return {
      corsConfiguration: { available: false, reason: `The API health endpoint returned HTTP ${response.status}.` },
      rateLimitConfiguration: null,
    }
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    return {
      corsConfiguration: { available: false, reason: 'The API health endpoint returned an invalid response.' },
      rateLimitConfiguration: null,
    }
  }
  if (!Array.isArray(payload?.data?.cors?.allowedOrigins)) {
    return {
      corsConfiguration: { available: false, reason: 'The API health response did not include its CORS configuration.' },
      rateLimitConfiguration: null,
    }
  }
  return {
    corsConfiguration: payload.data.cors,
    rateLimitConfiguration: payload.data.rateLimiting || null,
  }
}

function unavailableSystemHealth(message, apiStatus = 'unavailable') {
  const checkedAt = new Date().toISOString()
  const serviceNames = [
    ['api', 'Backend API'],
    ['database', 'Supabase database'],
    ['authentication', 'Supabase authentication'],
    ['storage', 'Supabase storage'],
    ['email', 'Email delivery (password reset)'],
    ['gemini', 'Google Gemini'],
    ['rate_limit', 'API rate limiting'],
  ]
  return {
    status: apiStatus,
    checkedAt,
    checks: serviceNames.map(([key, label]) => ({
      key,
      label,
      status: key === 'api' ? apiStatus : 'unknown',
      message: key === 'api' ? message : 'Not checked because the backend health endpoint was unavailable.',
      checkedAt: key === 'api' ? checkedAt : null,
      lastSuccessfulAt: null,
      responseTimeMs: null,
      errorCode: null,
    })),
    incidents: {
      available: false,
      message: 'Incident history was not available because the backend health endpoint could not be reached.',
      counts: null,
      recent: [],
    },
  }
}

async function list(table, query = (request) => request) {
  const { data, error } = await query(supabase.from(table).select('*'))
  return requireData(data, error, `Unable to load ${table}.`)
}

async function recentRows(table, columns, limit = 20) {
  const { data, error } = await supabase.from(table).select(columns).order('created_at', { ascending: false }).limit(limit)
  return requireData(data, error, `Unable to load ${table}.`)
}

async function count(table, filters = {}) {
  let request = supabase.from(table).select('*', { count: 'exact', head: true })
  for (const [column, value] of Object.entries(filters)) request = request.eq(column, value)
  const { count: total, error } = await request
  if (error) throw new Error(`Unable to count ${table}.`)
  return total || 0
}

async function countSince(table, since, filters = {}, inFilters = {}) {
  let request = supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since)
  for (const [column, value] of Object.entries(filters)) request = request.eq(column, value)
  for (const [column, values] of Object.entries(inFilters)) request = request.in(column, values)
  const { count: total, error } = await request
  if (error) throw new Error(`Unable to count recent ${table}.`)
  return total || 0
}

async function loadAllQualityRecords(table, columns) {
  const pageSize = 500
  const records = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(offset, offset + pageSize - 1)
    const page = requireData(data, error, `Unable to inspect ${table} data quality.`)
    records.push(...page)
    if (page.length < pageSize) return records
    offset += pageSize
  }
}

async function loadAllOrderedRecords(table, columns, orderColumn) {
  const pageSize = 500
  const records = []
  let offset = 0
  while (true) {
    let request = supabase.from(table).select(columns)
    for (const column of Array.isArray(orderColumn) ? orderColumn : [orderColumn]) request = request.order(column)
    const { data, error } = await request.range(offset, offset + pageSize - 1)
    const page = requireData(data, error, `Unable to load evaluation data from ${table}.`)
    records.push(...page)
    if (page.length < pageSize) return records
    offset += pageSize
  }
}

export const adminService = {
  async getDashboard(range = 'all') {
    return getAdminDashboardData(supabase, range)
  },

  async getEvaluationReport() {
    const [
      careerFeedback,
      assessmentResults,
      assessmentAttempts,
      matchReviews,
      jobMatches,
      usabilityResponses,
      feedbackCommentCount,
      recommendationActionsResult,
    ] = await Promise.all([
      loadAllQualityRecords('career_feedback', 'id, student_id, career_recommendation_id, relevance_rating, suitability_rating, is_useful, created_at'),
      loadAllQualityRecords('assessment_results', 'id, assessment_id, score, passed, completed_at'),
      loadAllQualityRecords('assessment_attempts', 'id, assessment_id, started_at, completed_at, result_id, score, passed'),
      loadAllQualityRecords('job_match_evaluation_examples', 'id, candidate_id, job_id, expected_match, reviewer_id, reviewed_at'),
      loadAllQualityRecords('job_matches', 'id, student_id, job_id, match_score'),
      loadAllOrderedRecords('platform_evaluations', 'user_id, survey_version, workflow, respondent_role, ease_of_use, navigation_clarity, task_completion, trust_in_recommendations, overall_satisfaction, submitted_at', ['user_id', 'workflow', 'survey_version']),
      supabase.from('platform_evaluations').select('user_id', { count: 'exact', head: true }).not('feedback', 'is', null).neq('feedback', ''),
      supabase.rpc('get_career_recommendation_action_counts'),
    ])
    if (feedbackCommentCount.error) throw new Error('Unable to count submitted evaluation comments.')
    const recommendationActions = requireData(recommendationActionsResult.data, recommendationActionsResult.error, 'Unable to load recommendation engagement metrics.')
    const metrics = calculateEvaluationReport({
      careerFeedback,
      recommendationActions,
      assessmentResults,
      assessmentAttempts,
      matchReviews,
      jobMatches,
      usabilityResponses,
      openFeedbackCount: feedbackCommentCount.count || 0,
    })
    const skillsGapTests = evaluateSkillsGapCases()
    return {
      generatedAt: metrics.generatedAt,
      metrics: {
        ...metrics,
        skillsGapIdentification: {
          ...metrics.skillsGapIdentification,
          sampleSize: skillsGapTests.length,
          passed: skillsGapTests.filter((item) => item.passed).length,
          failed: skillsGapTests.filter((item) => !item.passed).length,
          testCases: skillsGapTests,
          datasetType: 'Predefined deterministic test fixtures; not observed user outcomes.',
        },
      },
    }
  },

  async getJobMatchEvaluationSetup() {
    const [studentsResult, jobsResult, reviewsResult] = await Promise.all([
      supabase.from('student_profiles').select('id, profiles!inner(full_name)').order('id').limit(1000),
      supabase.from('jobs').select('id, title, application_deadline').eq('status', 'published')
        .or(`application_deadline.is.null,application_deadline.gte.${new Date().toISOString().slice(0, 10)}`)
        .order('title').limit(1000),
      loadAllQualityRecords('job_match_evaluation_examples', 'id, candidate_id, job_id, expected_match, reviewed_at'),
    ])
    const students = requireData(studentsResult.data, studentsResult.error, 'Unable to load candidates for evaluation.') || []
    const jobs = requireData(jobsResult.data, jobsResult.error, 'Unable to load published jobs for evaluation.') || []
    const studentNames = new Map(students.map((item) => [item.id, item.profiles?.full_name || 'Student']))
    const jobTitles = new Map(jobs.map((item) => [item.id, item.title]))
    return {
      students: students.map((item) => ({ id: item.id, full_name: studentNames.get(item.id) })),
      jobs,
      reviews: reviewsResult.map((item) => ({
        ...item,
        candidate_name: studentNames.get(item.candidate_id) || 'Student',
        job_title: jobTitles.get(item.job_id) || 'Job unavailable',
      })),
    }
  },

  async saveJobMatchEvaluationExample(candidateId, jobId, expectedMatch) {
    if (!candidateId || !jobId || typeof expectedMatch !== 'boolean') {
      throw new Error('Choose a candidate, a published job, and the reviewed match outcome.')
    }
    const { data, error } = await supabase.rpc('save_job_match_evaluation_example', {
      p_candidate_id: candidateId,
      p_job_id: jobId,
      p_expected_match: expectedMatch,
    })
    return requireData(data, error, 'Unable to save the reviewed matching example.')
  },

  async getUsers(filters = {}) {
    let request = supabase.from('profiles')
      .select('id, full_name, email, role, company_name, avatar_url, created_at')
      .order('created_at', { ascending: false })
    if (filters.role) request = request.eq('role', filters.role)
    const search = String(filters.search || '').trim().slice(0, 100)
    if (search) {
      const escapedSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      request = request.or(`full_name.ilike."%${escapedSearch}%",email.ilike."%${escapedSearch}%"`)
    }
    const { data, error } = await request
    return requireData(data, error, 'Unable to load users.')
  },

  async getUser(id) {
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, email, role, company_name, avatar_url, created_at, student_profiles(institution, programme, education_level, city, district, country, profile_completion), employer_profiles(company_name, industry, website, verified, verification_status, city, district, country, company_size)')
      .eq('id', id)
      .single()
    return requireData(data, error, 'Unable to load this user.')
  },

  async getCertificateReviews(status = 'pending') {
    const allowedStatuses = ['pending', 'verified', 'rejected', 'requires_correction', 'all']
    if (!allowedStatuses.includes(status)) throw new Error('Choose a valid certificate review status.')
    const pageSize = 500
    const certificates = []
    let offset = 0
    while (true) {
      let request = supabase.from('certificates')
        .select('id, student_id, title, issuer, issue_date, expiry_date, credential_id, credential_url, file_path, verification_status, verification_method, verification_notes, verified_by, verified_at, created_at, student_profiles!inner(id, profiles!inner(full_name, email)), certificate_review_history(id, event_type, previous_status, new_status, actor_id, reviewer_id, verification_method, reason, created_at, reviewer:profiles!certificate_review_history_reviewer_id_fkey(full_name))')
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (status !== 'all') request = request.eq('verification_status', status)
      const { data, error } = await request
      const page = requireData(data, error, 'Unable to load certificate reviews.')
      certificates.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return Promise.all(certificates.map(async (certificate) => {
      if (!certificate.file_path) return { ...certificate, file_url: null }
      const { data, error } = await supabase.storage
        .from('student-certificates')
        .createSignedUrl(certificate.file_path, 600)
      if (error) throw new Error(`Unable to open the uploaded certificate for ${certificate.student_profiles?.profiles?.full_name || 'this candidate'}: ${error.message}`)
      return { ...certificate, file_url: data.signedUrl }
    }))
  },

  async getEmployerVerificationSubmissions(status = 'pending') {
    const allowedStatuses = ['pending', 'verified', 'rejected', 'all']
    if (!allowedStatuses.includes(status)) throw new Error('Choose a valid employer verification status.')
    const pageSize = 500
    const submissions = []
    let offset = 0
    while (true) {
      let request = supabase.from('employer_verification_submissions')
        .select('id, employer_id, legal_business_name, registration_number, registration_authority, registration_country, representative_name, representative_role, document_path, status, reviewer_feedback, submitted_at, reviewed_at, reviewed_by, employer_profiles!inner(id, company_name, industry, email, phone, website, city, district, country), employer_verification_events(id, actor_id, action, note, created_at)')
        .order('submitted_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (status !== 'all') request = request.eq('status', status)
      const { data, error } = await request
      const page = requireData(data, error, 'Unable to load employer verification submissions.')
      submissions.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    return Promise.all(submissions.map(async (submission) => {
      const { data, error } = await supabase.storage
        .from('employer-verification-documents')
        .createSignedUrl(submission.document_path, 600)
      if (error) {
        throw new Error(`Unable to open verification evidence for ${submission.employer_profiles?.company_name || 'this employer'}: ${error.message}`)
      }
      return { ...submission, document_url: data.signedUrl }
    }))
  },

  async reviewEmployerVerificationSubmission(id, decision, feedback = '') {
    const normalizedFeedback = String(feedback).trim()
    if (!id || !['verified', 'rejected'].includes(decision)) {
      throw new Error('Choose a submission and a valid verification decision.')
    }
    if (decision === 'rejected' && !normalizedFeedback) {
      throw new Error('Add feedback before rejecting an employer verification submission.')
    }
    const { data, error } = await supabase.rpc('review_employer_verification_submission', {
      p_submission_id: id,
      p_decision: decision,
      p_feedback: normalizedFeedback || null,
    })
    return requireData(data, error, 'Unable to save the employer verification review.')
  },

  async getInterviewPolicyReports(status = 'open') {
    const allowedStatuses = ['open', 'reviewing', 'resolved', 'dismissed', 'all']
    if (!allowedStatuses.includes(status)) throw new Error('Choose a valid interview report status.')
    let request = supabase.from('interview_policy_reports')
      .select('id, interview_id, reporter_id, category, details, status, resolution_note, created_at, reviewed_at, profiles!interview_policy_reports_reporter_id_fkey(full_name, email), interviews!inner(id, scheduled_at, notes, applications!inner(jobs!inner(title, employer_id)))')
      .order('created_at', { ascending: false })
    if (status !== 'all') request = request.eq('status', status)
    const { data, error } = await request
    return requireData(data, error, 'Unable to load interview reports.')
  },

  async reviewInterviewPolicyReport(id, status, resolutionNote = '') {
    if (!id || !['reviewing', 'resolved', 'dismissed'].includes(status)) {
      throw new Error('Choose an interview report and a valid review status.')
    }
    const note = String(resolutionNote).trim()
    if (note.length > 2000) throw new Error('Review notes must be 2,000 characters or fewer.')
    const { data, error } = await supabase.rpc('admin_review_interview_policy_report', {
      p_report_id: id,
      p_status: status,
      p_resolution_note: note || null,
    })
    return requireData(data, error, 'Unable to save the interview report review.')
  },

  async reviewCertificate(id, { status, method = null, notes = '' }, reviewerId) {
    if (!id || !reviewerId) throw new Error('Choose a certificate and sign in as an administrator.')
    const review = normalizeCertificateReview({ status, method, reason: notes })
    const { data, error } = await supabase.rpc('review_student_certificate', {
      p_certificate_id: id,
      p_decision: review.status,
      p_method: review.method,
      p_reason: review.reason,
    })
    return requireData(data, error, 'Unable to save the certificate review. It may already have been reviewed.')
  },

  async getEmployers(search = '') {
    let request = supabase.from('employer_profiles')
      .select('id, company_name, industry, description, website, email, phone, country, district, city, logo_url, company_size, verified, verification_status, created_at, jobs(id, status), employment(id)')
      .order('created_at', { ascending: false })
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('company_name', `%${normalizedSearch}%`)
    const { data, error } = await request
    return requireData(data, error, 'Unable to load employers.')
  },

  async getEmployer(id) {
    const { data, error } = await supabase.from('employer_profiles')
      .select('id, company_name, industry, description, website, email, phone, country, district, city, logo_url, company_size, verified, verification_status, created_at, jobs(id, title, status, location, created_at, applications(id)), employment(id)')
      .eq('id', id)
      .single()
    return requireData(data, error, 'Unable to load this employer.')
  },

  async getJobs(filters = {}) {
    let request = supabase.from('jobs')
      .select('id, employer_id, title, department, description, location, employment_type, work_mode, salary_min, salary_max, currency, experience_required, education_required, application_deadline, status, published_at, created_at, employer_profiles(company_name, email), applications(id, status)')
      .order('created_at', { ascending: false })
    if (filters.status) request = request.eq('status', filters.status)
    const search = String(filters.search || '').trim().slice(0, 100)
    if (search) request = request.ilike('title', `%${search}%`)
    const { data, error } = await request
    return requireData(data, error, 'Unable to load jobs.')
  },

  async getJob(id) {
    const { data, error } = await supabase.from('jobs')
      .select(ADMIN_JOB_DETAIL_SELECT)
      .eq('id', id)
      .single()
    return requireData(data, error, 'Unable to load this job.')
  },

  async updateJobStatus(id, status) {
    if (!ALLOWED_JOB_STATUSES.includes(status)) {
      throw new Error('Choose a valid job status.')
    }
    const changes = { status }
    if (status === 'published') changes.published_at = new Date().toISOString()
    const { data, error } = await supabase.from('jobs').update(changes).eq('id', id).select().single()
    return requireData(data, error, 'Unable to update job status.')
  },

  async getSkills(search = '') {
    let request = supabase.from('skills')
      .select('id, name, category, description, aliases, skill_type, status, approval_status, is_internal, source_type, user_skills(id), job_skills!job_skills_skill_id_fkey(id), career_skills(id), assessments(id), learning_resource_skills(id), project_skills(id), certificate_skills(id), portfolio_skills(id), career_opportunity_skills(skill_id)')
      .order('name')
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('name', `%${normalizedSearch}%`)
    const { data, error } = await request
    return requireData(data, error, 'Unable to load skills.')
  },

  async extractSkillsPdf(file, accessToken) {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_URL || 'http://localhost:4000'}/api/admin/skills/extract-pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf',
      },
      body: file,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 404 || payload.error === 'Route not found.') {
        throw new Error('The skills PDF endpoint is not available on the API server. Restart the local app with "npm run dev" or redeploy the API server, then upload the PDF again.')
      }
      throw new Error(payload.error || 'Unable to extract text from the skills PDF.')
    }
    return payload.data?.text || ''
  },

  async importSkills(skills) {
    if (!Array.isArray(skills) || !skills.length) throw new Error('Select at least one skill to submit for review.')
    const recordsByName = new Map()
    for (const skill of skills) {
      const validation = validateSkillCandidate(skill)
      if (!validation.valid) {
        throw new Error(`${validation.name || 'Skill'}: ${validation.errors[0]}`)
      }
      const { name, category, description } = validation
      const normalizedName = normalizeSkillCatalogName(name)
      if (recordsByName.has(normalizedName)) {
        throw new Error(`The selected skills contain a duplicate name: ${name}.`)
      }
      recordsByName.set(normalizedName, {
        name,
        category,
        description,
        status: 'active',
        approval_status: 'pending',
        is_internal: false,
        source_type: 'pdf_import',
      })
    }
    const records = [...recordsByName.values()]
    const { data: existingSkills, error: existingSkillsError } = await supabase.from('skills')
      .select('name, normalized_name')
      .neq('status', 'archived')
      .eq('is_internal', false)
    const existing = requireData(existingSkills, existingSkillsError, 'Unable to check for duplicate skills.')
    const existingNames = new Set(existing.map((skill) => (
      skill.normalized_name || normalizeSkillCatalogName(skill.name)
    )))
    const duplicate = records.find((skill) => existingNames.has(normalizeSkillCatalogName(skill.name)))
    if (duplicate) throw new Error(`A skill with the normalized name "${duplicate.name}" already exists in the catalog.`)

    const { data, error } = await supabase
      .from('skills')
      .upsert(records, { onConflict: 'name', ignoreDuplicates: true })
      .select('id, name')
    const imported = requireData(data, error, 'Unable to add detected skills to the catalog.')
    clearCacheByPrefix('skills:')
    return imported
  },

  async reviewSkill(id, action, details = null) {
    if (!['approved', 'rejected', 'archived'].includes(action)) {
      throw new Error('Choose whether to approve, reject, or archive this skill.')
    }
    let changes
    if (action === 'archived') {
      changes = { status: 'archived' }
    } else if (action === 'approved') {
      const validation = validateSkillCandidate(details)
      if (!validation.valid) throw new Error(validation.errors[0])

      const { data: duplicate, error: duplicateError } = await supabase.from('skills')
        .select('id, name')
        .eq('normalized_name', normalizeSkillCatalogName(validation.name))
        .neq('id', id)
        .neq('status', 'archived')
        .eq('is_internal', false)
        .maybeSingle()
      if (duplicateError) throw new Error('Unable to check for duplicate skills before approval.')
      if (duplicate) throw new Error(`"${validation.name}" duplicates the existing skill "${duplicate.name}".`)

      changes = {
        name: validation.name,
        category: validation.category,
        description: validation.description,
        status: 'active',
        approval_status: 'approved',
      }
    } else {
      changes = { approval_status: 'rejected' }
    }

    const { data, error } = await supabase
      .from('skills')
      .update(changes)
      .eq('id', id)
      .select('id, name, category, description, status, approval_status, is_internal, source_type')
      .single()
    const reviewedSkill = requireData(data, error, 'Unable to update skill review status.')
    clearCacheByPrefix('skills:')
    return reviewedSkill
  },

  async getSkillReviewHistory(skillId) {
    const { data, error } = await supabase.from('skill_catalog_review_events')
      .select('id, action, actor_id, old_approval_status, new_approval_status, old_status, new_status, created_at')
      .eq('skill_id', skillId)
      .order('created_at', { ascending: false })
      .limit(20)
    return requireData(data, error, 'Unable to load the skill review history.')
  },

  async getCareers({ search = '', status = '', sector = '', page = 1, pageSize = 12 } = {}) {
    let request = supabase.from('careers')
      .select('id, title, sector, description, entry_level, growth_path, salary_range, demand_level, status, academic_programmes, required_qualifications, created_at, career_skills(id, is_required, required_level, importance, skills(id, name))', { count: 'exact' })
      .order('title')
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('title', `%${normalizedSearch}%`)
    if (status) request = request.eq('status', status)
    if (sector) request = request.eq('sector', sector)
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1))
    const currentPageSize = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 12)))
    const { data, error, count: total } = await request.range(
      (currentPage - 1) * currentPageSize,
      currentPage * currentPageSize - 1,
    )
    return {
      items: requireData(data, error, 'Unable to load careers.'),
      total: total || 0,
      page: currentPage,
      pageSize: currentPageSize,
    }
  },

  async getCareerSectors() {
    const { data, error } = await supabase.from('careers').select('sector').order('sector')
    return [...new Set(requireData(data, error, 'Unable to load career sectors.')
      .map((item) => item.sector?.trim())
      .filter(Boolean))]
  },

  async getCareerLearningResources() {
    const { data, error } = await supabase.from('learning_resources')
      .select('id, title, provider, resource_type, url')
      .eq('status', 'published')
      .order('title')
      .limit(500)
    return requireData(data, error, 'Unable to load career learning resources.')
  },

  async getCareer(id) {
    const { data, error } = await supabase.from('careers')
      .select('id, title, sector, description, entry_level, growth_path, salary_range, demand_level, status, academic_programmes, required_qualifications, responsibilities, opportunity_areas, outlook_summary, outlook_source, outlook_source_url, outlook_verified_at, outlook_verified_by, published_at, archived_at, created_at, updated_at, career_skills(id, skill_id, is_required, required_level, importance, skills(id, name, category, status, approval_status, is_internal)), career_learning_resources(id, learning_resource_id, learning_resources(id, title, provider, resource_type, url))')
      .eq('id', id)
      .single()
    const career = requireData(data, error, 'Unable to load this career.')
    const referenceTables = ['career_recommendations', 'career_roadmaps', 'career_progress', 'learning_paths', 'assessments']
    const referenceResults = await Promise.all(referenceTables.map((table) => supabase.from(table)
      .select('id', { count: 'exact', head: true })
      .eq('career_id', id)))
    const referenceCounts = {}
    referenceResults.forEach((result, index) => {
      if (result.error) throw new Error(result.error.message || 'Unable to check career references.')
      referenceCounts[referenceTables[index]] = result.count || 0
    })
    return { ...career, reference_counts: referenceCounts }
  },

  async saveCareer(career) {
    const changes = {
      id: career.id || null,
      title: String(career.title || '').trim(),
      sector: String(career.sector || '').trim(),
      description: String(career.description || '').trim(),
      entry_level: String(career.entry_level || '').trim() || null,
      growth_path: String(career.growth_path || '').trim() || null,
      status: career.status || 'draft',
      academic_programmes: career.academic_programmes || [],
      required_qualifications: career.required_qualifications || [],
      responsibilities: career.responsibilities || [],
      opportunity_areas: career.opportunity_areas || [],
      outlook_summary: String(career.outlook_summary || '').trim() || null,
      outlook_source: String(career.outlook_source || '').trim() || null,
      outlook_source_url: String(career.outlook_source_url || '').trim() || null,
      outlook_reviewed: Boolean(career.outlook_reviewed),
    }
    const skillRequirements = career.skill_requirements || []
    const validationError = validateCareerDefinition({
      ...changes,
      skill_requirements: skillRequirements,
    })
    if (validationError) throw new Error(validationError)
    const { data, error } = await supabase.rpc('save_career_definition', {
      p_career: changes,
      p_skill_requirements: skillRequirements,
      p_learning_resource_ids: career.learning_resource_ids || [],
    })
    return requireData(data, error, 'Unable to save career.')
  },

  async updateCareerStatus(id, status) {
    const { data, error } = await supabase.rpc('update_career_definition_status', {
      p_career_id: id,
      p_status: status,
    })
    return requireData(data, error, 'Unable to update career status.')
  },

  async deleteCareer(id) {
    const { data, error } = await supabase.rpc('delete_career_definition', {
      p_career_id: id,
    })
    return requireData(data, error, 'Unable to delete career.')
  },

  async getLearningResources(filters = {}) {
    if (typeof filters === 'string') filters = { search: filters }
    const {
      search = '',
      type = '',
      status = '',
      category = '',
      difficulty = '',
      skillId = '',
      careerId = '',
      page = 1,
      pageSize = 12,
    } = filters
    const skillRelation = skillId
      ? 'learning_resource_skills!inner(id, skill_id, skills(id, name, category, status, approval_status, is_internal))'
      : 'learning_resource_skills(id, skill_id, skills(id, name, category, status, approval_status, is_internal))'
    const careerRelation = careerId
      ? 'learning_resource_careers!inner(id, career_id, careers(id, title, status))'
      : 'learning_resource_careers(id, career_id, careers(id, title, status))'
    let request = supabase.from('learning_resources')
      .select(`id, title, description, resource_type, url, provider, skill_id, difficulty, duration_minutes, free, category, status, published_at, archived_at, created_at, skills(id, name, category), ${skillRelation}, ${careerRelation}`, { count: 'exact' })
      .order('created_at', { ascending: false })
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('title', `%${normalizedSearch}%`)
    if (type) request = request.eq('resource_type', type)
    if (status) request = request.eq('status', status)
    if (category) request = request.eq('category', category)
    if (difficulty) request = request.eq('difficulty', difficulty)
    if (skillId) request = request.eq('learning_resource_skills.skill_id', skillId)
    if (careerId) request = request.eq('learning_resource_careers.career_id', careerId)
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1))
    const currentPageSize = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 12)))
    const { data, error, count: total } = await request.range(
      (currentPage - 1) * currentPageSize,
      currentPage * currentPageSize - 1,
    )
    return {
      items: requireData(data, error, 'Unable to load learning resources.'),
      total: total || 0,
      page: currentPage,
      pageSize: currentPageSize,
    }
  },

  async getLearningResource(id) {
    const { data, error } = await supabase.from('learning_resources')
      .select('id, title, description, resource_type, url, provider, skill_id, difficulty, duration_minutes, free, category, status, published_at, archived_at, created_at, updated_at, skills(id, name, category), learning_resource_skills(id, skill_id, skills(id, name, category, status, approval_status, is_internal)), learning_resource_careers(id, career_id, careers(id, title, status))')
      .eq('id', id)
      .single()
    return requireData(data, error, 'Unable to load this learning resource.')
  },

  async getPublishedCareersForResources() {
    const { data, error } = await supabase.from('careers')
      .select('id, title')
      .eq('status', 'published')
      .order('title')
    return requireData(data, error, 'Unable to load published careers.')
  },

  async getLearningResourceFilterOptions() {
    const [skillsResult, careersResult] = await Promise.all([
      supabase.from('skills').select('id, name').order('name'),
      supabase.from('careers').select('id, title, status').order('title'),
    ])
    const skills = requireData(skillsResult.data, skillsResult.error, 'Unable to load learning resource skill filters.')
    const careers = requireData(careersResult.data, careersResult.error, 'Unable to load learning resource career filters.')
    return { skills, careers }
  },

  async saveLearningResource(resource) {
    const duration = resource.duration_minutes === '' || resource.duration_minutes == null
      ? null
      : Number(resource.duration_minutes)
    const url = String(resource.url || '').trim()
    const skillIds = Array.isArray(resource.skill_ids)
      ? resource.skill_ids
      : resource.skill_id ? [resource.skill_id] : []
    const careerIds = Array.isArray(resource.career_ids) ? resource.career_ids : []
    const changes = {
      ...(resource.id ? { id: resource.id } : {}),
      title: String(resource.title || '').trim(),
      description: String(resource.description || '').trim(),
      resource_type: resource.resource_type,
      url: url || null,
      provider: String(resource.provider || '').trim() || null,
      category: String(resource.category || '').trim() || null,
      difficulty: String(resource.difficulty || '').trim() || null,
      duration_minutes: duration,
      free: Boolean(resource.free),
      status: resource.status || 'draft',
    }
    const validationError = validateLearningResource({
      ...changes,
      skill_ids: skillIds,
      career_ids: careerIds,
    })
    if (validationError) throw new Error(validationError)
    const { data, error } = await supabase.rpc('save_learning_resource', {
      p_resource: changes,
      p_skill_ids: skillIds,
      p_career_ids: careerIds,
    })
    return requireData(data, error, 'Unable to save learning resource.')
  },

  async updateLearningResourceStatus(id, status) {
    const { data, error } = await supabase.rpc('update_learning_resource_status', {
      p_resource_id: id,
      p_status: status,
    })
    return requireData(data, error, 'Unable to update learning resource status.')
  },

  async getCareerOpportunities(filters = {}) {
    if (typeof filters === 'string') filters = { search: filters }
    const {
      search = '',
      type = '',
      status = '',
      skillId = '',
      careerId = '',
      page = 1,
      pageSize = 12,
    } = filters
    const skillRelation = skillId
      ? 'career_opportunity_skills!inner(skill_id, skills(id, name, category, status, approval_status, is_internal))'
      : 'career_opportunity_skills(skill_id, skills(id, name, category, status, approval_status, is_internal))'
    const careerRelation = careerId
      ? 'career_opportunity_careers!inner(career_id, careers(id, title, status))'
      : 'career_opportunity_careers(career_id, careers(id, title, status))'
    let request = supabase.from('career_opportunities')
      .select(`*, ${skillRelation}, ${careerRelation}`, { count: 'exact' })
      .order('created_at', { ascending: false })
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('title', `%${normalizedSearch}%`)
    if (type) request = request.eq('opportunity_type', type)
    if (status) request = request.eq('status', status)
    if (skillId) request = request.eq('career_opportunity_skills.skill_id', skillId)
    if (careerId) request = request.eq('career_opportunity_careers.career_id', careerId)
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1))
    const currentPageSize = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 12)))
    const { data, error, count: total } = await request.range(
      (currentPage - 1) * currentPageSize,
      currentPage * currentPageSize - 1,
    )
    return {
      items: requireData(data, error, 'Unable to load training and scholarship opportunities.'),
      total: total || 0,
      page: currentPage,
      pageSize: currentPageSize,
    }
  },

  async getPublishedCareersForOpportunities() {
    const { data, error } = await supabase.from('careers')
      .select('id, title')
      .eq('status', 'published')
      .order('title')
    return requireData(data, error, 'Unable to load published careers.')
  },

  async saveCareerOpportunity(opportunity) {
    const payload = buildCareerOpportunityPayload(opportunity)
    const { skill_ids: skillIds, career_ids: careerIds, ...opportunityData } = payload
    const { data, error } = await supabase.rpc('save_career_opportunity', {
      p_opportunity: opportunityData,
      p_skill_ids: skillIds,
      p_career_ids: careerIds,
    })
    const saved = requireData(data, error, 'Unable to save this opportunity.')
    return saved
  },

  async getAssessments(search = '') {
    let request = supabase.from('assessments')
      .select('id, title, description, assessment_type, duration_minutes, difficulty, passing_score, status, created_at, job_id, career_id, skill_id, skills(id, name), careers(id, title), job_assessments(job_id), assessment_questions(id, question, question_type, options, points, difficulty), assessment_results(id)')
      .order('created_at', { ascending: false })
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    if (normalizedSearch) request = request.ilike('title', `%${normalizedSearch}%`)
    const { data, error } = await request
    return requireData(data, error, 'Unable to load assessments.')
  },

  async getAssessment(id) {
    const { data, error } = await supabase.from('assessments')
      .select('id, title, description, assessment_type, duration_minutes, difficulty, passing_score, status, created_at, updated_at, skills(id, name), careers(id, title), assessment_questions(id, question, question_type, points, difficulty), assessment_results(id)')
      .eq('id', id)
      .single()
    return requireData(data, error, 'Unable to load this assessment.')
  },

  async updateAssessmentStatus(id, status) {
    if (!['draft', 'published', 'archived'].includes(status)) {
      throw new Error('Choose a valid assessment status.')
    }
    if (status === 'published') {
      const { count: questionCount, error: questionsError } = await supabase
        .from('assessment_questions')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', id)
      if (questionsError) throw new Error('Unable to verify assessment questions before publishing.')
      if (!questionCount) throw new Error('Add at least one question before publishing this assessment.')
    }
    const { data, error } = await supabase.from('assessments').update({ status }).eq('id', id).select().single()
    return requireData(data, error, 'Unable to update assessment status.')
  },

  async getApplications({ search = '', status = '', page = 0, pageSize = 20 } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    const safePage = Math.max(0, Math.floor(Number(page) || 0))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)))
    const offset = safePage * safePageSize
    const end = offset + safePageSize - 1
    let matchingStudentIds = []
    let matchingJobIds = []

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch.replace(/[\\%_]/g, '\\$&')}%`
      const [nameResult, emailResult, jobsResult] = await Promise.all([
        supabase.from('profiles').select('id').ilike('full_name', searchPattern).limit(500),
        supabase.from('profiles').select('id').ilike('email', searchPattern).limit(500),
        supabase.from('jobs').select('id').ilike('title', searchPattern).limit(500),
      ])
      if (nameResult.error || emailResult.error) throw new Error('Unable to search applicants.')
      if (jobsResult.error) throw new Error('Unable to search jobs.')
      matchingStudentIds = [...new Set([...(nameResult.data || []), ...(emailResult.data || [])].map((profile) => profile.id))]
      matchingJobIds = (jobsResult.data || []).map((job) => job.id)
      if (!matchingStudentIds.length && !matchingJobIds.length) {
        return { items: [], total: 0, page: safePage, pageSize: safePageSize }
      }
    }

    let request = supabase.from('applications')
      .select('id, student_id, job_id, status, applied_at, updated_at, jobs!inner(id, title, location, employer_profiles(company_name))', { count: 'exact' })
      .order('applied_at', { ascending: false })
      .range(offset, end)
    if (status) request = request.eq('status', status)
    if (normalizedSearch) {
      const searchFilters = []
      if (matchingStudentIds.length) searchFilters.push(`student_id.in.(${matchingStudentIds.join(',')})`)
      if (matchingJobIds.length) searchFilters.push(`job_id.in.(${matchingJobIds.join(',')})`)
      request = request.or(searchFilters.join(','))
    }
    const { data, error, count: total } = await request
    const applications = requireData(data, error, 'Unable to load applications.')
    const studentIds = [...new Set((applications || []).map((item) => item.student_id).filter(Boolean))]
    let profilesById = new Map()
    if (studentIds.length) {
      const { data: profiles, error: profileError } = await supabase.from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', studentIds)
      if (profileError) throw new Error('Unable to load applicant profiles.')
      profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
    }
    return {
      items: (applications || []).map((item) => ({ ...item, applicant: profilesById.get(item.student_id) || null })),
      total: total || 0,
      page: safePage,
      pageSize: safePageSize,
    }
  },

  async getApplication(id) {
    const { data, error } = await supabase.from('applications')
      .select('id, student_id, job_id, status, applied_at, updated_at, cover_letter, jobs!inner(id, title, description, location, employment_type, employer_profiles(company_name)), application_events(id, event_type, title, description, event_date, created_at)')
      .eq('id', id)
      .single()
    const application = requireData(data, error, 'Unable to load this application.')
    let applicant = null
    if (application.student_id) {
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', application.student_id)
        .maybeSingle()
      if (profileError) throw new Error('Unable to load this applicant profile.')
      applicant = profile
    }
    return { ...application, applicant }
  },

  async getAiMonitoring() {
    const since24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [
      recommendationCount,
      feedbackCount,
      careerFeedbackCount,
      decisionCount,
      openReviewCount,
      eventCount,
      careerRecommendationCount,
      matchCount,
      requestEventCount,
      successfulRequestCount,
      fallbackRequestCount,
      validationErrorCount,
      unavailableRequestCount,
      failedRequestCount,
      geminiRequestCount24h,
      geminiAvailableCount24h,
      recommendations,
      feedback,
      careerFeedback,
      decisions,
      reviewQueue,
      governanceEvents,
      requestEvents,
    ] = await Promise.all([
      count('ai_recommendations'),
      count('ai_feedback'),
      count('career_feedback'),
      count('ai_decision_logs'),
      count('ai_review_queue', { review_status: 'open' }),
      count('ai_governance_events'),
      count('career_recommendations'),
      count('job_matches'),
      count('ai_request_events'),
      count('ai_request_events', { request_outcome: 'success' }),
      count('ai_request_events', { request_outcome: 'fallback' }),
      count('ai_request_events', { request_outcome: 'validation_error' }),
      count('ai_request_events', { request_outcome: 'unavailable' }),
      count('ai_request_events', { request_outcome: 'failure' }),
      countSince('ai_request_events', since24Hours, { model_provider: 'google-gemini' }, { provider_status: ['ok', 'invalid', 'unavailable'] }),
      countSince('ai_request_events', since24Hours, { model_provider: 'google-gemini' }, { provider_status: ['ok', 'invalid'] }),
      recentRows('ai_recommendations', 'id, recommendation_type, model_name, feedback_status, created_at'),
      recentRows('ai_feedback', 'id, recommendation_id, is_useful, created_at'),
      recentRows('career_feedback', 'id, is_useful, relevance_rating, suitability_rating, created_at'),
      recentRows('ai_decision_logs', 'id, feature_type, related_entity_type, model_provider, model_version, confidence_score, validation_status, created_at'),
      recentRows('ai_review_queue', 'id, recommendation_id, feature_type, reason, severity, review_status, created_at'),
      recentRows('ai_governance_events', 'id, event_type, summary, created_at'),
      recentRows('ai_request_events', 'id, feature_type, request_outcome, model_provider, model_identifier, provider_status, validation_status, error_category, provider_response_id, duration_ms, http_status, created_at'),
    ])
    return {
      metrics: {
        recommendations: recommendationCount,
        feedback: feedbackCount,
        careerFeedback: careerFeedbackCount,
        decisions: decisionCount,
        openReviews: openReviewCount,
        governanceEvents: eventCount,
        careerRecommendations: careerRecommendationCount,
        jobMatches: matchCount,
        requests: requestEventCount,
        successfulRequests: successfulRequestCount,
        fallbackRequests: fallbackRequestCount,
        validationErrors: validationErrorCount,
        unavailableRequests: unavailableRequestCount,
        failedRequests: failedRequestCount,
        geminiRequests24h: geminiRequestCount24h,
        geminiAvailability24h: geminiRequestCount24h
          ? Math.round((geminiAvailableCount24h / geminiRequestCount24h) * 100)
          : null,
      },
      recommendations,
      feedback,
      careerFeedback,
      decisions,
      reviewQueue,
      governanceEvents,
      requestEvents,
      quality: {
        totalRecommendations: recommendationCount,
        totalDecisionLogs: decisionCount,
        totalFeedbackRecords: feedbackCount,
        openReviewItems: openReviewCount,
      },
      fairness: {
        status: 'Not assessed',
        summary: 'This view does not have comparable-group fairness metrics configured.',
      },
      errors: decisions.filter((item) => ['failed', 'invalid', 'error'].includes(String(item.validation_status).toLowerCase())),
    }
  },

  async getAiMonitoringQuality() {
    const data = await this.getAiMonitoring()
    return data.quality
  },

  async getAiMonitoringFairness() {
    const data = await this.getAiMonitoring()
    return data.fairness
  },

  async getAiMonitoringErrors() {
    const data = await this.getAiMonitoring()
    return data.errors
  },

  async getAuditLogs({ search = '', entityType = '', fromDate = '', toDate = '', page = 0, pageSize = 25 } = {}) {
    const safePage = Math.max(0, Math.floor(Number(page) || 0))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 25)))
    const offset = safePage * safePageSize
    const normalizedSearch = String(search || '').trim().slice(0, 100)
    const normalizeDate = (value) => {
      const date = String(value || '').trim()
      if (!date) return ''
      const parsed = new Date(`${date}T00:00:00.000Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
        || Number.isNaN(parsed.getTime())
        || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error('Choose a valid audit date range.')
      }
      return date
    }
    const startDate = normalizeDate(fromDate)
    const endDate = normalizeDate(toDate)
    if (startDate && endDate && startDate > endDate) {
      throw new Error('The audit start date cannot be after its end date.')
    }
    let request = supabase.from('admin_logs')
      .select('id, admin_id, actor_role, action, entity_type, entity_id, description, action_result, before_summary, after_summary, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + safePageSize - 1)
    if (entityType) request = request.eq('entity_type', entityType)
    if (startDate) request = request.gte('created_at', `${startDate}T00:00:00.000Z`)
    if (endDate) {
      const exclusiveEnd = new Date(`${endDate}T00:00:00.000Z`)
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      request = request.lt('created_at', exclusiveEnd.toISOString())
    }
    if (normalizedSearch) {
      const escapedSearch = normalizedSearch.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      request = request.or(`action.ilike."%${escapedSearch}%",entity_type.ilike."%${escapedSearch}%",description.ilike."%${escapedSearch}%"`)
    }

    const { data, error, count: total } = await request
    const records = requireData(data, error, 'Unable to load audit logs.')
    const adminIds = [...new Set(records.map((record) => record.admin_id).filter(Boolean))]
    let adminsById = new Map()
    if (adminIds.length) {
      const { data: profiles, error: profileError } = await supabase.from('profiles')
        .select('id, full_name, email')
        .in('id', adminIds)
      if (profileError) throw new Error('Unable to load audit administrator profiles.')
      adminsById = new Map((profiles || []).map((profile) => [profile.id, profile]))
    }

    return {
      items: records.map((record) => ({ ...record, admin: adminsById.get(record.admin_id) || null })),
      total: total || 0,
      page: safePage,
      pageSize: safePageSize,
    }
  },

  async getDataQualityOverview() {
    const [profiles, jobs, applications, assessments, skills, learningResources, employers] = await Promise.all([
      loadAllQualityRecords('profiles', 'id, role, email'),
      loadAllQualityRecords('jobs', 'id, employer_id, title, description, status'),
      loadAllQualityRecords('applications', 'id, student_id, job_id, status'),
      loadAllQualityRecords('assessments', 'id, title, description, assessment_type, passing_score'),
      loadAllQualityRecords('skills', 'id, name'),
      loadAllQualityRecords('learning_resources', 'id, title, description, resource_type'),
      loadAllQualityRecords('employer_profiles', 'id, company_name, industry, description, email'),
    ])

    const sections = [
      {
        entity: 'Users',
        records: profiles,
        description: 'Valid role and email address',
        problems: (record) => getDataQualityProblems('Users', record),
      },
      {
        entity: 'Jobs',
        records: jobs,
        description: 'Required job fields and valid status',
        problems: (record) => getDataQualityProblems('Jobs', record),
      },
      {
        entity: 'Applications',
        records: applications,
        description: 'Valid student, job, and lifecycle status references',
        problems: (record) => getDataQualityProblems('Applications', record),
      },
      {
        entity: 'Assessments',
        records: assessments,
        description: 'Required assessment details and valid passing score',
        problems: (record) => getDataQualityProblems('Assessments', record),
      },
      {
        entity: 'Skills',
        records: skills,
        description: 'Skill names are present and descriptive',
        problems: (record) => getDataQualityProblems('Skills', record),
      },
      {
        entity: 'Learning Resources',
        records: learningResources,
        description: 'Required title, description, and valid resource type',
        problems: (record) => getDataQualityProblems('Learning Resources', record),
      },
      {
        entity: 'Employers',
        records: employers,
        description: 'Required company profile details',
        problems: (record) => getDataQualityProblems('Employers', record),
      },
    ]

    let totalRecordsChecked = 0
    let validRecords = 0
    const issues = []

    const summarizedSections = sections.map((section) => {
      let valid = 0
      let sectionIssues = 0
      for (const record of section.records) {
        const problems = section.problems(record)
        if (!problems.length) {
          valid += 1
          continue
        }
        sectionIssues += 1
        issues.push({
          entity: section.entity,
          recordId: record.id || 'unknown',
          problem: problems.join('; '),
          severity: 'medium',
          status: 'open',
        })
      }
      totalRecordsChecked += section.records.length
      validRecords += valid
      return {
        entity: section.entity,
        description: section.description,
        total: section.records.length,
        valid,
        issues: sectionIssues,
      }
    })

    return {
      summary: {
        totalRecordsChecked,
        validRecords,
        recordsNeedingAttention: issues.length,
        dataQualityScore: computeDataQualityScore(validRecords, totalRecordsChecked),
        checkedAt: new Date().toISOString(),
      },
      sections: summarizedSections,
      issues,
    }
  },

  async getSystemHealth() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw new Error('Unable to verify your administrator session.')
    if (!session?.access_token) throw new Error('Sign in with an administrator account to view system health.')

    let response
    try {
      response = await fetch(`${getApiBaseUrl()}/api/admin/system-health`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
    } catch {
      return unavailableSystemHealth('The backend API health endpoint could not be reached.')
    }

    const payload = await response.json().catch(() => null)
    if (response.status === 401 || response.status === 403) {
      throw new Error(payload?.error || 'Administrator access is required to view system health.')
    }
    if (!response.ok || payload?.ok !== true) {
      return unavailableSystemHealth(`The backend API health endpoint returned HTTP ${response.status}.`, 'degraded')
    }
    if (!Array.isArray(payload.data?.checks) || typeof payload.data?.checkedAt !== 'string') {
      return unavailableSystemHealth('The backend API returned an invalid health-check response.', 'degraded')
    }
    return payload.data
  },

  async getSecurityOverview() {
    const runtimeConfiguration = await getApiSecurityConfiguration()
    return buildSecurityOverview({
      hasSupabaseUrl: supabaseConfigStatus.hasUrl,
      hasSupabaseKey: supabaseConfigStatus.hasPublishableKey || supabaseConfigStatus.hasAnonKey,
      ...runtimeConfiguration,
    })
  },

  async writeAudit(action, entityType, entityId, description, metadata = null) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('admin_logs').insert({ admin_id: user?.id, action, entity_type: entityType, entity_id: entityId, description, metadata }).select().single()
    return requireData(data, error, 'Unable to record administrative action.')
  },
}
