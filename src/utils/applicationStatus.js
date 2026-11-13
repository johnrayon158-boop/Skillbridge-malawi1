import {
  APPLICATION_LIFECYCLE,
  APPLICATION_STATUS_LABELS,
} from '../constants/database.js'

export const APPLICATION_IN_PROGRESS_STATUSES = Object.freeze([
  'applied',
  'under_review',
  'shortlisted',
  'assessment',
  'interview',
])

export const APPLICATION_TERMINAL_STATUSES = Object.freeze([
  'accepted',
  'rejected',
  'withdrawn',
  'offer_declined',
  'expired',
  'position_closed',
])

export const APPLICATION_TRANSITIONS = Object.freeze({
  applied: ['under_review', 'shortlisted', 'interview', 'rejected', 'withdrawn', 'expired', 'position_closed'],
  under_review: ['shortlisted', 'assessment', 'interview', 'rejected', 'withdrawn', 'expired', 'position_closed'],
  shortlisted: ['assessment', 'interview', 'offer', 'rejected', 'withdrawn', 'expired', 'position_closed'],
  assessment: ['interview', 'offer', 'rejected', 'withdrawn', 'expired', 'position_closed'],
  interview: ['offer', 'rejected', 'withdrawn', 'expired', 'position_closed'],
  offer: ['accepted', 'offer_declined', 'rejected', 'withdrawn', 'expired', 'position_closed'],
})

const LEGACY_STATUS_ALIASES = Object.freeze({
  saved: 'applied',
  interested: 'applied',
  preparing: 'applied',
  submitted: 'applied',
  viewed: 'under_review',
  review: 'under_review',
  second_interview: 'interview',
  selected: 'accepted',
  hired: 'accepted',
  declined: 'offer_declined',
})

export function normalizeApplicationStatus(status = '') {
  const raw = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const normalized = LEGACY_STATUS_ALIASES[raw] || raw
  return APPLICATION_LIFECYCLE.includes(normalized) ? normalized : 'unknown'
}

export function formatApplicationStatus(status = '') {
  const normalized = normalizeApplicationStatus(status)
  return APPLICATION_STATUS_LABELS[normalized] || 'Status needs review'
}

export function canTransitionApplicationStatus(from, to) {
  const current = normalizeApplicationStatus(from)
  const next = normalizeApplicationStatus(to)
  return current !== 'unknown' && current === next
    ? true
    : APPLICATION_TRANSITIONS[current]?.includes(next) === true
}

export function isApplicationInProgress(status) {
  return APPLICATION_IN_PROGRESS_STATUSES.includes(normalizeApplicationStatus(status))
}

export function isApplicationTerminal(status) {
  return APPLICATION_TERMINAL_STATUSES.includes(normalizeApplicationStatus(status))
}

export function isApplicationOpen(status) {
  const normalized = normalizeApplicationStatus(status)
  return APPLICATION_IN_PROGRESS_STATUSES.includes(normalized) || normalized === 'offer'
}

export function applicationStatusTone(status) {
  const normalized = normalizeApplicationStatus(status)
  if (['accepted', 'offer'].includes(normalized)) return 'green'
  if (['rejected', 'expired', 'position_closed'].includes(normalized)) return 'red'
  if (['withdrawn', 'offer_declined'].includes(normalized)) return 'slate'
  if (normalized === 'applied') return 'amber'
  return 'blue'
}

export function isUpcomingApplicationInterview(interview, now = Date.now()) {
  const scheduledAt = new Date(interview?.scheduled_at).getTime()
  return Number.isFinite(scheduledAt)
    && scheduledAt >= now
    && ['scheduled', 'rescheduled'].includes(String(interview?.status || '').toLowerCase())
}

export function summarizeApplications(applications = [], now = Date.now()) {
  const records = Array.isArray(applications) ? applications : []
  const statuses = records.map((application) => normalizeApplicationStatus(application.status))
  const interviews = records.flatMap((application) => (
    Array.isArray(application.interviews) ? application.interviews : []
  ))
  return {
    total: records.length,
    inProgress: statuses.filter((status) => APPLICATION_IN_PROGRESS_STATUSES.includes(status)).length,
    outstandingOffers: statuses.filter((status) => status === 'offer').length,
    accepted: statuses.filter((status) => status === 'accepted').length,
    closed: statuses.filter((status) => APPLICATION_TERMINAL_STATUSES.includes(status)).length,
    upcomingInterviews: interviews.filter((interview) => isUpcomingApplicationInterview(interview, now)).length,
  }
}
