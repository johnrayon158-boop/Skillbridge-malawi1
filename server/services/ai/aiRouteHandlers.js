import {
  calculateCareerRoadmap,
  calculateJobMatches,
  calculateJobReadiness,
  calculateLearningRecommendations,
  calculateSkillGaps,
} from './aiScoringService.js'
import {
  normalizeJobMatches,
  normalizeLearningRecommendations,
  normalizeSkillGaps,
} from './responseSchemas.js'
import {
  generateInterviewFeedback,
  generateInterviewPreparation,
} from './interviewPreparationService.js'
import {
  aggregateSkillEvidence,
  calculateEvidenceTrust,
  getValidatedEmployerCompetencies,
} from '../evidenceTrustService.js'
import { getVisibleEmploymentTypes } from '../../../src/utils/candidateType.js'

export const AI_POST_ROUTES = Object.freeze([
  '/api/ai/skills-gap',
  '/api/ai/learning-recommendations',
  '/api/ai/job-match',
  '/api/employer/job-match-analysis',
  '/api/ai/job-readiness',
  '/api/ai/career-roadmap',
  '/api/ai/feedback',
  '/api/ai/interview-preparation',
  '/api/ai/interview-feedback',
  '/api/ai/skill-evidence',
  '/api/ai/evidence-graph',
  '/api/ai/career-simulation',
])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const calculateValidated = (feature, calculate, fallback, normalize) => {
  try {
    const result = normalize(calculate())
    if (result) return result
  } catch {
    // Re-run the deterministic calculation below if an injected scorer fails.
  }
  console.warn(`[ai] ${feature} scoring response was invalid; using deterministic fallback.`)
  const result = normalize(fallback())
  if (!result) throw new Error(`Unable to calculate a valid ${feature} response.`)
  return result
}
const calculateCompleteJobMatches = (input, scoring, jobs) => {
  const isComplete = (result) => result?.matches?.length === jobs.length &&
    jobs.every((job) => result.matches.some((match) => match.job_id === job.id))
  const result = calculateValidated(
    'job-match',
    () => scoring.calculateJobMatches(input),
    () => calculateJobMatches(input),
    normalizeJobMatches,
  )
  if (isComplete(result)) return result

  console.warn('[ai] job-match response omitted eligible jobs; using deterministic fallback.')
  const fallback = normalizeJobMatches(calculateJobMatches(input))
  if (!isComplete(fallback)) throw new Error('Unable to calculate a match for every eligible job.')
  return fallback
}
const getCareerSkills = (career) => (career?.career_skills || [])
  .map((item) => item?.skills?.name || item?.skill_name || item?.name || '')
  .filter(Boolean)
const getJobSkills = (job) => (job?.job_skills || [])
  .map((item) => item?.skills?.name || item?.skill_name || item?.name || '')
  .filter(Boolean)
const getCareerRequirements = (career) => (career?.career_skills || [])
  .map((item) => ({
    name: item?.skills?.name || item?.skill_name || item?.name || '',
    required_level: item?.required_level || item?.requiredLevel,
  }))
  .filter((item) => item.name)
const getJobRequirements = (job) => (job?.job_skills || [])
  .map((item) => ({
    name: item?.skills?.name || item?.skill_name || item?.name || '',
    required_level: item?.required_level || item?.requiredLevel,
  }))
  .filter((item) => item.name)
const getAssessmentRows = (rows = []) => rows.map((result) => ({
  ...result,
  skill_name: result?.assessments?.skills?.name || result?.skills?.name || result?.skill_name || '',
}))

