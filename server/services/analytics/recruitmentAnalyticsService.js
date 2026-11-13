import { calculateRate, describeInsufficientData, filterByDate } from './analyticsService.js'
import { normalizeApplicationStatus } from '../../../src/utils/applicationStatus.js'

export function buildRecruitmentAnalytics({ applications = [], dateRange = 'all' } = {}) {
  const filtered = filterByDate(applications, 'applied_at', dateRange)
  const statuses = filtered.map((item) => normalizeApplicationStatus(item.status))
  const currentStatusCounts = {
    applied: statuses.filter((status) => status === 'applied').length,
    under_review: statuses.filter((status) => status === 'under_review').length,
    shortlisted: statuses.filter((status) => status === 'shortlisted').length,
    assessment: statuses.filter((status) => status === 'assessment').length,
    interview: statuses.filter((status) => status === 'interview').length,
    offer: statuses.filter((status) => status === 'offer').length,
    accepted: statuses.filter((status) => status === 'accepted').length,
    rejected: statuses.filter((status) => status === 'rejected').length,
    withdrawn: statuses.filter((status) => status === 'withdrawn').length,
    offer_declined: statuses.filter((status) => status === 'offer_declined').length,
    expired: statuses.filter((status) => status === 'expired').length,
    position_closed: statuses.filter((status) => status === 'position_closed').length,
  }

  return {
    currentStatusCounts,
    outstandingOfferRate: calculateRate(currentStatusCounts.offer, Math.max(currentStatusCounts.applied || 1, 1)),
    notes: filtered.length ? ['Counts reflect each application’s current status; historical events are returned separately.'] : [describeInsufficientData('recruitment pipeline').message],
  }
}
