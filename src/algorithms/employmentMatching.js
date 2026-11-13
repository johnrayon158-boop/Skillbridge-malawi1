import { normalizeSkillName } from '../utils/dataValidation.js'

const LEVEL_SCORE = { novice: 20, beginner: 25, basic: 35, developing: 45, intermediate: 60, proficient: 70, advanced: 80, expert: 95 }
const getSkillName = (skill) => typeof skill === 'string'
  ? skill
  : skill?.skills?.name || skill?.name || skill?.skill_name || skill?.skill || skill?.title || ''
const scoreLevel = (value, fallback = 25) => {
  const label = String(value ?? '').trim().toLowerCase()
  if (Object.hasOwn(LEVEL_SCORE, label)) return LEVEL_SCORE[label]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric <= 5 && numeric > 0 ? [0, 25, 45, 60, 80, 95][Math.round(numeric)] : numeric)) : fallback
}
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const normalizeString = (value) => String(value || '').trim().toLowerCase()
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const EMPLOYMENT_MATCH_WEIGHTS = {
  skills: 0.5,
  career_target: 0.05,
  education: 0.15,
  assessments: 0.1,
  projects: 0.08,
  certificates: 0.04,
  portfolio: 0.03,
  experience: 0.05,
}

function getStudentProfile(candidate) {
  const profiles = candidate?.profile?.student_profiles
  return (Array.isArray(profiles) ? profiles[0] : profiles) || candidate?.profile || candidate || {}
}

