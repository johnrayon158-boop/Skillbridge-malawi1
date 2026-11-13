import { normalizeApplicationStatus } from './applicationStatus.js'

const STAGES = [
  { key: 'applied', label: 'Applied', statuses: ['applied'] },
  { key: 'under_review', label: 'Under review', statuses: ['under_review'] },
  { key: 'shortlisted', label: 'Shortlisted', statuses: ['shortlisted'] },
  { key: 'assessment', label: 'Assessment', statuses: ['assessment'] },
  { key: 'interview', label: 'Interview', statuses: ['interview'] },
  { key: 'offer', label: 'Offer', statuses: ['offer'] },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted'] },
  { key: 'unsuccessful', label: 'Closed', statuses: ['rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed'] },
]

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildEmployerAnalytics(jobs = [], employments = [], now = new Date()) {
  const records = Array.isArray(jobs) ? jobs : []
  const employmentRecords = Array.isArray(employments) ? employments : []
  const applications = records.flatMap((job) => (
    Array.isArray(job.applications) ? job.applications.map((application) => ({ ...application, jobId: job.id })) : []
  ))
  const statusCounts = Object.fromEntries(STAGES.map(({ key }) => [key, 0]))
  statusCounts.other = 0

  for (const application of applications) {
    const status = normalizeApplicationStatus(application.status)
    const stage = STAGES.find(({ statuses }) => statuses.includes(status))
    statusCounts[stage?.key || 'other'] += 1
  }

  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthlyApplications = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5 + index, 1))
    return { key: monthKey(month), label: month.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }), count: 0 }
  })
  const monthsByKey = new Map(monthlyApplications.map((month) => [month.key, month]))
  for (const application of applications) {
    if (!application.applied_at) continue
    const appliedAt = new Date(application.applied_at)
    if (Number.isNaN(appliedAt.getTime())) continue
    const month = monthsByKey.get(monthKey(appliedAt))
    if (month) month.count += 1
  }

  const topJobs = records
    .map((job) => ({ id: job.id, title: job.title || 'Untitled job', status: job.status || 'unknown', applicationCount: Array.isArray(job.applications) ? job.applications.length : 0 }))
    .sort((a, b) => b.applicationCount - a.applicationCount || a.title.localeCompare(b.title))
    .slice(0, 5)
  const totalApplications = applications.length
  const acceptedApplications = statusCounts.accepted

  return {
    jobs: {
      total: records.length,
      published: records.filter((job) => job.status === 'published').length,
      drafts: records.filter((job) => job.status === 'draft').length,
      closed: records.filter((job) => job.status === 'closed' || job.status === 'archived').length,
    },
    applications: {
      total: totalApplications,
      accepted: acceptedApplications,
      acceptanceRate: totalApplications ? Number(((acceptedApplications / totalApplications) * 100).toFixed(1)) : null,
      perJob: records.length ? Number((totalApplications / records.length).toFixed(1)) : null,
      stages: STAGES.map(({ key, label }) => ({ key, label, count: statusCounts[key] })),
      other: statusCounts.other,
    },
    employees: {
      total: employmentRecords.length,
      active: employmentRecords.filter((record) => record.status === 'active').length,
    },
    monthlyApplications,
    topJobs,
    hasData: records.length > 0 || employmentRecords.length > 0,
  }
}
