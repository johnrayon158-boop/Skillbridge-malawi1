import { calculateLearningProgressMetrics } from './studentProgressMetrics.js'

function uniqueSkillCount(skills = []) {
  const identities = new Set()
  for (const skill of skills) {
    const identity = skill.skill_id || skill.skills?.id || skill.skills?.name?.trim().toLowerCase()
    if (identity) identities.add(identity)
  }
  return identities.size
}

function countDistinctMissingSkills(recommendations = []) {
  return new Set(recommendations
    .flatMap((recommendation) => Array.isArray(recommendation.missing_skills) ? recommendation.missing_skills : [])
    .map((skill) => String(skill).trim().toLowerCase())
    .filter(Boolean)).size
}

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function calculateStudentDashboardMetrics({
  profileCompletion,
  readiness,
  readinessUnavailable = false,
  skills = [],
  projects = [],
  certificates = [],
  applications = [],
  upcomingInterviewCount = null,
  recommendations = [],
  learningProgress = [],
} = {}) {
  const learning = calculateLearningProgressMetrics(learningProgress)
  const readinessValue = readinessUnavailable
    ? 'Unavailable'
    : readiness?.has_evidence && Number.isFinite(readiness.readiness_score)
      ? `${Math.round(readiness.readiness_score)}%`
      : 'Not enough evidence'

  return [
    {
      label: 'Profile Completion',
      value: Number.isFinite(profileCompletion) ? `${Math.max(0, Math.min(100, Math.round(profileCompletion)))}%` : 'Not calculated',
      to: '/student/profile',
      explanation: 'The share of six required profile items recorded: name, phone, bio, target occupation, at least one career interest, and complete education details.',
    },
    {
      label: 'Evidence Readiness',
      value: readinessValue,
      to: '/student/readiness',
      explanation: 'A weighted indicator from recorded skill levels (30%), latest assessment results (30%), project completion (15%), verified certificates (10%), and tracked learning progress (15%). Missing categories contribute zero; it is not a hiring prediction.',
    },
    {
      label: 'Assessment Average',
      value: Number.isFinite(readiness?.assessment_average) ? `${Math.round(readiness.assessment_average)}%` : 'No results yet',
      to: '/student/assessments',
      explanation: 'The average of your latest valid result for each distinct assessment. Earlier attempts are not counted again.',
    },
    {
      label: 'Learning Progress',
      value: learning.average === null ? 'Not started' : `${learning.average}%`,
      to: '/student/learning',
      explanation: learning.average === null
        ? 'No learning resources are currently marked in progress or completed.'
        : `Average progress across ${formatCount(learning.trackedCount, 'tracked learning item')}; each resource is counted once and completed resources count as 100%.`,
    },
    {
      label: 'Portfolio Progress',
      value: `${formatCount(projects.length, 'project')} · ${formatCount(certificates.length, 'certificate')}`,
      to: '/student/portfolio',
      explanation: 'Counts the projects and certificate records in your portfolio. No percentage is shown because the platform does not set a required portfolio item target.',
    },
    {
      label: 'Skills',
      value: uniqueSkillCount(skills),
      to: '/student/skills',
      explanation: 'Distinct approved professional skills recorded in your student profile.',
    },
    {
      label: 'Applications',
      value: applications.length,
      to: '/student/applications',
      explanation: 'Your application records across all current and historical statuses.',
    },
    {
      label: 'Upcoming Interviews',
      value: Number.isFinite(upcomingInterviewCount) ? upcomingInterviewCount : 'Unavailable',
      to: '/student/interviews',
      explanation: 'Scheduled or rescheduled interviews in the future, counted from interview records.',
    },
    {
      label: 'Recommended Skill Gaps',
      value: countDistinctMissingSkills(recommendations),
      to: '/student/skills/gaps',
      explanation: 'Distinct missing skill names across the career recommendations currently loaded on the dashboard.',
    },
  ]
}
