import { normalizeSkillName } from '../../src/utils/dataValidation.js'
import { getValidatedEmployerCompetencies } from '../../src/utils/employerFeedbackRules.js'

const EVIDENCE_WEIGHTS = Object.freeze({ assessment: 0.7, employer: 0.3 })
const validScore = (value) => {
  const score = Number(value)
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null
}

export { getValidatedEmployerCompetencies }

function evidenceStatusForCertificate(certificate) {
  const recognizedMethod = ['issuer_registry', 'issuer_confirmation', 'credential_provider']
    .includes(certificate?.verification_method)
  const independentlyVerified = certificate?.verification_status === 'verified'
    && recognizedMethod
    && Boolean(certificate?.verified_by && certificate?.verified_at)
  if (independentlyVerified) return 'independently_verified'
  if (certificate?.verification_status === 'rejected') return 'rejected'
  return certificate?.file_path ? 'uploaded_not_verified' : 'recorded_not_verified'
}

export function calculateEvidenceTrust({ evidence = [], skillName = '', weights = EVIDENCE_WEIGHTS } = {}) {
  const items = Array.isArray(evidence) ? evidence : []
  const scored = items.filter((item) => ['assessment', 'employer'].includes(String(item?.type || '').toLowerCase()))
    .map((item) => ({
      ...item,
      score: validScore(item?.score ?? item?.strength),
      type: String(item?.type || '').toLowerCase(),
    }))
    .filter((item) => item.score !== null
      && (item.type !== 'employer' || item.evidenceStatus === 'reviewed_by_employer'))

  const categories = [...new Set(scored.map((item) => item.type))]
  const availableWeight = categories.reduce((sum, category) => sum + (weights[category] || 0), 0)
  const score = availableWeight
    ? Math.round(categories.reduce((sum, category) => {
      const categoryScores = scored.filter((item) => item.type === category).map((item) => item.score)
      const average = categoryScores.reduce((total, value) => total + value, 0) / categoryScores.length
      return sum + average * (weights[category] || 0)
    }, 0) / availableWeight)
    : null
  const verifiedCredentials = items.filter((item) => item.evidenceStatus === 'independently_verified').length
  const reviewedFeedback = items.filter((item) => item.evidenceStatus === 'reviewed_by_employer').length

  let label = 'Supporting evidence only'
  if (!items.length) label = 'No evidence recorded'
  else if (score !== null) label = score >= 85 ? 'Strong scored evidence' : score >= 60 ? 'Developing scored evidence' : 'Limited scored evidence'
  else if (verifiedCredentials) label = 'Credential independently verified; competency not scored'

  const reasons = []
  if (categories.includes('assessment')) reasons.push('Assessment score uses actual completed assessment results.')
  if (categories.includes('employer')) reasons.push('Employer ratings count only when feedback is administrator-validated and acknowledged by the candidate.')
  if (items.some((item) => ['student_submitted', 'uploaded_not_verified', 'recorded_not_verified'].includes(item.evidenceStatus))) {
    reasons.push('Student-uploaded records and portfolio work support the profile but do not establish independent verification.')
  }
  if (verifiedCredentials) reasons.push('Credential verification records include a supported verification method, reviewer, and timestamp.')
  if (!reasons.length) reasons.push(`Evidence for ${skillName || 'this skill'} has no numeric assessment or qualified employer rating.`)

  return {
    score,
    label,
    level: label,
    reasons,
    evidenceCount: items.length,
    scoredEvidenceCount: scored.length,
    verifiedCredentialCount: verifiedCredentials,
    reviewedFeedbackCount: reviewedFeedback,
    weighting: weights,
  }
}