const includesPhrase = (text, phrase) => {
  const normalizedText = normalizeSkillName(text)
  const normalizedPhrase = normalizeSkillName(phrase)
  return Boolean(normalizedText && normalizedPhrase && new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(normalizedPhrase)}($|[^a-z0-9])`,
  ).test(normalizedText))
}

function overlapScore(left, right) {
  const leftWords = new Set(normalizeSkillName(left).split(/\s+/).filter((word) => word.length > 2))
  const rightWords = new Set(normalizeSkillName(right).split(/\s+/).filter((word) => word.length > 2))
  if (!leftWords.size || !rightWords.size) return null
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length
  return Math.round((overlap / Math.max(leftWords.size, rightWords.size)) * 100)
}

function scoreCareerTarget(candidate, job) {
  const profile = getStudentProfile(candidate)
  const targetRole = profile.target_role || candidate?.target_role
  if (!targetRole) return null

  const jobText = [job?.title, job?.description, job?.employer_profiles?.industry].filter(Boolean).join(' ')
  const roleScore = includesPhrase(job?.title, targetRole)
    ? 100
    : overlapScore(targetRole, jobText)
  if (roleScore === null) return null

  const supportingGoalScore = overlapScore(profile.career_goal || candidate?.career_goal, jobText)
  return Math.round(roleScore * 0.8 + Math.max(roleScore, supportingGoalScore ?? roleScore) * 0.2)
}

const getRequirements = (job) => {
  const rows = Array.isArray(job?.job_skills) ? job.job_skills : []
  const fallback = Array.isArray(job?.required_skills) ? job.required_skills : Array.isArray(job?.requirements) ? job.requirements : Array.isArray(job?.skills) ? job.skills : []
  return [...rows, ...fallback].map((item) => ({
    name: String(getSkillName(item) || '').trim(),
    requiredLevel: item?.required_level || item?.requiredLevel || 'beginner',
    importance: Math.max(1, Number(item?.importance) || 1),
    isRequired: item?.is_required !== false,
  })).filter((item, index, all) => item.name && all.findIndex((candidate) => normalizeSkillName(candidate.name) === normalizeSkillName(item.name)) === index)
}

const getProjectText = (candidate) => (Array.isArray(candidate?.projects) ? candidate.projects : [])
  .flatMap((item) => [item?.title, item?.description, ...(Array.isArray(item?.project_skills) ? item.project_skills : []).map(getSkillName)])
  .filter(Boolean).join(' ')
const getCertificateText = (candidate) => (Array.isArray(candidate?.certificates) ? candidate.certificates : [])
  .flatMap((item) => [item?.title, item?.description, item?.issuer])
  .filter(Boolean).join(' ')
const getPortfolioText = (candidate) => [candidate?.portfolio?.title, candidate?.portfolio?.description].filter(Boolean).join(' ')

const matchEducation = (candidate, job) => {
  const required = normalizeString(job?.education_required)
  if (!required) return null
  const education = [
    ...(Array.isArray(candidate?.education) ? candidate.education : []),
    ...(Array.isArray(candidate?.profile?.student_profiles) ? candidate.profile.student_profiles : [candidate?.profile?.student_profiles].filter(Boolean)),
  ].map((row) => [row?.education_level, row?.qualification, row?.programme, row?.field_of_study].filter(Boolean).join(' ').toLowerCase())
  if (!education.some(Boolean)) return 0
  return education.some((value) => value.includes(required) || required.includes(value)) ? 100 : 35
}

const matchExperience = (candidate, job) => {
  const required = Number.parseFloat(String(job?.experience_required || '').match(/\d+(?:\.\d+)?/)?.[0] || '')
  if (!Number.isFinite(required)) return null
  const profile = Array.isArray(candidate?.profile?.student_profiles) ? candidate.profile.student_profiles[0] : candidate?.profile?.student_profiles
  const statedYears = Number(profile?.years_experience ?? candidate?.years_experience)
  const employmentRows = Array.isArray(candidate?.employment) ? candidate.employment : []
  const employmentYears = employmentRows.reduce((total, item) => {
    if (!item?.start_date || Number.isNaN(Date.parse(item.start_date))) return total
    const end = item.end_date && !Number.isNaN(Date.parse(item.end_date)) ? Date.parse(item.end_date) : Date.now()
    return total + Math.max(0, end - Date.parse(item.start_date)) / (365.25 * 24 * 60 * 60 * 1000)
  }, 0)
  const actual = Number.isFinite(statedYears) ? Math.max(0, statedYears) : employmentYears
  return required <= 0 ? 100 : Math.min(100, Math.round((actual / required) * 100))
}

export function matchCandidateToJob(candidate = {}, job = {}) {
  const candidateSkills = Array.isArray(candidate?.skills)
    ? candidate.skills
    : Array.isArray(candidate?.skillSet)
      ? candidate.skillSet
      : Array.isArray(candidate?.profile?.skills) ? candidate.profile.skills : []
  const skillMap = new Map(candidateSkills.map((item) => [
    normalizeSkillName(getSkillName(item)),
    scoreLevel(item?.level ?? item?.current_level ?? item?.proficiency ?? item?.confidence, 0),
  ]).filter(([name]) => name))
  const requirements = getRequirements(job)
  const matched = []
  const requiredMatched = []
  const preferredMatched = []
  const developing = []
  const requiredDeveloping = []
  const gaps = []
  const preferredMissing = []
  const weighted = []

  for (const requirement of requirements) {
    const normalized = normalizeSkillName(requirement.name)
    const candidateLevel = skillMap.get(normalized)
    const requiredLevel = scoreLevel(requirement.requiredLevel)
    if (candidateLevel === undefined) {
      if (requirement.isRequired) {
        gaps.push(requirement.name)
        weighted.push({ score: 0, importance: requirement.importance })
      } else {
        preferredMissing.push(requirement.name)
        weighted.push({ score: 40, importance: requirement.importance })
      }
    } else {
      const ratio = Math.min(100, Math.round((candidateLevel / requiredLevel) * 100))
      weighted.push({ score: ratio, importance: requirement.importance })
      if (candidateLevel >= requiredLevel) {
        matched.push(requirement.name)
        if (requirement.isRequired) requiredMatched.push(requirement.name)
        else preferredMatched.push(requirement.name)
      } else {
        developing.push(requirement.name)
        if (requirement.isRequired) requiredDeveloping.push(requirement.name)
      }
    }
  }

  const skillsScore = weighted.length
    ? Math.round(weighted.reduce((sum, item) => sum + item.score * item.importance, 0) / weighted.reduce((sum, item) => sum + item.importance, 0))
    : null

  const assessmentRows = Array.isArray(candidate?.assessments) ? candidate.assessments : []
  const requirementSet = new Set(requirements.map((item) => normalizeSkillName(item.name)))
  const latestAssessmentByEvidence = new Map()
  for (const item of assessmentRows) {
    const skill = normalizeSkillName(item?.assessments?.skills?.name || item?.skills?.name || item?.skill_name || item?.skill)
    const score = Number(item?.percentage ?? item?.score ?? item?.result_score)
    const assessmentJobId = item?.assessments?.job_id || item?.job_id
    const jobSpecific = Boolean(job?.id && assessmentJobId === job.id)
    if ((!requirementSet.has(skill) && !jobSpecific) || !Number.isFinite(score) || score < 0 || score > 100) continue
    const evidenceKey = requirementSet.has(skill) ? `skill:${skill}` : `job:${item.assessment_id || item.assessments?.id || 'assessment'}`
    const current = latestAssessmentByEvidence.get(evidenceKey)
    const resultDate = Date.parse(item?.completed_at || item?.created_at || '')
    const currentDate = Date.parse(current?.completed_at || current?.created_at || '')
    if (!current || (Number.isFinite(resultDate) && (!Number.isFinite(currentDate) || resultDate >= currentDate))) {
      latestAssessmentByEvidence.set(evidenceKey, item)
    }
  }
  const assessmentScore = average([...latestAssessmentByEvidence.values()]
    .map((item) => Number(item?.percentage ?? item?.score ?? item?.result_score)))

  const projectText = getProjectText(candidate)
  const certificateText = getCertificateText(candidate)
  const portfolioText = getPortfolioText(candidate)
  const evidenceCoverage = (text) => requirements.length
    ? Math.round((requirements.filter((item) => includesPhrase(text, item.name)).length / requirements.length) * 100)
    : null
  const projectScore = requirements.length && Array.isArray(candidate?.projects) && candidate.projects.length
    ? evidenceCoverage(projectText)
    : null
  const certificateScore = requirements.length && Array.isArray(candidate?.certificates) && candidate.certificates.length
    ? evidenceCoverage(certificateText)
    : null
  const portfolioScore = requirements.length && candidate?.portfolio
    ? evidenceCoverage(portfolioText)
    : null
  const educationScore = matchEducation(candidate, job)
  const experienceScore = matchExperience(candidate, job)
  const careerTargetScore = scoreCareerTarget(candidate, job)

  const factors = Object.entries(EMPLOYMENT_MATCH_WEIGHTS)
    .map(([name, weight]) => [name, {
      skills: skillsScore,
      career_target: careerTargetScore,
      education: educationScore,
      assessments: assessmentScore,
      projects: projectScore,
      certificates: certificateScore,
      portfolio: portfolioScore,
      experience: experienceScore,
    }[name], weight])
    .filter(([, value]) => value !== null)
  const factorWeight = factors.reduce((sum, [, , weight]) => sum + weight, 0)
  const overallMatch = factorWeight
    ? Math.round(factors.reduce((sum, [, value, weight]) => sum + value * weight, 0) / factorWeight)
    : 0
  const factorScores = Object.fromEntries(factors.map(([name, value]) => [name, Math.round(value)]))
  const explanation = `${requiredMatched.length} required skills meet the target proficiency; ${requiredDeveloping.length} are below target and ${gaps.length} are missing. ${preferredMatched.length} preferred skills meet the target; ${preferredMissing.length} preferred skills are not recorded and do not count as missing requirements. The career-target factor prioritizes your structured target occupation; your career-goal description is supporting context. The skills factor uses recorded skill levels; assessed results are scored separately using the latest result per listed skill. Match score uses ${factors.map(([name]) => name).join(', ') || 'no available evidence'}.`

  return {
    overallMatch,
    match_score: overallMatch,
    skills_score: skillsScore,
    career_target_score: careerTargetScore,
    education_score: educationScore,
    assessment_score: assessmentScore,
    project_score: projectScore,
    certificate_score: certificateScore,
    portfolio_score: portfolioScore,
    experience_score: experienceScore,
    factors: factorScores,
    candidate,
    job,
    matches: matched,
    strong_matches: matched,
    required_matches: requiredMatched,
    preferred_matches: preferredMatched,
    developing_skills: developing,
    preferred_missing_skills: preferredMissing,
    gaps,
    missing_requirements: gaps,
    explanation,
  }
}
