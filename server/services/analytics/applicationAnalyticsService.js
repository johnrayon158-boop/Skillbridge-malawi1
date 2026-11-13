import { calculateRate, describeInsufficientData, filterByDate } from './analyticsService.js'
import { normalizeApplicationStatus } from '../../../src/utils/applicationStatus.js'

export function buildApplicationAnalytics({ applications = [], applicationEvents = [], dateRange = 'all' } = {}) {
  const filteredApplications = filterByDate(applications, 'applied_at', dateRange)
  const statuses = filteredApplications.map((item) => normalizeApplicationStatus(item.status))
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

  const allEvents = Array.isArray(applicationEvents) ? applicationEvents : []
  const events = filterByDate(allEvents, 'created_at', dateRange)
  const statusHistory = Object.fromEntries(
    ['applied', 'under_review', 'shortlisted', 'assessment', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed']
      .map((status) => [
        status,
        new Set(events
          .filter((event) => normalizeApplicationStatus(event.event_type) === status)
          .map((event) => event.application_id)
          .filter(Boolean)).size,
      ]),
  )

  const interviewStageRate = calculateRate(currentStatusCounts.interview, Math.max(filteredApplications.length || 1, 1))
  const outstandingOfferRate = calculateRate(
    currentStatusCounts.offer,
    Math.max(currentStatusCounts.shortlisted + currentStatusCounts.assessment + currentStatusCounts.interview + currentStatusCounts.offer || 1, 1),
  )

  const durations = []
  for (const item of filteredApplications) {
    const createdAt = item.applied_at || item.created_at
    const firstStatusChange = allEvents
      .filter((event) => item.id && event.application_id === item.id && normalizeApplicationStatus(event.event_type) !== 'applied')
      .sort((left, right) => new Date(left.created_at || left.event_date) - new Date(right.created_at || right.event_date))[0]
    const responseAt = firstStatusChange?.created_at || firstStatusChange?.event_date || item.responded_at || item.updated_at
    if (createdAt && responseAt) {
      durations.push({ id: item.id, days: Math.max(0, (new Date(responseAt) - new Date(createdAt)) / 86400000) })
    }
  }

  return {
    totalApplications: filteredApplications.length,
    currentStatusCounts,
    statusHistory,
    interviewStageRate,
    outstandingOfferRate,
    averageResponseDays: durations.length ? Number((durations.reduce((total, item) => total + item.days, 0) / durations.length).toFixed(1)) : null,
    notes: filteredApplications.length ? ['Current application statuses are counted separately from deduplicated historical status events.'] : [describeInsufficientData('application status').message],
    events,
  }
}