export function createAiRouteHandlers({
  authenticate,
  getProfile,
  loadStudentData,
  loadCareer,
  loadJob,
  loadJobs,
  loadEmployerApplications,
  getStoredJobMatches,
  loadOwnedApplication,
  saveJobMatches,
  saveRecommendationFeedback,
  getJsonBody,
  sendJson,
  errorResponse,
  scoring = {
    calculateCareerRoadmap,
    calculateJobMatches,
    calculateJobReadiness,
    calculateLearningRecommendations,
    calculateSkillGaps,
  },
  interview = { generateInterviewFeedback, generateInterviewPreparation },
  evidence = { aggregateSkillEvidence, calculateEvidenceTrust },
}) {
  async function respond(req, res, callback) {
    try {
      const body = await getJsonBody(req)
      if (!isRecord(body)) {
        sendJson(res, 400, errorResponse('The request body must be a JSON object.', 400))
        return
      }

      const user = await authenticate(req)
      if (!user) {
        sendJson(res, 401, errorResponse('Please sign in again to use this feature.', 401))
        return
      }
      if (body.studentId && body.studentId !== user.id) {
        sendJson(res, 403, errorResponse('You can only use this feature with your own profile.', 403))
        return
      }

      const profile = await getProfile(user.id)
      if (!profile) {
        sendJson(res, 404, errorResponse('Your student profile was not found.', 404))
        return
      }
      if (!['student', 'graduate'].includes(profile.role)) {
        sendJson(res, 403, errorResponse('This feature is available to student and graduate accounts.', 403))
        return
      }

      const data = await callback(body, user, profile)
      sendJson(res, 200, { ok: true, data })
    } catch (error) {
      if (error?.message === 'Invalid JSON request body.') {
        sendJson(res, 400, errorResponse(error.message, 400))
        return
      }
      if (error?.statusCode === 400 || error?.statusCode === 404 || error?.statusCode === 422) {
        sendJson(res, error.statusCode, errorResponse(error.message, error.statusCode))
        return
      }
      console.error(`Unable to process AI endpoint: ${error?.message || 'Unknown error'}`)
      sendJson(res, 503, errorResponse('This feature is temporarily unavailable. Please try again later.', 503))
    }
  }

  const requireId = (value, label) => {
    if (!isNonEmptyString(value) || value.trim().length > 120) {
      const error = new Error(`A valid ${label} is required.`)
      error.statusCode = 400
      throw error
    }
    return value.trim()
  }
  const asMatchResponse = (match, job = {}) => {
    const factors = match.factors || {
      skills: match.skills_score,
      career_target: match.career_target_score,
      education: match.education_score,
      assessments: match.assessment_score,
      projects: match.project_score,
      certificates: match.certificate_score,
      portfolio: match.portfolio_score,
      experience: match.experience_score,
    }
    return {
      job_id: match.job_id,
      title: match.title || job.title,
      employer: match.employer || job.employer_profiles?.company_name || 'Employer',
      location: match.location ?? job.location ?? '',
      employment_type: match.employment_type || job.employment_type || '',
      work_mode: match.work_mode || job.work_mode || '',
      application_deadline: match.application_deadline ?? job.application_deadline ?? null,
      match_score: match.match_score,
      skills_score: match.skills_score,
      career_target_score: match.career_target_score,
      education_score: match.education_score,
      assessment_score: match.assessment_score,
      project_score: match.project_score,
      portfolio_score: match.portfolio_score,
      certificate_score: match.certificate_score,
      experience_score: match.experience_score,
      factors: Object.fromEntries(Object.entries(factors).filter(([, score]) => score !== null && score !== undefined)),
      strong_matches: match.strong_matches || match.strong_skills || [],
      developing_skills: match.developing_skills || [],
      missing_requirements: match.missing_requirements || match.missing_skills || [],
      explanation: match.explanation || '',
      calculation_status: match.calculation_status || 'completed',
      calculation_reason: match.calculation_reason || null,
      calculated_at: match.calculated_at || null,
    }
  }

  async function respondEmployer(req, res) {
    try {
      const body = await getJsonBody(req)
      if (!isRecord(body)) {
        sendJson(res, 400, errorResponse('The request body must be a JSON object.', 400))
        return
      }

      const user = await authenticate(req)
      if (!user) {
        sendJson(res, 401, errorResponse('Please sign in again to review match analysis.', 401))
        return
      }
      const profile = await getProfile(user.id)
      if (!profile || profile.role !== 'employer') {
        sendJson(res, 403, errorResponse('Only employers can refresh match analysis for their applications.', 403))
        return
      }
      if (!Array.isArray(body.applicationIds) || body.applicationIds.length < 1 || body.applicationIds.length > 100) {
        sendJson(res, 400, errorResponse('Provide between 1 and 100 application IDs.', 400))
        return
      }
      const applicationIds = [...new Set(body.applicationIds.map((id) => requireId(id, 'application ID')))]
      const applications = await loadEmployerApplications(applicationIds, user.id)
      if (!Array.isArray(applications) || applications.length !== applicationIds.length) {
        sendJson(res, 404, errorResponse('One or more applications were not found for your employer account.', 404))
        return
      }

      const studentIds = [...new Set(applications.map((application) => application.student_id))]
      const jobIds = [...new Set(applications.map((application) => application.job_id))]
      const jobIdsByStudent = new Map(studentIds.map((studentId) => [
        studentId,
        [...new Set(applications
          .filter((application) => application.student_id === studentId)
          .map((application) => application.job_id))],
      ]))
      const [jobRows, savedRows] = await Promise.all([
        Promise.all(jobIds.map(async (jobId) => [jobId, await getJob(jobId)])),
        Promise.all(studentIds.map(async (studentId) => [
          studentId,
          await getStoredJobMatches(studentId, jobIdsByStudent.get(studentId)),
        ])),
      ])
      const jobsById = new Map(jobRows)
      const savedByPair = new Map()
      for (const [studentId, rows] of savedRows) {
        for (const row of rows || []) savedByPair.set(`${row.job_id}:${studentId}`, row)
      }
      const today = new Date().toISOString().slice(0, 10)
      const applicationsToRefresh = applications.filter((application) => {
        const saved = savedByPair.get(`${application.job_id}:${application.student_id}`)
        const job = jobsById.get(application.job_id)
        const jobIsMatchable = job?.status === 'published' &&
          (!job.application_deadline || job.application_deadline >= today)
        return !saved || !['completed', 'unavailable'].includes(saved.calculation_status) ||
          (!jobIsMatchable && saved.calculation_status !== 'unavailable')
      })
      const refreshStudentIds = [...new Set(applicationsToRefresh.map((application) => application.student_id))]
      const studentDataRows = await Promise.all(refreshStudentIds.map(async (studentId) => [
        studentId,
        await loadStudentData(studentId),
      ]))
      const studentDataById = new Map(studentDataRows)

      const results = []
      for (const application of applications) {
        const key = `${application.job_id}:${application.student_id}`
        const saved = savedByPair.get(key)
        const job = jobsById.get(application.job_id)
        const jobIsMatchable = job?.status === 'published' &&
          (!job.application_deadline || job.application_deadline >= today)
        if (saved && ['completed', 'unavailable'].includes(saved.calculation_status) &&
            (jobIsMatchable || saved.calculation_status === 'unavailable')) {
          results.push({ application_id: application.id, ...asMatchResponse(saved, job) })
          continue
        }

        const studentData = studentDataById.get(application.student_id)
        let match
        if (!jobIsMatchable) {
          const reason = 'This opportunity is no longer published or its application deadline has passed.'
          match = {
            job_id: application.job_id,
            match_score: 0,
            skills_score: null,
            career_target_score: null,
            education_score: null,
            assessment_score: null,
            project_score: null,
            portfolio_score: null,
            certificate_score: null,
            experience_score: null,
            strong_matches: [],
            developing_skills: [],
            missing_requirements: [],
            explanation: reason,
            calculation_status: 'unavailable',
            calculation_reason: reason,
            calculated_at: new Date().toISOString(),
          }
        } else {
          const input = {
            jobs: [job],
            studentSkills: studentData?.skills || [],
            profile: studentData?.profile || {},
            assessments: getAssessmentRows(studentData?.assessments || []),
            projects: studentData?.projects || [],
            certificates: studentData?.certificates || [],
            portfolio: studentData?.portfolio || null,
            employment: studentData?.employment || [],
            education: studentData?.education || [],
          }
          const calculation = calculateCompleteJobMatches(input, scoring, [job])
          match = {
            ...calculation.matches[0],
            calculation_status: 'completed',
            calculation_reason: null,
            calculated_at: new Date().toISOString(),
          }
        }
        await saveJobMatches({
          userId: application.student_id,
          matches: [match],
        })
        results.push({ application_id: application.id, ...asMatchResponse(match) })
      }

      sendJson(res, 200, { ok: true, data: { matches: results } })
    } catch (error) {
      if (error?.message === 'Invalid JSON request body.') {
        sendJson(res, 400, errorResponse(error.message, 400))
        return
      }
      if (error?.statusCode === 400 || error?.statusCode === 404) {
        sendJson(res, error.statusCode, errorResponse(error.message, error.statusCode))
        return
      }
      console.error(`Unable to refresh employer match analysis: ${error?.message || 'Unknown error'}`)
      sendJson(res, 503, errorResponse('Match analysis is temporarily unavailable. Please try again later.', 503))
    }
  }

  const getCareer = async (careerId) => {
    const career = await loadCareer(careerId)
    if (!career) {
      const error = new Error('The selected career was not found.')
      error.statusCode = 404
      throw error
    }
    return career
  }

  const getJob = async (jobId) => {
    const job = await loadJob(jobId)
    if (!job) {
      const error = new Error('The selected job was not found.')
      error.statusCode = 404
      throw error
    }
    return job
  }

  const handlers = {
    'POST /api/ai/skills-gap': (req, res) => respond(req, res, async (body, user) => {
      const targetCareerId = body.targetCareerId
      const targetJobId = body.targetJobId || body.jobId
      if (!targetCareerId && !targetJobId) {
        const error = new Error('Choose a career or job to analyze skill gaps.')
        error.statusCode = 400
        throw error
      }
      const target = targetCareerId
        ? await getCareer(requireId(targetCareerId, 'career ID'))
        : await getJob(requireId(targetJobId, 'job ID'))
      const studentData = await loadStudentData(user.id)
      const requiredSkills = targetCareerId ? getCareerRequirements(target) : getJobRequirements(target)
      const input = {
        studentSkills: studentData.skills || [],
        requiredSkills,
        learningResources: studentData.resources || [],
      }
      return calculateValidated(
        'skills-gap',
        () => scoring.calculateSkillGaps(input),
        () => calculateSkillGaps(input),
        normalizeSkillGaps,
      )
    }),

    'POST /api/ai/learning-recommendations': (req, res) => respond(req, res, async (body, user) => {
      const targetCareerId = body.targetCareerId
      const targetJobId = body.targetJobId || body.jobId
      if (!targetCareerId && !targetJobId) {
        const error = new Error('Choose a career or job to get learning recommendations.')
        error.statusCode = 400
        throw error
      }
      const target = targetCareerId
        ? await getCareer(requireId(targetCareerId, 'career ID'))
        : await getJob(requireId(targetJobId, 'job ID'))
      const studentData = await loadStudentData(user.id)
      const gapInput = {
        studentSkills: studentData.skills || [],
        requiredSkills: targetCareerId ? getCareerRequirements(target) : getJobRequirements(target),
        learningResources: studentData.resources || [],
      }
      const gaps = calculateValidated(
        'learning-recommendations skills-gap',
        () => scoring.calculateSkillGaps(gapInput),
        () => calculateSkillGaps(gapInput),
        normalizeSkillGaps,
      )
      const gapRows = gaps.gaps || [
        ...(gaps.skill_gaps || []).map((item) => ({ skill: item.skill, priority: item.priority, gap: item.gap })),
        ...(gaps.developing_skills || []).map((item) => ({ skill: item.skill, priority: 'Medium', gap: item.gap })),
      ]
      const recommendationInput = {
        gaps: gapRows,
        learningResources: studentData.resources || [],
        careerGoal: target.title || target.name || '',
      }
      return calculateValidated(
        'learning-recommendations',
        () => scoring.calculateLearningRecommendations(recommendationInput),
        () => calculateLearningRecommendations(recommendationInput),
        normalizeLearningRecommendations,
      )
    }),

    'POST /api/ai/job-match': (req, res) => respond(req, res, async (body, user, profile) => {
      const jobs = await loadJobs(user.id)
      const studentProfile = Array.isArray(profile.student_profiles) ? profile.student_profiles[0] : profile.student_profiles
      const candidateType = studentProfile?.candidate_type || (profile.role === 'graduate' ? 'graduate' : '')
      const allowedTypes = candidateType ? new Set(getVisibleEmploymentTypes(candidateType)) : null
      const today = new Date().toISOString().slice(0, 10)
      const validJobs = (jobs || []).filter((job) =>
        job?.id &&
        job.status === 'published' &&
        (!job.application_deadline || job.application_deadline >= today) &&
        (!allowedTypes || allowedTypes.has(job.employment_type)),
      )
      const stored = getStoredJobMatches
        ? await getStoredJobMatches(user.id, validJobs.map((job) => job.id))
        : []
      const storedByJob = new Map((stored || []).map((row) => [row.job_id, row]))
      const jobsToCalculate = validJobs.filter((job) =>
        !['completed', 'unavailable'].includes(storedByJob.get(job.id)?.calculation_status),
      )
      const studentData = jobsToCalculate.length ? await loadStudentData(user.id) : null
      const input = {
        studentSkills: studentData?.skills || [],
        profile,
        assessments: getAssessmentRows(studentData?.assessments || []),
        projects: studentData?.projects || [],
        certificates: studentData?.certificates || [],
        portfolio: studentData?.portfolio || null,
        employment: studentData?.employment || [],
        education: studentData?.education || [],
      }
      const calculated = jobsToCalculate.length
        ? calculateCompleteJobMatches({ ...input, jobs: jobsToCalculate }, scoring, jobsToCalculate).matches.map((match) => ({
          ...match,
          calculation_status: 'completed',
          calculation_reason: null,
          calculated_at: new Date().toISOString(),
        }))
        : []
      if (saveJobMatches && calculated.length) await saveJobMatches({ userId: user.id, matches: calculated })
      const cached = validJobs.flatMap((job) => {
        const row = storedByJob.get(job.id)
        return row && ['completed', 'unavailable'].includes(row.calculation_status)
          ? [asMatchResponse(row, job)]
          : []
      })
      return {
        matches: [...cached, ...calculated].sort((left, right) => right.match_score - left.match_score),
      }
    }),

    'POST /api/employer/job-match-analysis': respondEmployer,

    'POST /api/ai/job-readiness': (req, res) => respond(req, res, async (body, user) => {
      const job = await getJob(requireId(body.jobId, 'job ID'))
      const studentData = await loadStudentData(user.id)
      return scoring.calculateJobReadiness({
        studentSkills: studentData.skills || [],
        jobSkills: getJobSkills(job),
        assessments: getAssessmentRows(studentData.assessments || []),
      })
    }),

    'POST /api/ai/career-roadmap': (req, res) => respond(req, res, async (body, user) => {
      const career = await getCareer(requireId(body.targetCareerId, 'career ID'))
      const studentData = await loadStudentData(user.id)
      const gaps = scoring.calculateSkillGaps({
        studentSkills: studentData.skills || [],
        requiredSkills: getCareerSkills(career),
        learningResources: studentData.resources || [],
      })
      return scoring.calculateCareerRoadmap({
        career,
        gaps: [
          ...(gaps.skill_gaps || []).map((item) => ({ skill: item.skill, priority: item.priority })),
          ...(gaps.developing_skills || []).map((item) => ({ skill: item.skill, priority: 'Medium' })),
        ],
        learningResources: studentData.resources || [],
      })
    }),

    'POST /api/ai/feedback': (req, res) => respond(req, res, async (body, user) => {
      const recommendationId = requireId(body.recommendationId, 'recommendation ID')
      if (typeof body.isUseful !== 'boolean') {
        const error = new Error('Tell us whether this recommendation was useful.')
        error.statusCode = 400
        throw error
      }
      const reason = body.reason === undefined ? null : String(body.reason).trim()
      if (reason && reason.length > 1000) {
        const error = new Error('Feedback reason must be 1000 characters or fewer.')
        error.statusCode = 400
        throw error
      }
      return saveRecommendationFeedback({
        userId: user.id,
        recommendationId,
        isUseful: body.isUseful,
        reason,
      })
    }),

    'POST /api/ai/interview-preparation': (req, res) => respond(req, res, async (body, user) => {
      const jobId = requireId(body.jobId, 'job ID')
      const job = await getJob(jobId)
      if (body.applicationId) {
        const applicationId = requireId(body.applicationId, 'application ID')
        if (!await loadOwnedApplication(applicationId, user.id)) {
          const error = new Error('The selected application was not found in your account.')
          error.statusCode = 404
          throw error
        }
      }
      const studentData = await loadStudentData(user.id)
      return interview.generateInterviewPreparation({
        userId: user.id,
        jobId,
        applicationId: body.applicationId || null,
        candidateSkills: studentData.skills || [],
        assessmentResults: getAssessmentRows(studentData.assessments || []),
        projects: studentData.projects || [],
        jobRequirements: job,
        identifiedGaps: body.identifiedGaps || [],
      })
    }),

    'POST /api/ai/interview-feedback': (req, res) => respond(req, res, async (body) => {
      const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
      if (!answer || answer.length > 6000) {
        const error = new Error('Provide an interview answer of 1 to 6000 characters.')
        error.statusCode = 400
        throw error
      }
      for (const field of ['question', 'skill']) {
        if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > 500)) {
          const error = new Error(`${field} must be a string of 500 characters or fewer.`)
          error.statusCode = 400
          throw error
        }
      }
      return interview.generateInterviewFeedback({
        question: body.question || '',
        answer,
        skill: body.skill || '',
      })
    }),

    'POST /api/ai/skill-evidence': (req, res) => respond(req, res, async (body, user) => {
      const skillName = requireId(body.skillName, 'skill name')
      const studentData = await loadStudentData(user.id)
      const aggregated = evidence.aggregateSkillEvidence({
        userSkills: studentData.skills || [],
        assessmentResults: getAssessmentRows(studentData.assessments || []),
        projects: studentData.projects || [],
        certificates: studentData.certificates || [],
        portfolio: studentData.portfolio || null,
        employmentHistory: studentData.employment || [],
        employerFeedback: studentData.employerFeedback || [],
        skillEvidence: studentData.skillEvidence || [],
        candidateId: user.id,
        skillName,
      })
      const items = aggregated
      return {
        skillName,
        evidence: items,
        trust: evidence.calculateEvidenceTrust({ evidence: items, skillName }),
      }
    }),

    'POST /api/ai/evidence-graph': (req, res) => respond(req, res, async (_body, user) => {
      const studentData = await loadStudentData(user.id)
      const skillNames = new Map()
      const addSkillName = (value) => {
        const name = typeof value === 'string' ? value.trim() : ''
        if (name && !skillNames.has(name.toLocaleLowerCase())) skillNames.set(name.toLocaleLowerCase(), name)
      }
      for (const item of studentData.skills || []) addSkillName(item?.skills?.name || item?.name || item?.skill_name)
      for (const item of studentData.assessments || []) addSkillName(item?.assessments?.skills?.name || item?.skills?.name || item?.skill_name)
      for (const item of studentData.projects || []) {
        for (const link of item.project_skills || []) addSkillName(link?.skills?.name || link?.skill_name || link?.name)
      }
      for (const item of studentData.certificates || []) {
        for (const link of item.certificate_skills || []) addSkillName(link?.skills?.name || link?.skill_name || link?.name)
      }
      for (const link of studentData.portfolio?.portfolio_skills || []) addSkillName(link?.skills?.name || link?.skill_name || link?.name)
      for (const item of studentData.skillEvidence || []) addSkillName(item.skillName || item.user_skills?.skills?.name)
      for (const item of getValidatedEmployerCompetencies(studentData.employerFeedback || [], user.id)) addSkillName(item.skillName)

      return {
        skills: [...skillNames.values()].map((skillName) => {
          const aggregated = evidence.aggregateSkillEvidence({
            userSkills: studentData.skills || [],
            assessmentResults: getAssessmentRows(studentData.assessments || []),
            projects: studentData.projects || [],
            certificates: studentData.certificates || [],
            portfolio: studentData.portfolio || null,
            employmentHistory: studentData.employment || [],
            employerFeedback: studentData.employerFeedback || [],
            skillEvidence: studentData.skillEvidence || [],
            candidateId: user.id,
            skillName,
          })
          const items = aggregated
          return {
            skillName,
            evidence: items,
            trust: evidence.calculateEvidenceTrust({ evidence: items, skillName }),
          }
        }),
      }
    }),

    'POST /api/ai/career-simulation': (req, res) => respond(req, res, async (body, user) => {
      const career = await getCareer(requireId(body.targetCareerId, 'career ID'))
      const studentData = await loadStudentData(user.id)
      const requiredSkills = getCareerSkills(career)
      const current = scoring.calculateJobReadiness({
        studentSkills: studentData.skills || [],
        jobSkills: requiredSkills,
        assessments: getAssessmentRows(studentData.assessments || []),
      })
      const requestedSkills = body.completedSkills === undefined ? [] : body.completedSkills
      if (!Array.isArray(requestedSkills) || requestedSkills.some((skill) => !isNonEmptyString(skill) || skill.length > 100)) {
        const error = new Error('completedSkills must be a list of skill names.')
        error.statusCode = 400
        throw error
      }
      const requiredNames = new Set(requiredSkills.map((skill) => skill.toLocaleLowerCase()))
      if (requestedSkills.some((skill) => !requiredNames.has(skill.trim().toLocaleLowerCase()))) {
        const error = new Error('Only skills required by the selected career can be simulated.')
        error.statusCode = 400
        throw error
      }
      const simulatedSkills = [
        ...(studentData.skills || []),
        ...requestedSkills.map((name) => ({ name: name.trim(), level: 'expert' })),
      ]
      const projected = scoring.calculateJobReadiness({
        studentSkills: simulatedSkills,
        jobSkills: requiredSkills,
        assessments: getAssessmentRows(studentData.assessments || []),
      })
      return {
        career: { id: career.id, title: career.title || career.name },
        scenario: 'Hypothetical only: selected skills are treated as demonstrated at expert level.',
        completedSkills: [...new Set(requestedSkills.map((skill) => skill.trim()))],
        current,
        projected,
        readinessChange: (projected.overall_readiness || 0) - (current.overall_readiness || 0),
      }
    }),
  }

  return handlers
}
