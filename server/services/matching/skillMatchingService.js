import { MATCHING_CONFIG, PROFICIENCY_LEVELS } from './matchingConfig.js'
import { canonicalizeSkillName, resolveCanonicalSkill } from '../skills/skillNormalizationService.js'
import { compareSkills } from '../skills/skillSimilarityService.js'

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value))

export function proficiencyToNumber(level = 1) {
  const value = Number(level)
  if (Number.isFinite(value)) return clamp(Math.round(value), 1, 5)

  const normalized = String(level || '').trim().toLowerCase()
  const mapping = {
    beginner: 1,
    basic: 2,
    intermediate: 3,
    advanced: 4,
    expert: 5,
  }
  return mapping[normalized] || 1
}

export function describeProficiency(level) {
  const value = proficiencyToNumber(level)
  return PROFICIENCY_LEVELS.find((entry) => entry.value === value)?.label || 'Beginner'
}

export function calculateProficiencyMatch(studentLevel, requiredLevel) {
  const student = proficiencyToNumber(studentLevel)
  const required = proficiencyToNumber(requiredLevel)

  if (student >= required) return {
    matchScore: 100,
    delta: student - required,
    relation: 'exact',
  }

  const gap = required - student
  const matchScore = clamp(100 - gap * 25, 0, 100)
  return {
    matchScore,
    delta: -gap,
    relation: 'partial',
  }
}

export function evaluateSkillRequirement({ studentSkills = [], requiredSkill = {}, aliases = [], relationships = [] } = {}) {
  const relationshipContext = Array.isArray(relationships) ? relationships : []
  const requirementName = requiredSkill?.name || requiredSkill?.title || requiredSkill?.skill || ''
  const canonicalRequirement = canonicalizeSkillName(requirementName)
  const studentSkill = studentSkills.find((skill) => {
    const skillName = skill?.name || skill?.skill || ''
    const candidate = resolveCanonicalSkill(skillName, studentSkills, aliases)
    const candidateValue = canonicalizeSkillName(candidate.canonicalSkill || skillName)
    return candidate.skillId ? candidate.skillId === requiredSkill?.skill_id || candidateValue === canonicalRequirement : candidateValue === canonicalRequirement
  }) || studentSkills.find((skill) => {
    const candidate = canonicalizeSkillName(skill?.name || skill?.skill || '')
    return candidate === canonicalRequirement
  })

  if (!studentSkill) {
    const isMandatory = requiredSkill?.mandatory ?? requiredSkill?.required ?? true
    return {
      skill: requirementName,
      status: 'missing',
      matchScore: isMandatory ? 0 : 40,
      levelMatch: 'missing',
      evidence: 0,
      explanation: `No matching skill was found for ${requirementName}.`,
      mandatory: Boolean(isMandatory),
    }
  }

  const comparison = compareSkills(studentSkill, { ...requiredSkill, name: requirementName })
  const evidenceStrength = Number(studentSkill?.confidence || studentSkill?.evidence_strength || studentSkill?.evidence || 0)
  const proficiency = calculateProficiencyMatch(studentSkill?.level || studentSkill?.proficiency || 1, requiredSkill?.required_level || requiredSkill?.level || 1)
  const exact = comparison.relationshipType === 'exact'
  const status = exact && proficiency.matchScore >= 85
    ? 'strong'
    : proficiency.matchScore >= 55
      ? 'partial'
      : 'gap'

  return {
    skill: requirementName,
    status,
    matchScore: clamp(Math.round(proficiency.matchScore * (0.7 + evidenceStrength / 200)), 0, 100),
    levelMatch: exact && proficiency.matchScore >= 85 ? 'exact' : 'partial',
    evidence: evidenceStrength,
    explanation: status === 'strong'
      ? `${requirementName} matches the student at the expected proficiency.`
      : `${requirementName} is partially matched with a proficiency gap of ${Math.abs(proficiency.delta)} levels.`,
    mandatory: Boolean(requiredSkill?.mandatory || requiredSkill?.required || true),
    studentSkill,
    comparison,
    relationshipContext: relationshipContext.length,
  }
}

export function matchSkills({ studentSkills = [], jobSkills = [], aliases = [], relationships = [] } = {}) {
  const relationshipContext = Array.isArray(relationships) ? relationships : []
  const evaluated = jobSkills.map((requirement) => evaluateSkillRequirement({ studentSkills, requiredSkill: requirement, aliases, relationships: relationshipContext }))
  const missingMandatory = evaluated.filter((item) => item.mandatory && item.status === 'missing')
  const averageSkillScore = evaluated.length
    ? evaluated.reduce((sum, item) => sum + item.matchScore, 0) / evaluated.length
    : 0
  const mandatoryPenalty = missingMandatory.length * MATCHING_CONFIG.MANDATORY_SKILL_PENALTY * 0.35
  const overallMatch = clamp(Math.round(averageSkillScore - mandatoryPenalty), 0, 100)

  return {
    overallMatch,
    mandatoryMissing: missingMandatory.length,
    strongMatches: evaluated.filter((item) => item.status === 'strong'),
    partialMatches: evaluated.filter((item) => item.status === 'partial'),
    skillGaps: evaluated.filter((item) => item.status === 'missing' || item.status === 'gap'),
    matches: evaluated,
    explanation: overallMatch >= 75
      ? 'The candidate meets the job skill baseline with strong evidence and manageable proficiency gaps.'
      : overallMatch >= 45
        ? 'The candidate is a reasonable fit, but key proficiency or evidence gaps remain for the target role.'
        : 'The candidate does not yet meet the target role baseline and needs additional training or evidence.',
  }
}

export function matchStudentToJob({ studentSkills = [], jobSkills = [], job = {}, aliases = [], relationships = [] } = {}) {
  const result = matchSkills({ studentSkills, jobSkills, aliases, relationships })
  return {
    jobTitle: job?.title || 'Role',
    ...result,
    requiredSkills: jobSkills.length,
  }
}

export function matchStudentToCareer({ studentSkills = [], careerSkills = [], career = {}, aliases = [], relationships = [] } = {}) {
  const result = matchSkills({ studentSkills, jobSkills: careerSkills, aliases, relationships })
  return {
    careerTitle: career?.title || career?.name || 'Career',
    ...result,
    requiredSkills: careerSkills.length,
  }
}
