import { analyzeSkillGaps } from './skillGapAnalysis.js'
import { normalizeSkillName } from '../utils/dataValidation.js'
import { isCertificateIndependentlyVerified } from '../utils/certificateVerification.js'
import { calculateLearningProgressMetrics } from '../utils/studentProgressMetrics.js'

const LEVEL_SCORES = {
  novice: 20,
  beginner: 25,
  basic: 35,
  developing: 45,
  intermediate: 60,
  proficient: 70,
  advanced: 80,
  expert: 95,
}

export const CAREER_READINESS_WEIGHTS = {
  skills: 30,
  assessments: 30,
  projects: 15,
  certificates: 10,
  learning: 15,
}

const round = (value) => Math.round(Math.max(0, Math.min(100, value)))

function scoreSkillLevel(value) {
  const label = String(value ?? '').trim().toLowerCase()
  if (Object.hasOwn(LEVEL_SCORES, label)) return LEVEL_SCORES[label]
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric > 0 && numeric <= 5) return [0, 25, 45, 60, 80, 95][Math.round(numeric)]
  return numeric >= 0 && numeric <= 100 ? round(numeric) : null
}

function getAssessmentScore(result) {
  const rawScore = result?.percentage ?? result?.score
  if (rawScore === null || rawScore === undefined || String(rawScore).trim() === '') return null
  const score = Number(rawScore)
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null
}

export function getLatestAssessmentResults(results) {
  const latest = new Map()
  for (const result of Array.isArray(results) ? results : []) {
    if (getAssessmentScore(result) === null) continue
    const key = result.assessment_id || result.id
    if (!key) continue
    const current = latest.get(key)
    const date = Date.parse(result.completed_at || result.created_at || '')
    const currentDate = Date.parse(current?.completed_at || current?.created_at || '')
    if (!current || (Number.isFinite(date) && (!Number.isFinite(currentDate) || date >= currentDate))) {
      latest.set(key, result)
    }
  }
  return [...latest.values()]
}

export function calculateAssessmentAverage(results) {
  const scores = getLatestAssessmentResults(results).map(getAssessmentScore)
  return scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null
}

export function calculateCareerReadiness(data = {}) {
  const skillRows = Array.isArray(data.skills) ? data.skills : []
  const skillsByName = new Map()
  for (const skill of skillRows) {
    const name = normalizeSkillName(skill.skills?.name || skill.name || '')
    const key = skill.skill_id || skill.skills?.id || name || skill.id
    if (key && !skillsByName.has(key)) skillsByName.set(key, skill)
  }
  const skills = [...skillsByName.values()]
  const levels = skills.map((skill) => scoreSkillLevel(skill.level ?? skill.proficiency))
    .filter((score) => score !== null)
  const requirements = (data.targetCareer?.career_skills || [])
    .filter((requirement) => requirement?.skills?.name || requirement?.name)
  const skillGaps = analyzeSkillGaps(skills, requirements).map((gap) => (
    gap.gap === 'missing' ? { ...gap, currentLevel: 'Not recorded' } : gap
  ))
  const requiredScores = requirements.map((requirement) => {
    const requiredScore = scoreSkillLevel(requirement.required_level ?? requirement.requiredLevel) ?? 70
    const gap = skillGaps.find((item) => normalizeSkillName(item.name) === normalizeSkillName(requirement.skills?.name || requirement.name))
    return { requiredScore, achievedScore: Math.max(0, requiredScore - (gap?.gapSize || 0)) }
  })
  const targetSkillCoverage = requiredScores.length
    ? round(requiredScores.reduce((sum, item) => sum + item.achievedScore, 0)
      / requiredScores.reduce((sum, item) => sum + item.requiredScore, 0) * 100)
    : null
  const latestAssessments = getLatestAssessmentResults(data.assessments)
  const assessmentScores = latestAssessments.map(getAssessmentScore)
  const projects = Array.isArray(data.projects) ? data.projects : []
  const completedProjects = projects.filter((project) => project.status === 'completed').length
  const certificates = Array.isArray(data.certificates) ? data.certificates : []
  const verifiedCertificates = certificates.filter(isCertificateIndependentlyVerified).length
  const employment = Array.isArray(data.employment) ? data.employment : []
  const learningMetrics = calculateLearningProgressMetrics(data.learningProgress)
  const evidenceCounts = {
    self_reported_skills: levels.length,
    assessments: assessmentScores.length,
    projects: projects.length,
    certificates: certificates.length,
    verified_certificates: verifiedCertificates,
    employment: employment.length,
    learning_items: learningMetrics.trackedCount,
  }

  const scores = {
    skills_score: levels.length
      ? targetSkillCoverage ?? round(levels.reduce((sum, score) => sum + score, 0) / levels.length)
      : null,
    assessment_score: assessmentScores.length
      ? round(assessmentScores.reduce((sum, score) => sum + score, 0) / assessmentScores.length)
      : null,
    certificate_score: certificates.length
      ? round(verifiedCertificates / certificates.length * 100)
      : null,
    projects_score: projects.length ? round(completedProjects / projects.length * 100) : null,
    learning_score: learningMetrics.average,
  }
  const hasEvidence = Object.values(scores).some((score) => score !== null)
  const readinessScore = round(
    (scores.skills_score ?? 0) * CAREER_READINESS_WEIGHTS.skills / 100
    + (scores.assessment_score ?? 0) * CAREER_READINESS_WEIGHTS.assessments / 100
    + (scores.certificate_score ?? 0) * CAREER_READINESS_WEIGHTS.certificates / 100
    + (scores.projects_score ?? 0) * CAREER_READINESS_WEIGHTS.projects / 100
    + (scores.learning_score ?? 0) * CAREER_READINESS_WEIGHTS.learning / 100,
  )

  return {
    readiness_score: hasEvidence ? readinessScore : null,
    ...scores,
    assessment_average: calculateAssessmentAverage(data.assessments),
    self_reported_skills_score: levels.length ? round(levels.reduce((sum, score) => sum + score, 0) / levels.length) : null,
    target_career: data.targetCareer?.title || null,
    skill_gaps: skillGaps,
    has_evidence: hasEvidence,
    evidence_counts: evidenceCounts,
    evidence_availability: {
      skills: levels.length > 0,
      assessments: assessmentScores.length > 0,
      projects: projects.length > 0,
      certificates: certificates.length > 0,
      learning: learningMetrics.trackedCount > 0,
    },
    weights: CAREER_READINESS_WEIGHTS,
  }
}
