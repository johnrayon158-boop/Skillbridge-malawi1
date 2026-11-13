import { normalizeSkillName } from '../utils/dataValidation.js'
import { getValidatedEmployerCompetencies } from '../utils/employerFeedbackRules.js'

const LEVEL_SCORE = { novice: 20, beginner: 25, basic: 35, developing: 45, intermediate: 60, proficient: 70, advanced: 80, expert: 95 }
const getSkillName = (skill) => typeof skill === 'string'
  ? skill
  : skill?.skills?.name || skill?.name || skill?.skill_name || skill?.skill || ''
const scoreLevel = (value, fallback = 0) => {
  const text = String(value ?? '').trim().toLowerCase()
  if (Object.hasOwn(LEVEL_SCORE, text)) return LEVEL_SCORE[text]
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number <= 5 && number > 0 ? [0, 25, 45, 60, 80, 95][Math.round(number)] : number)) : fallback
}
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const getAssessments = (assessments) => Array.isArray(assessments) ? assessments : []
const getEducationRows = (education) => Array.isArray(education) ? education : education ? [education] : []
const getStudentProfile = (profile) => Array.isArray(profile?.student_profiles)
  ? profile.student_profiles[0]
  : profile?.student_profiles

function getSupportingGoalScore(careerGoal, career) {
  const goalTerms = new Set(normalizeSkillName(careerGoal).split(/\s+/).filter((term) => term.length > 2))
  const careerTerms = new Set(normalizeSkillName([
    career?.title,
    career?.sector,
    career?.description,
  ].filter(Boolean).join(' ')).split(/\s+/).filter((term) => term.length > 2))
  if (!goalTerms.size || !careerTerms.size) return null
  const overlap = [...goalTerms].filter((term) => careerTerms.has(term)).length
  return Math.round((overlap / Math.max(goalTerms.size, careerTerms.size)) * 100)
}

function getEducationScore(profile, educationRows, career) {
  const required = String(career?.preferred_education || career?.education_level || career?.education_required || '').trim().toLowerCase()
  const records = [
    ...getEducationRows(educationRows),
    ...(Array.isArray(profile?.student_profiles) ? profile.student_profiles : [profile?.student_profiles].filter(Boolean)),
    profile || {},
  ]
  if (!required) {
    const qualifications = getEducationRows(educationRows)
      .map((row) => [row?.qualification, row?.programme, row?.field_of_study].filter(Boolean).join(' '))
      .filter(Boolean)
    const careerText = normalizeSkillName([career?.title, career?.sector, career?.description].filter(Boolean).join(' '))
    if (!qualifications.length || !careerText) return null
    const ignored = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'based', 'work', 'role', 'skills', 'career', 'study', 'studies'])
    const careerTerms = new Set(careerText.split(/\s+/).filter((term) => term.length > 2 && !ignored.has(term)))
    const qualificationTerms = new Set(normalizeSkillName(qualifications.join(' ')).split(/\s+/).filter((term) => term.length > 2 && !ignored.has(term)))
    if (!qualificationTerms.size) return null
    const overlap = [...qualificationTerms].filter((term) => careerTerms.has(term)).length
    return Math.round((overlap / qualificationTerms.size) * 100)
  }
  const candidate = records.map((row) => [
    row?.education_level,
    row?.qualification,
    row?.programme,
    row?.field_of_study,
  ].filter(Boolean).join(' ').toLowerCase()).filter(Boolean)
  if (!candidate.length) return 0
  return candidate.some((value) => value.includes(required) || required.includes(value)) ? 100 : 35
}

