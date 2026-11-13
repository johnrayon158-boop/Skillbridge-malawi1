import { calculateRate, describeInsufficientData } from './analyticsService.js'
import { normalizeApplicationStatus } from '../../../src/utils/applicationStatus.js'

export function buildEmployerAnalytics({ jobs = [], employerId = null } = {}) {
  const activeJobs = jobs.filter((job) => job.status === 'published').length
  const closedJobs = jobs.filter((job) => job.status === 'closed').length

  const currentStatusCounts = {
    applied: 0,
    under_review: 0,
    shortlisted: 0,
    assessment: 0,
    interview: 0,
    offer: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    offer_declined: 0,
    expired: 0,
    position_closed: 0,
  }

  for (const job of jobs) {
    const applications = Array.isArray(job.applications) ? job.applications : []
    for (const item of applications) {
      const status = normalizeApplicationStatus(item.status)
      if (status === 'applied') currentStatusCounts.applied += 1
      if (status === 'under_review') currentStatusCounts.under_review += 1
      if (status === 'shortlisted') currentStatusCounts.shortlisted += 1
      if (status === 'assessment') currentStatusCounts.assessment += 1
      if (status === 'interview') currentStatusCounts.interview += 1
      if (status === 'offer') currentStatusCounts.offer += 1
      if (status === 'accepted') currentStatusCounts.accepted += 1
      if (status === 'rejected') currentStatusCounts.rejected += 1
      if (status === 'withdrawn') currentStatusCounts.withdrawn += 1
      if (status === 'offer_declined') currentStatusCounts.offer_declined += 1
      if (status === 'expired') currentStatusCounts.expired += 1
      if (status === 'position_closed') currentStatusCounts.position_closed += 1
    }
  }

  const hasApplications = jobs.some((job) => Array.isArray(job.applications) && job.applications.length > 0)
  if (hasApplications && Object.values(currentStatusCounts).every((count) => count === 0)) {
    currentStatusCounts.unknown = jobs.reduce((total, job) => total + (Array.isArray(job.applications) ? job.applications.length : 0), 0)
  }

  const jobSummary = {
    employerId,
    activeJobs,
    closedJobs,
    totalJobs: jobs.length,
  }

  const conversionRates = {
    shortlisting: calculateRate(currentStatusCounts.shortlisted, Math.max(currentStatusCounts.applied || 1, 1)),
    interview: calculateRate(currentStatusCounts.interview, Math.max(currentStatusCounts.shortlisted || 1, 1)),
    offer: calculateRate(currentStatusCounts.offer, Math.max(currentStatusCounts.interview || 1, 1)),
  }

  return {
    jobSummary,
    currentStatusCounts,
    conversionRates,
    notes: jobs.length ? ['Employer analytics show only records belonging to the current organisation.'] : [describeInsufficientData('employer analytics').message],
  }
}
