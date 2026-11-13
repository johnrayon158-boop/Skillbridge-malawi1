const FACTOR_WEIGHTS = {
  skills: 30,
  academic: 20,
  career: 15,
  education: 10,
  assessments: 10,
  evidence: 5,
  location: 5,
  availability: 5,
}

const normalize = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const LEVELS = { beginner: 1, basic: 1, intermediate: 2, advanced: 3, expert: 4 }

function getStudentProfile(student) {
  if (Array.isArray(student?.student_profiles)) return student.student_profiles[0] || {}
  return student?.student_profiles || student || {}
}

function scoreSkills(studentSkills, requiredSkills) {
  if (!requiredSkills.length) return null

  const rows = requiredSkills.map((requirement) => {
    const name = normalize(requirement.skills?.name || requirement.name)
    const studentSkill = studentSkills.find((skill) => requirement.skill_id && skill.skill_id === requirement.skill_id)
      || studentSkills.find((skill) => normalize(skill.skills?.name || skill.name) === name)
    const requiredLevel = LEVELS[requirement.required_level] || 2
    const studentLevel = LEVELS[studentSkill?.level] || 0
    const score = studentSkill ? Math.min(100, Math.round((studentLevel / requiredLevel) * 100)) : (requirement.is_required === false ? 40 : 0)
    return { name: requirement.skills?.name || requirement.name, score, isRequired: requirement.is_required !== false, found: Boolean(studentSkill) }
  })

  const totalWeight = requiredSkills.reduce((total, requirement) => total + Math.max(1, Number(requirement.importance) || 1), 0)
  const score = Math.round(rows.reduce((total, row, index) => {
    const weight = Math.max(1, Number(requiredSkills[index]?.importance) || 1)
    return total + row.score * weight
  }, 0) / totalWeight)

  return { score, requirements: rows }
}

function scoreEducationLevel(studentLevel, requiredLevel) {
  const student = normalize(studentLevel)
  const required = normalize(requiredLevel)
  if (!student || !required) return null
  if (student === required || student.includes(required) || required.includes(student)) return 100

  const order = ['certificate', 'secondary', 'diploma', 'undergraduate', 'bachelor', 'postgraduate', 'master', 'doctorate']
  const studentRank = order.findIndex((level) => student.includes(level))
  const requiredRank = order.findIndex((level) => required.includes(level))
  if (studentRank < 0 || requiredRank < 0) return null
  return studentRank >= requiredRank ? 100 : 0
}

function overlapScore(left, right) {
  const leftWords = new Set(normalize(left).split(' ').filter((word) => word.length > 2))
  const rightWords = new Set(normalize(right).split(' ').filter((word) => word.length > 2))
  if (!leftWords.size || !rightWords.size) return null
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length
  return Math.round((overlap / Math.max(leftWords.size, rightWords.size)) * 100)
}

function scoreAvailability(studentProfile, opportunity) {
  const availableFrom = studentProfile.available_from
  const availableTo = studentProfile.available_to
  const placementStart = opportunity.placement_start_date
  const placementEnd = opportunity.placement_end_date

  if (!availableFrom && !availableTo) return null
  if (!placementStart && !placementEnd) return null
  if (availableTo && placementStart && availableTo < placementStart) return 0
  if (availableFrom && placementEnd && availableFrom > placementEnd) return 0
  return 100
}

function scoreAssessments(results, requiredSkills, opportunityId) {
  if (!requiredSkills.length) return null
  const required = new Set(requiredSkills.map((item) => normalize(item.skills?.name || item.name)).filter(Boolean))
  const latestBySkill = new Map()
  for (const result of Array.isArray(results) ? results : []) {
    const skillName = normalize(result?.assessments?.skills?.name || result?.skills?.name || result?.skill_name)
    const score = Number(result?.percentage ?? result?.score)
    const jobSpecific = Boolean(opportunityId && result?.assessments?.job_id === opportunityId)
    if ((!required.has(skillName) && !jobSpecific) || !Number.isFinite(score) || score < 0 || score > 100) continue
    const evidenceKey = required.has(skillName) ? `skill:${skillName}` : `job:${result.assessment_id || result.id}`
    const previous = latestBySkill.get(evidenceKey)
    const resultDate = Date.parse(result?.completed_at || result?.created_at || '')
    const previousDate = Date.parse(previous?.completed_at || previous?.created_at || '')
    if (!previous || (Number.isFinite(resultDate) && (!Number.isFinite(previousDate) || resultDate >= previousDate))) {
      latestBySkill.set(evidenceKey, score)
    }
  }
  if (!latestBySkill.size) return null
  return Math.round([...latestBySkill.values()].reduce((sum, score) => sum + score, 0) / latestBySkill.size)
}