export function scoreCareerRecommendation({ profile = {}, skills = [], career = {}, assessments = [], education = [], interests = [], employerFeedback = [] } = {}) {
  const requirements = Array.isArray(career?.career_skills) ? career.career_skills : []
  const fallbackRequirements = Array.isArray(career?.required_skills) ? career.required_skills : Array.isArray(career?.skills) ? career.skills : []
  const requiredSkills = [...requirements, ...fallbackRequirements].map((item) => {
    const name = String(getSkillName(item) || '').trim()
    return { name, requiredLevel: item?.required_level || item?.requiredLevel || 'beginner', importance: Math.max(1, Number(item?.importance) || 1) }
  }).filter((item, index, all) => item.name && all.findIndex((candidate) => normalizeSkillName(candidate.name) === normalizeSkillName(item.name)) === index)

  const studentSkills = new Map((Array.isArray(skills) ? skills : []).map((item) => [
    normalizeSkillName(getSkillName(item)),
    scoreLevel(item?.level ?? item?.current_level ?? item?.proficiency ?? item?.confidence, 0),
  ]).filter(([name]) => name))
  const matches = []
  const developing = []
  const missing = []
  const weightedSkillScores = []

  for (const requirement of requiredSkills) {
    const normalized = normalizeSkillName(requirement.name)
    const level = studentSkills.get(normalized)
    const required = scoreLevel(requirement.requiredLevel, 25)
    const contribution = Math.min(100, ((level || 0) / required) * 100)
    weightedSkillScores.push({ score: contribution, importance: requirement.importance })
    if (level === undefined) missing.push(requirement.name)
    else if (level < required) developing.push(requirement.name)
    else matches.push(requirement.name)
  }

  const skillScore = weightedSkillScores.length
    ? weightedSkillScores.reduce((sum, item) => sum + item.score * item.importance, 0) / weightedSkillScores.reduce((sum, item) => sum + item.importance, 0)
    : null
  const skillNames = new Set(requiredSkills.map((item) => normalizeSkillName(item.name)))
  const latestAssessmentsBySkill = new Map()
  for (const item of getAssessments(assessments)) {
    const normalizedName = normalizeSkillName(item?.assessments?.skills?.name || item?.skills?.name || item?.skill_name || item?.skill)
    const score = Number(item?.percentage ?? item?.score ?? item?.result_score)
    if (!skillNames.has(normalizedName) || !Number.isFinite(score) || score < 0 || score > 100) continue
    const previous = latestAssessmentsBySkill.get(normalizedName)
    const date = Date.parse(item.completed_at || item.created_at || '')
    const previousDate = Date.parse(previous?.completed_at || previous?.created_at || '')
    if (!previous || (Number.isFinite(date) && (!Number.isFinite(previousDate) || date >= previousDate))) {
      latestAssessmentsBySkill.set(normalizedName, item)
    }
  }
  const assessmentScore = average([...latestAssessmentsBySkill.values()]
    .map((item) => Number(item.percentage ?? item.score ?? item.result_score)))
  const feedbackSkillNames = new Set(requiredSkills.map((item) => normalizeSkillName(item.name)))
  const feedbackScores = getValidatedEmployerCompetencies(employerFeedback, profile.id)
    .filter((item) => feedbackSkillNames.has(normalizeSkillName(item.skillName)))
    .map((item) => item.score)
  const employerFeedbackScore = average(feedbackScores)
  const educationScore = getEducationScore(profile, education, career)
  const studentProfile = getStudentProfile(profile)
  const statedInterests = [
    ...((Array.isArray(interests) ? interests : []).map((item) => typeof item === 'string' ? item : item?.name || item?.interest || '')),
    ...(Array.isArray(studentProfile?.interests) ? studentProfile.interests : []),
  ].map(normalizeSkillName).filter(Boolean)
  const careerInterestTerms = [
    career?.title,
    career?.sector,
    career?.interest_area,
    ...(Array.isArray(career?.interests) ? career.interests : []),
    ...(Array.isArray(career?.related_interests) ? career.related_interests : []),
  ].map(normalizeSkillName).filter(Boolean)
  const interestScore = statedInterests.length && careerInterestTerms.length
    ? (statedInterests.some((interest) => careerInterestTerms.some((term) => term.includes(interest) || interest.includes(term))) ? 100 : 40)
    : null
  const targetRole = normalizeSkillName(studentProfile?.target_role || profile?.target_role || '')
  const title = normalizeSkillName(career?.title || career?.name || '')
  const careerGoal = studentProfile?.career_goal || profile?.career_goal || ''
  const roleScore = targetRole && title
    ? (targetRole.includes(title) || title.includes(targetRole) ? 100 : 35)
    : null
  const supportingGoalScore = getSupportingGoalScore(careerGoal, career)
  const preferenceScore = roleScore === null
    ? null
    : Math.round(roleScore * 0.8 + Math.max(roleScore, supportingGoalScore ?? roleScore) * 0.2)

  const factors = [
    ['skills', skillScore, 0.45],
    ['education', educationScore, 0.15],
    ['assessments', assessmentScore, 0.15],
    ['interests', interestScore, 0.1],
    ['preference', preferenceScore, 0.05],
    ['employer_feedback', employerFeedbackScore, 0.1],
  ].filter(([, value]) => value !== null)
  const weightTotal = factors.reduce((sum, [, , weight]) => sum + weight, 0)
  const overallScore = weightTotal ? Math.round(factors.reduce((sum, [, value, weight]) => sum + value * weight, 0) / weightTotal) : 0
  const factorsUsed = Object.fromEntries(factors.map(([name, value]) => [name, Math.round(value)]))
  const factorWeights = Object.fromEntries(factors.map(([name, , weight]) => [name, Math.round((weight / (weightTotal || 1)) * 100)]))
  const explanation = `Score based on ${factors.map(([name]) => name).join(', ') || 'no available profile evidence'}. Available factor weights are normalized: ${Object.entries(factorWeights).map(([name, weight]) => `${name} ${weight}%`).join(', ') || 'none'}. ${matches.length} required skills meet the target level, ${developing.length} are below it, and ${missing.length} are not listed.`

  return {
    career_id: career.id,
    title: career.title || career.name || 'Career',
    sector: career.sector || 'General',
    overall_score: overallScore,
    match_score: overallScore,
    skill_score: skillScore === null ? null : Math.round(skillScore),
    education_score: educationScore === null ? null : Math.round(educationScore),
    assessment_score: assessmentScore === null ? null : Math.round(assessmentScore),
    employer_feedback_score: employerFeedbackScore === null ? null : Math.round(employerFeedbackScore),
    factor_weights: factorWeights,
    interest_score: interestScore === null ? null : Math.round(interestScore),
    preference_score: preferenceScore === null ? null : Math.round(preferenceScore),
    factors: factorsUsed,
    strengths: matches,
    strong_skills: matches,
    developing_skills: developing,
    missing_skills: missing,
    explanation,
    reason: explanation,
    next_step: missing.length || developing.length
      ? `Focus on ${[...missing, ...developing].slice(0, 2).join(', ')}.`
      : 'Continue building evidence and reassess your profile.',
  }
}

export function calculateCareerRecommendations({ profile = {}, skills = [], careers = [], assessments = [], education = [], interests = [], employerFeedback = [] } = {}) {
  return (Array.isArray(careers) ? careers : [])
    .map((career) => scoreCareerRecommendation({ profile, skills, career, assessments, education, interests, employerFeedback }))
}
