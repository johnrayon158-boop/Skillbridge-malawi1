export const INTERVIEW_REPORT_CATEGORIES = Object.freeze([
  { value: 'discriminatory', label: 'Discriminatory or unrelated personal questions' },
  { value: 'invasive_or_private', label: 'Request for private or sensitive information' },
  { value: 'unsafe_or_unprofessional', label: 'Unsafe or unprofessional instruction' },
  { value: 'other', label: 'Other concern' },
])

export function validateInterviewMeetingUrl(value) {
  const rawUrl = String(value || '').trim()
  if (!rawUrl) return { valid: true, url: null }
  if (rawUrl.length > 2048) return { valid: false, url: null }

  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return { valid: false, url: null }
    }
    return { valid: true, url: url.href }
  } catch {
    return { valid: false, url: null }
  }
}

export function getSafeMeetingUrl(value) {
  const result = validateInterviewMeetingUrl(value)
  return result.valid ? result.url || '' : ''
}

export function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function formatInterviewDateTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date and time unavailable'

  const formatted = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: getLocalTimeZone(),
    timeZoneName: 'short',
  }).format(date)
  return `${formatted} (${getLocalTimeZone()})`
}

export function toLocalInterviewDateTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function normalizeInterviewReport(report) {
  if (!report || typeof report !== 'object') return null
  const allowedCategories = new Set(INTERVIEW_REPORT_CATEGORIES.map(({ value }) => value))
  const allowedStatuses = new Set(['open', 'reviewing', 'resolved', 'dismissed'])
  if (!allowedCategories.has(report.category) || !allowedStatuses.has(report.status)) return null
  return {
    ...report,
    details: typeof report.details === 'string' ? report.details : '',
  }
}
