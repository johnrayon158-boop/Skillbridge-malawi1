import { analyzeSkillGaps } from '../../../src/algorithms/skillGapAnalysis.js'
import { recommendLearning } from '../../../src/algorithms/learningRecommendation.js'
import { normalizeSkillName } from '../../../src/utils/dataValidation.js'
import { calculateCareerRecommendations as recommendCareers } from '../../../src/algorithms/careerRecommendation.js'
import { matchCandidateToJob } from '../../../src/algorithms/employmentMatching.js'
import { rankItems } from '../../../src/algorithms/ranking.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const round = (value) => Math.round(value)
const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const normalize = (value) => clamp(round(value), 0, 100)

const getSkillMap = (skills = []) => {
  const map = new Map()
  for (const item of skills) {
    const name = String(item?.skills?.name || item?.name || item?.skill_name || item?.skill || '').trim()
    if (!name) continue
    const level = item?.level || item?.proficiency || item?.confidence || 'beginner'
    const score = {
      beginner: 25,
      developing: 45,
      intermediate: 60,
      advanced: 80,
      expert: 95,
    }[String(level).toLowerCase()] ?? 50
    map.set(name.toLowerCase(), score)
  }
  return map
}

const getAssessmentAverage = (assessments = [], skillNames = []) => {
  if (!Array.isArray(assessments) || !assessments.length) return 0
  const skillSet = new Set(skillNames.map((name) => String(name).toLowerCase()))
  const matched = assessments.filter((item) => {
    const skillName = String(item?.skills?.name || item?.skill_name || item?.skill || '').toLowerCase()
    return skillSet.has(skillName)
  })
  if (!matched.length) return 0
  const average = matched.reduce((total, item) => total + toNumber(item?.score ?? item?.result_score ?? item?.percentage, 0), 0) / matched.length
  return average
}

export function calculateCareerRecommendations(payload = {}) {
  return {
    recommendations: rankItems(recommendCareers(payload)).map((item) => ({
      ...item,
      evidence_score: item.assessment_score,
    })),
    generated_at: new Date().toISOString(),
    model: 'deterministic-scoring',
  }
}

export function calculateSkillGaps(payload = {}) {
  const { studentSkills = [], requiredSkills = [], learningResources = [] } = payload
  const strong = []
  const developing = []
  const gaps = analyzeSkillGaps(studentSkills, requiredSkills)
  const detailedGaps = gaps.map((item) => ({
    ...item,
    skill: item.name,
    current_level: item.currentLevel,
    required_level: item.requiredLevel,
    status: item.gap,
    gap_type: item.gap,
    gap_size: item.gapSize,
    priority: item.severity[0].toUpperCase() + item.severity.slice(1),
  }))
  const gapByName = new Map(detailedGaps.map((item) => [normalizeSkillName(item.name), item]))

  for (const requirement of requiredSkills || []) {
    const name = String(typeof requirement === 'string'
      ? requirement
      : requirement?.skills?.name || requirement?.skill_name || requirement?.name || '').trim()
    if (!name) continue
    const normalizedName = normalizeSkillName(name)
    const gap = gapByName.get(normalizedName)
    if (!gap) strong.push({ skill: name, current_level: 'Strong' })
    else if (gap.gap === 'insufficient') {
      const resource = learningResources.find((item) => normalizeSkillName(item?.skills?.name || item?.skill_name || item?.skill || '') === normalizedName)
      developing.push({
        ...gap,
        current_level: gap.currentLevel,
        gap: gap.gapSize,
        recommended_resource: resource?.title || 'Targeted practice',
      })
    }
  }

  const missingGaps = detailedGaps.filter((item) => item.gap === 'missing').map((item) => ({
    ...item,
    current_level: item.currentLevel,
    gap: item.gapSize,
    recommended_resource: learningResources.find((resource) =>
      normalizeSkillName(resource?.skills?.name || resource?.skill_name || resource?.skill || '') === normalizeSkillName(item.name),
    )?.title || 'Learning resource',
  }))

  return {
    strong_skills: strong,
    developing_skills: developing,
    skill_gaps: missingGaps,
    gaps: detailedGaps,
    priority_gaps: detailedGaps.filter((item) => item.severity === 'high').map((item) => item.skill),
    summary: detailedGaps.length ? `${detailedGaps.length} skills need development.` : 'No major gaps identified.',
  }
}

export function calculateLearningRecommendations(payload = {}) {
  const { gaps = [], learningResources = [], careerGoal = '' } = payload
  const items = recommendLearning(gaps, learningResources).map((item, index) => ({
    id: item.resourceId || `recommendation-${index}`,
    title: item.resourceTitle || `Build ${item.skill} skills`,
    skill: item.skill,
    reason: `${item.reason} This supports ${careerGoal || 'your selected pathway'}.`,
    priority: item.priority[0].toUpperCase() + item.priority.slice(1),
    severity: item.priority,
    current_level: item.currentLevel,
    required_level: item.requiredLevel,
    estimated_value: item.gap ? clamp(100 - item.gap, 30, 95) : 75,
    resource_id: item.resourceId,
    resource_url: item.resourceUrl,
    resource_type: item.resourceType || null,
  }))

  return { recommendations: items }
}

