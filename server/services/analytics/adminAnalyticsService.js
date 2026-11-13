import { buildDateRange, filterByDate } from './analyticsService.js'
import { normalizeApplicationStatus } from '../../../src/utils/applicationStatus.js'

export function buildAdminAnalytics({
  users = [],
  jobs = [],
  applications = [],
  interviews = [],
  employment = [],
  skills = [],
  careers = [],
  recommendations = [],
  dateRange = 'all',
} = {}) {
  const filteredUsers = filterByDate(users, 'created_at', dateRange)
  const filteredJobs = filterByDate(jobs, 'created_at', dateRange)
  const filteredApplications = filterByDate(applications, 'applied_at', dateRange)
  const filteredInterviews = filterByDate(interviews, 'scheduled_at', dateRange)
  const outstandingOffers = filteredApplications.filter((item) => normalizeApplicationStatus(item.status) === 'offer').length
  const filteredEmployment = filterByDate(employment, 'created_at', dateRange)

  const metrics = {
    totalUsers: filteredUsers.length,
    totalJobs: filteredJobs.length,
    totalApplications: filteredApplications.length,
    totalInterviews: filteredInterviews.length,
    totalOffers: outstandingOffers,
    totalEmployment: filteredEmployment.length,
    totalSkills: skills.length,
    totalCareers: careers.length,
    totalRecommendations: recommendations.length,
  }

  const notes = [
    'Platform metrics are based on actual platform data and may not represent the entire Malawi labour market.',
    'AI monitoring figures reflect only stored recommendation and feedback records.',
  ]

  const summary = {
    users: filteredUsers.length,
    jobs: filteredJobs.length,
    applications: filteredApplications.length,
    interviews: filteredInterviews.length,
    offers: outstandingOffers,
  }

  return {
    metrics,
    summary,
    notes,
    dateRange: buildDateRange({ range: dateRange }).range,
    status: metrics.totalUsers || metrics.totalJobs || metrics.totalApplications ? 'Healthy' : 'Insufficient data',
  }
}
