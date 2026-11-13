export const DATE_RANGE_OPTIONS = Object.freeze(['today', '7d', '30d', '90d', 'year', 'previous_year', 'custom'])

export function buildDateRange({ range = 'all', now = new Date() } = {}) {
  const end = new Date(now)
  const start = new Date(now)

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case '7d':
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      break
    case '30d':
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      break
    case '90d':
      start.setDate(start.getDate() - 89)
      start.setHours(0, 0, 0, 0)
      break
    case 'year':
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      break
    case 'previous_year':
      start.setFullYear(start.getFullYear() - 1, 0, 1)
      start.setHours(0, 0, 0, 0)
      end.setFullYear(end.getFullYear() - 1, 11, 31)
      end.setHours(23, 59, 59, 999)
      break
    case 'custom':
      return { range, start, end }
    case 'all':
    default:
      start.setFullYear(1970, 0, 1)
      break
  }

  return { range, start, end }
}

export function filterByDate(items = [], dateField = 'created_at', range = 'all', now = new Date()) {
  if (!Array.isArray(items) || !items.length) return []
  const { start, end } = buildDateRange({ range, now })

  return items.filter((item) => {
    const value = item?.[dateField] || item?.date || item?.created_at || item?.updated_at
    if (!value) return true
    const timestamp = new Date(value)
    if (Number.isNaN(timestamp.getTime())) return true
    return timestamp >= start && timestamp <= end
  })
}

export function calculateRate(numerator, denominator, digits = 2) {
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) === 0) {
    return { value: null, label: 'Insufficient data', numerator: Number(numerator || 0), denominator: Number(denominator || 0) }
  }
  const value = (Number(numerator) / Number(denominator)) * 100
  return { value: Number(value.toFixed(digits)), numerator: Number(numerator || 0), denominator: Number(denominator || 0), label: `${value.toFixed(digits)}%` }
}

export function describeInsufficientData(label) {
  return {
    status: 'Insufficient data',
    message: `Insufficient data for ${label}.`,
  }
}

export function normalizeText(value, fallback = 'Not available') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function buildSummaryRecord({ title, value, note = 'Based on actual platform data.', type = 'metric' }) {
  return { title, value, note, type }
}