export function calculateJobMatches(payload = {}) {
  const { jobs = [], studentSkills = [], profile = {}, assessments = [], projects = [], certificates = [], portfolio = null, employment = [], education = [] } = payload
  const validJobs = (Array.isArray(jobs) ? jobs : []).filter((job) => job?.id && job.status === 'published')
  const matches = validJobs.map((job) => {
    const result = matchCandidateToJob({
      skills: studentSkills,
      profile,
      assessments,
      projects,
      certificates,
      portfolio,
      employment,
      education,
    }, job)
    return {
      job_id: job.id,
      title: job.title,
      employer: job?.employer_profiles?.company_name || 'Employer',
      location: job.location || '',
      employment_type: job.employment_type || '',
      work_mode: job.work_mode || '',
      application_deadline: job.application_deadline || null,
      match_score: result.overallMatch,
      skills_score: result.skills_score,
      education_score: result.education_score,
      assessment_score: result.assessment_score,
      project_score: result.project_score,
      portfolio_score: result.portfolio_score,
      certificate_score: result.certificate_score,
      experience_score: result.experience_score,
      factors: result.factors,
      strong_matches: result.matches,
      developing_skills: result.developing_skills,
      missing_requirements: result.gaps,
      explanation: result.explanation,
    }
  })
  return { matches: rankItems(matches) }
}

export function calculateJobReadiness(payload = {}) {
  const { studentSkills = [], jobSkills = [], assessments = [] } = payload
  const skillMap = getSkillMap(studentSkills)
  const required = Array.isArray(jobSkills) ? jobSkills.map((item) => String(item).trim()).filter(Boolean) : []
  const matched = required.filter((skill) => skillMap.has(skill.toLowerCase()))
  const gapCount = required.filter((skill) => !skillMap.has(skill.toLowerCase())).length
  const assessmentScore = normalize(getAssessmentAverage(assessments, required))
  const readiness = normalize((matched.length / Math.max(required.length, 1)) * 100 * 0.7 + assessmentScore * 0.3)

  return {
    overall_readiness: readiness,
    skill_readiness: normalize((matched.length / Math.max(required.length, 1)) * 100),
    assessment_readiness: normalize(assessmentScore),
    priority_gaps: required.filter((skill) => !skillMap.has(skill.toLowerCase())),
    ready_skills: matched,
    summary: `${matched.length || 0} skills are ready; ${gapCount} priority gaps remain.`,
  }
}

export function calculateCareerRoadmap(payload = {}) {
  const { career = {}, gaps = [], learningResources = [] } = payload
  const required = Array.isArray(career?.career_skills)
    ? career.career_skills.map((item) => item?.skills?.name || '').filter(Boolean)
    : []

  const steps = (required || []).slice(0, 6).map((skill, index) => {
    const matchedGap = (gaps || []).find((item) => String(item.skill).toLowerCase() === String(skill).toLowerCase())
    const resource = (learningResources || []).find((item) => {
      const resourceSkill = String(item?.skills?.name || item?.skill_name || '').toLowerCase()
      return resourceSkill.includes(String(skill).toLowerCase()) || String(skill).toLowerCase().includes(resourceSkill)
    })

    return {
      objective: `Strengthen ${skill}`,
      skill,
      recommended_resource: resource?.title || 'Targeted practice and evidence building',
      practice: 'Complete a project or short assessment tied to this skill.',
      evidence: matchedGap ? `Measure improvement from current level to ${matchedGap.priority || 'targeted'} proficiency.` : 'Document the skill with a project or certificate.',
      status: index === 0 ? 'In progress' : 'Planned',
    }
  })

  return { roadmap: steps.length ? steps : [{ objective: 'Define your learning path', skill: career.title || 'Career growth', recommended_resource: 'Build a portfolio project aligned to your target career', practice: 'Document evidence and reassess after learning.', evidence: 'Track progress with a project or assessment result.', status: 'Planned' }] }
}

export function compareCareers(payload = {}) {
  const { recommendations = [] } = payload
  const ranked = [...recommendations].sort((a, b) => b.overall_score - a.overall_score)
  return {
    comparison: ranked.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      score: item.overall_score,
      difference: index === 0 ? 'Currently strongest match' : `Gap of ${Math.max(0, ranked[0].overall_score - item.overall_score)} points from the leading option`,
    })),
    summary: ranked.length ? `Based on your current profile, ${ranked[0].title} currently has the strongest match.` : 'Not enough profile data to compare careers yet.',
  }
}
