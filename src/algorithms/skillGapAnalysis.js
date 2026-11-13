import { normalizeSkillName } from '../utils/dataValidation.js'

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

const getSkillName = (skill) => {
  if (typeof skill === 'string') return skill
  return skill?.skills?.name || skill?.name || skill?.skill_name || skill?.skill || skill?.title || ''
}

const toScore = (value, fallback = null) => {
  if (typeof value === 'string' && Object.hasOwn(LEVEL_SCORES, value.trim().toLowerCase())) {
    return LEVEL_SCORES[value.trim().toLowerCase()]
  }
  if (value === null || value === undefined || value === '') return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return fallback
  if (numeric === 0) return 0
  if (numeric <= 5) return [0, 25, 45, 60, 80, 95][Math.round(numeric)]
  return Math.min(100, numeric)
}

const getLevelLabel = (score, source) => {
  const knownLabels = {
    novice: 'Novice',
    beginner: 'Beginner',
    basic: 'Basic',
    developing: 'Developing',
    intermediate: 'Intermediate',
    proficient: 'Proficient',
    advanced: 'Advanced',
    expert: 'Expert',
  }
  const sourceLabel = typeof source === 'string' ? knownLabels[source.trim().toLowerCase()] : ''
  if (sourceLabel) return sourceLabel
  if (score === null || score === undefined) return 'Not assessed'
  if (score >= 90) return 'Expert'
  if (score >= 75) return 'Advanced'
  if (score >= 65) return 'Proficient'
  if (score >= 50) return 'Intermediate'
  if (score >= 35) return 'Developing'
  return 'Beginner'
}

const getCurrentValue = (skill) => skill?.level ?? skill?.current_level ?? skill?.currentLevel ?? skill?.proficiency_level ?? skill?.proficiency

const getRequiredValue = (skill) => skill?.required_level ?? skill?.requiredLevel ?? skill?.target_level ?? skill?.targetLevel ?? skill?.level ?? skill?.proficiency_level ?? skill?.proficiency

const getSeverity = (gap) => gap >= 40 ? 'high' : gap >= 20 ? 'medium' : 'low'

export function analyzeSkillGaps(skills = [], targetSkills = []) {
  const currentSkills = Array.isArray(skills) ? skills : []
  const requirements = Array.isArray(targetSkills) ? targetSkills : []
  const currentByName = new Map()

  for (const skill of currentSkills) {
    const name = normalizeSkillName(getSkillName(skill))
    if (name && !currentByName.has(name)) currentByName.set(name, skill)
  }

  return requirements.flatMap((requirement) => {
    const name = normalizeSkillName(getSkillName(requirement))
    if (!name) return []
    const currentSkill = currentByName.get(name)
    const currentValue = currentSkill ? getCurrentValue(currentSkill) : null
    const requiredValue = getRequiredValue(requirement)
    const requiredScore = toScore(requiredValue, 70)
    const currentScore = currentSkill ? toScore(currentValue) : null
    const missing = !currentSkill

    if (!missing && currentScore !== null && currentScore >= requiredScore) return []

    const scoreForGap = currentScore ?? 0
    const gapSize = Math.max(0, requiredScore - scoreForGap)
    const status = missing ? 'missing' : 'insufficient'
    const severity = missing ? 'high' : getSeverity(gapSize)

    return [{
      name: getSkillName(requirement).trim(),
      currentScore: currentScore ?? 0,
      currentLevel: getLevelLabel(currentScore, currentValue),
      requiredScore,
      requiredLevel: getLevelLabel(requiredScore, requiredValue),
      gap: status,
      gapSize,
      severity,
    }]
  })
}
