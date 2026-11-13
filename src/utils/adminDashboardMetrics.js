export const ADMIN_DASHBOARD_DATE_RANGES = Object.freeze([
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'Year to date' },
])

export function getAdminDashboardDateRange(range = 'all', now = new Date()) {
  const selected = ADMIN_DASHBOARD_DATE_RANGES.find((option) => option.value === range)?.value || 'all'
  const end = new Date(now)
  let start = null

  if (selected === '30d' || selected === '90d') {
    start = new Date(end)
    start.setUTCDate(start.getUTCDate() - (selected === '30d' ? 30 : 90))
  } else if (selected === 'year') {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
  }

  return {
    range: selected,
    label: ADMIN_DASHBOARD_DATE_RANGES.find((option) => option.value === selected).label,
    from: start?.toISOString() || null,
    to: selected === 'all' ? null : end.toISOString(),
  }
}