function scoreCareerTarget(profile, student, opportunity) {
  const targetRole = profile.target_role || student?.target_role
  if (!targetRole) return null

  const opportunityText = [
    opportunity.title,
    opportunity.department,
    opportunity.employer_profiles?.industry,
  ].filter(Boolean).join(' ')
  const roleScore = overlapScore(targetRole, opportunityText)
  if (roleScore === null) return null

  const supportingGoalScore = overlapScore(profile.career_goal || student?.career_goal, opportunityText)
  return Math.round(roleScore * 0.8 + Math.max(roleScore, supportingGoalScore ?? roleScore) * 0.2)
}

export function matchInternship(student, opportunity) {
  const profile = getStudentProfile(student)
  const skills = scoreSkills(student?.user_skills || student?.skills || [], opportunity.job_skills || [])
  const programme = profile.programme || student?.programme
  const eligibleProgrammes = Array.isArray(opportunity.eligible_programmes) ? opportunity.eligible_programmes : []
  const programmeMatches = eligibleProgrammes.some((item) => normalize(item) === normalize(programme))
  const factors = {
    skills: skills?.score ?? null,
    academic: eligibleProgrammes.length && programme ? (programmeMatches ? 100 : 0) : null,
    career: scoreCareerTarget(profile, student, opportunity),
    education: scoreEducationLevel(profile.education_level || student?.education_level, opportunity.education_required),
    assessments: scoreAssessments(student?.assessment_results, opportunity.job_skills || [], opportunity.id),
    evidence: Array.isArray(student?.projects) || Array.isArray(student?.certificates)
      ? Math.min(100, (student.projects?.length || 0) * 25 + (student.certificates?.length || 0) * 15)
      : null,
    location: profile.preferred_location
      ? overlapScore(profile.preferred_location, opportunity.location)
      : null,
    availability: scoreAvailability(profile, opportunity),
  }

  const eligibilityReasons = []
  const missingInformation = []
  let eligible = true
  let eligibilityPending = false
  let provisional = false

  if (eligibleProgrammes.length) {
    if (!programme) {
      missingInformation.push('Add your academic programme to check programme eligibility.')
      eligibilityPending = true
      provisional = true
    } else if (!programmeMatches) {
      eligibilityReasons.push(`Your recorded programme does not match the listed programmes: ${eligibleProgrammes.join(', ')}.`)
      eligible = false
    }
  }

  const educationScore = factors.education
  if (educationScore === 0) {
    eligibilityReasons.push(`Your recorded education level does not meet the listed requirement: ${opportunity.education_required}.`)
    eligible = false
  } else if (opportunity.education_required && educationScore === null) {
    missingInformation.push('Add your education level to check the listed education requirement.')
    eligibilityPending = true
    provisional = true
  }

  const studyYear = Number(profile.current_year_of_study)
  if (opportunity.min_study_year || opportunity.max_study_year) {
    if (!studyYear) {
      missingInformation.push('Add your current year of study to check study-year eligibility.')
      eligibilityPending = true
      provisional = true
    } else if ((opportunity.min_study_year && studyYear < opportunity.min_study_year)
      || (opportunity.max_study_year && studyYear > opportunity.max_study_year)) {
      eligibilityReasons.push(`This placement requires study year ${opportunity.min_study_year || 1}–${opportunity.max_study_year || 'any'}.`)
      eligible = false
    }
  }

  if (skills?.requirements.some((requirement) => requirement.isRequired && !requirement.found)) {
    eligibilityReasons.push(`Required skills not recorded: ${skills.requirements.filter((requirement) => requirement.isRequired && !requirement.found).map((requirement) => requirement.name).join(', ')}.`)
    eligible = false
  }

  const totalWeight = Object.entries(FACTOR_WEIGHTS).reduce((total, [factor, weight]) => total + (factors[factor] === null ? 0 : weight), 0)
  const score = totalWeight
    ? Math.round(Object.entries(FACTOR_WEIGHTS).reduce((total, [factor, weight]) => total + (factors[factor] === null ? 0 : factors[factor] * weight), 0) / totalWeight)
    : null

  if (!programme) missingInformation.push('Add your academic programme to improve matching.')
  if (!profile.education_level) missingInformation.push('Add your education level to improve matching.')
  if (!student?.user_skills?.length && !student?.skills?.length) missingInformation.push('Add your skills to improve matching.')
  if (!profile.available_from || !profile.available_to) missingInformation.push('Add your placement availability to improve matching.')
  if (missingInformation.length) provisional = true

  return {
    score,
    factors,
    eligible,
    eligibilityPending,
    provisional,
    eligibilityReasons,
    missingInformation: [...new Set(missingInformation)],
    skills: skills?.requirements || [],
    explanation: eligibilityReasons.length
      ? eligibilityReasons.join(' ')
      : score === null
        ? 'Complete your profile to calculate a personalized compatibility score.'
        : eligibilityPending
          ? 'Complete the required profile details to confirm that you meet this placement’s eligibility criteria.'
          : provisional
          ? 'This provisional compatibility score uses recorded information only. Complete your profile for a more useful match.'
          : 'Compatibility is calculated from your recorded profile and the requirements listed by the employer.',
  }
}

export const INTERNSHIP_MATCH_WEIGHTS = FACTOR_WEIGHTS