export function aggregateSkillEvidence({
  userSkills = [],
  assessmentResults = [],
  projects = [],
  certificates = [],
  portfolio = null,
  employmentHistory = [],
  employerFeedback = [],
  skillEvidence = [],
  candidateId = '',
  skillName = '',
} = {}) {
  const requestedSkill = normalizeSkillName(skillName)
  const evidence = []
  const matchesSkill = (name) => normalizeSkillName(name) === requestedSkill
  const daysSince = (value) => {
    if (!value) return null
    const time = Date.parse(value)
    return Number.isFinite(time) ? Math.max(0, Math.ceil((Date.now() - time) / 86400000)) : null
  }

  for (const item of userSkills || []) {
    const name = item?.skills?.name || item?.name || item?.skill_name || ''
    if (matchesSkill(name)) evidence.push({
      type: 'self_reported',
      title: 'Student-reported skill profile',
      level: item.level || null,
      score: null,
      evidenceStatus: 'student_claim',
    })
  }

  const latestAssessments = new Map()
  for (const result of assessmentResults || []) {
    const name = result?.skills?.name || result?.assessments?.skills?.name || result?.skill_name || result?.skill || ''
    const score = validScore(result?.percentage ?? result?.score ?? result?.result_score)
    if (!matchesSkill(name) || score === null) continue
    const key = result.assessment_id || result.id
    const previous = latestAssessments.get(key)
    const date = Date.parse(result.completed_at || result.created_at || '')
    const previousDate = Date.parse(previous?.completed_at || previous?.created_at || '')
    if (!previous || (Number.isFinite(date) && (!Number.isFinite(previousDate) || date >= previousDate))) {
      latestAssessments.set(key, { result, name, score })
    }
  }
  for (const { result, score } of latestAssessments.values()) evidence.push({
    type: 'assessment',
    title: result.assessments?.title || 'Completed assessment',
    score,
    strength: score,
    completedAt: result.completed_at || result.created_at || null,
    days_since: daysSince(result.completed_at || result.created_at),
    evidenceStatus: 'assessed',
    assessmentId: result.assessment_id || result.id,
  })

  for (const project of projects || []) {
    const linked = (project.project_skills || []).some((item) => matchesSkill(
      item?.skills?.name || item?.skill_name || item?.name,
    ))
    if (!linked) continue
    evidence.push({
      type: 'project',
      title: project.title || 'Portfolio project',
      score: null,
      projectStatus: project.status || 'unknown',
      days_since: daysSince(project.updated_at),
      evidenceStatus: 'student_submitted',
      projectId: project.id,
    })
  }

  for (const certificate of certificates || []) {
    const linked = (certificate.certificate_skills || []).some((item) => matchesSkill(
      item?.skills?.name || item?.skill_name || item?.name,
    ))
    if (!linked) continue
    evidence.push({
      type: 'certificate',
      title: certificate.title || 'Certificate',
      score: null,
      verificationStatus: certificate.verification_status || 'pending',
      verificationMethod: certificate.verification_method || null,
      evidenceStatus: evidenceStatusForCertificate(certificate),
      days_since: daysSince(certificate.issue_date || certificate.created_at),
      certificateId: certificate.id,
    })
  }

  const portfolioSkillLinked = (portfolio?.portfolio_skills || []).some((item) => matchesSkill(
    item?.skills?.name || item?.skill_name || item?.name,
  ))
  if (portfolio && portfolioSkillLinked) evidence.push({
    type: 'portfolio',
    title: portfolio.title || 'Portfolio',
    score: null,
    evidenceStatus: 'student_submitted',
    days_since: daysSince(portfolio.updated_at),
    portfolioId: portfolio.id,
  })

  for (const item of skillEvidence || []) {
    if (!matchesSkill(item.skillName || item.user_skills?.skills?.name)) continue
    const verifierRole = item.verified_by_profile?.role
    const verified = item.verification_status === 'verified'
      && verifierRole === 'admin'
      && Boolean(item.verified_by && item.verified_at)
    evidence.push({
      type: item.evidence_type || 'other',
      title: item.title || 'Skill evidence',
      score: null,
      evidenceStatus: verified ? 'independently_verified' : 'student_submitted',
      verificationStatus: item.verification_status || 'pending',
      days_since: daysSince(item.created_at),
      evidenceId: item.id,
    })
  }

  evidence.push(...getValidatedEmployerCompetencies(employerFeedback, candidateId)
    .filter((item) => matchesSkill(item.skillName))
    .map((item) => ({ ...item, days_since: daysSince(item.reviewDate) })))

  void employmentHistory
  return evidence
}
