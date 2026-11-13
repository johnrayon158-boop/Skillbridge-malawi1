import { calculateRate, describeInsufficientData, filterByDate } from './analyticsService.js'
import {
  APPLICATION_IN_PROGRESS_STATUSES,
  APPLICATION_TERMINAL_STATUSES,
  normalizeApplicationStatus,
} from '../../../src/utils/applicationStatus.js'

export function buildStudentAnalytics({
  profile = {},
  careerProgress = [],
  applications = [],
  interviews = [],
  learning = [],
  userSkills = [],
  projects = [],
  certificates = [],
  assessments = [],
  dateRange = 'all',
} = {}) {
  const studentProfile = Array.isArray(profile?.student_profiles)
    ? profile.student_profiles[0]
    : profile?.student_profiles
  const currentReadiness = Number(careerProgress?.[0]?.readiness_score ?? profile?.readiness_score ?? 0)
  const previousReadiness = Number(careerProgress?.[0]?.previous_readiness_score ?? careerProgress?.[1]?.readiness_score ?? null)
  const readinessChange = previousReadiness !== null && Number.isFinite(previousReadiness) ? currentReadiness - previousReadiness : null

  const filteredApplications = filterByDate(applications, 'applied_at', dateRange)
  const filteredInterviews = filterByDate(interviews, 'scheduled_at', dateRange)
  const currentApplicationStatuses = filteredApplications.map((item) => normalizeApplicationStatus(item.status))
  const applicationIdsWithInterviews = new Set(filteredInterviews.map((item) => item.application_id).filter(Boolean))
  const filteredLearning = filterByDate(learning, 'updated_at', dateRange)

  const applicationSummary = {
    total: filteredApplications.length,
    inProgress: currentApplicationStatuses.filter((status) => APPLICATION_IN_PROGRESS_STATUSES.includes(status)).length,
    applied: currentApplicationStatuses.filter((status) => status === 'applied').length,
    under_review: currentApplicationStatuses.filter((status) => status === 'under_review').length,
    shortlisted: currentApplicationStatuses.filter((status) => status === 'shortlisted').length,
    assessment: currentApplicationStatuses.filter((status) => status === 'assessment').length,
    interview: currentApplicationStatuses.filter((status) => status === 'interview').length,
    scheduledInterviews: applicationIdsWithInterviews.size || filteredInterviews.length,
    outstandingOffers: currentApplicationStatuses.filter((status) => status === 'offer').length,
    accepted: currentApplicationStatuses.filter((status) => status === 'accepted').length,
    rejected: currentApplicationStatuses.filter((status) => status === 'rejected').length,
    withdrawn: currentApplicationStatuses.filter((status) => status === 'withdrawn').length,
    offer_declined: currentApplicationStatuses.filter((status) => status === 'offer_declined').length,
    expired: currentApplicationStatuses.filter((status) => status === 'expired').length,
    position_closed: currentApplicationStatuses.filter((status) => status === 'position_closed').length,
    closed: currentApplicationStatuses.filter((status) => APPLICATION_TERMINAL_STATUSES.includes(status)).length,
  }

  const interviewRate = calculateRate(applicationIdsWithInterviews.size || filteredInterviews.length, Math.max(filteredApplications.length || 1, 1))
  const offerRate = calculateRate(applicationSummary.outstandingOffers, Math.max(filteredApplications.length || 1, 1))

  const learningSummary = {
    totalResources: filteredLearning.length,
    activePaths: filteredLearning.filter((item) => String(item.status || '').toLowerCase() === 'active').length,
    completedPaths: filteredLearning.filter((item) => String(item.status || '').toLowerCase() === 'completed').length,
    completionRate: filteredLearning.length ? Math.round((filteredLearning.filter((item) => Number(item.completion_rate ?? item.progress ?? 0) >= 100).length / filteredLearning.length) * 100) : 0,
  }

  const portfolioSummary = {
    totalProjects: projects.length,
    totalCertificates: certificates.length,
    evidenceStrength: projects.length + certificates.length > 0 ? 'Available' : 'Insufficient data',
  }

  const skillDevelopment = (userSkills || []).map((skill) => ({
    name: skill.skill_name || skill.name || 'Skill',
    level: skill.level || skill.current_level || 'Unknown',
    evidence: skill.evidence_count ?? skill.evidence?.length ?? 0,
  }))

  const readiness = {
    current: currentReadiness || 0,
    previous: previousReadiness,
    change: readinessChange,
    status: currentReadiness > 0 ? 'Ready for review' : 'Insufficient data',
  }

  const notes = currentReadiness ? ['Career readiness is based on the current recorded profile data.'] : [describeInsufficientData('career readiness').message]

  return {
    profileSummary: {
      fullName: profile.full_name || 'Student',
      targetRole: profile.target_role || studentProfile?.target_role || 'Target occupation not recorded',
      careerGoal: profile.career_goal || studentProfile?.career_goal || 'Career goal not recorded',
    },
    overallReadiness: readiness,
    skillDevelopment,
    applicationSummary,
    interviewRate,
    offerRate,
    learningSummary,
    portfolioSummary,
    assessmentSummary: {
      total: Array.isArray(assessments) ? assessments.length : 0,
      averageScore: Array.isArray(assessments) && assessments.length ? Math.round((assessments.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / assessments.length)) : null,
    },
    notes,
  }
}
