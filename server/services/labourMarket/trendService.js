const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toMonthKey(dateString) {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return 'Unknown'
  return `${MONTH_NAMES[(month - 1) % 12]} ${year}`
}

function isConsecutiveMonth(previousMonth, currentMonth) {
  const monthIndex = (monthKey) => {
    const [year, month] = monthKey.split('-').map(Number)
    return year * 12 + month
  }
  return monthIndex(currentMonth) - monthIndex(previousMonth) === 1
}

export function calculateTrendData(jobs = [], period = 'month') {
  const activeJobs = Array.isArray(jobs) ? jobs.filter((job) => String(job.status || '').toLowerCase() === 'published') : []
  if (!activeJobs.length) {
    return { period, hasData: false, summary: 'Insufficient data for reliable trend analysis.', series: [], trendItems: [] }
  }

  const monthlyMap = new Map()
  for (const job of activeJobs) {
    const postedAt = job.published_at || job.created_at || job.posted_at
    const monthKey = postedAt ? toMonthKey(postedAt) : null
    if (!monthKey) continue

    const current = monthlyMap.get(monthKey) || { monthKey, count: 0 }
    current.count += 1
    monthlyMap.set(monthKey, current)
  }

  const series = [...monthlyMap.entries()].map(([monthKey, record]) => ({
    key: monthKey,
    label: monthLabel(monthKey),
    count: record.count,
  })).sort((a, b) => a.key.localeCompare(b.key))

  const trendItems = []
  const skillsMap = new Map()
  for (const job of activeJobs) {
    const skillEntries = Array.isArray(job.job_skills) ? job.job_skills : []
    for (const entry of skillEntries) {
      const skillName = String(entry?.skills?.name || entry?.name || entry?.skill_name || entry?.skill || '').trim()
      if (!skillName) continue
      const monthKey = job.published_at ? toMonthKey(job.published_at) : null
      if (!monthKey) continue
      const bucket = skillsMap.get(skillName) || new Map()
      bucket.set(monthKey, (bucket.get(monthKey) || 0) + 1)
      skillsMap.set(skillName, bucket)
    }
  }

  for (const [skillName, bucket] of [...skillsMap.entries()].sort((a, b) => b[1].size - a[1].size)) {
    const values = [...bucket.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const previousValue = values.at(-2)
    const currentValue = values.at(-1)
    if (!previousValue || !currentValue || !isConsecutiveMonth(previousValue[0], currentValue[0])) {
      trendItems.push({ skill: skillName, currentPeriod: currentValue?.[1] || 0, previousPeriod: previousValue?.[1] || 0, change: null, trend: 'Insufficient data', period })
      continue
    }
    const current = currentValue[1]
    const previous = previousValue[1]
    const change = current - previous
    let trend = 'Stable demand'
    if (change > 0) trend = 'Increasing demand'
    else if (change < 0) trend = 'Decreasing demand'
    if (current + previous === 0) trend = 'Insufficient data'
    trendItems.push({ skill: skillName, currentPeriod: current, previousPeriod: previous, change, trend, period })
  }

  return {
    period,
    hasData: series.length > 0,
    totalJobs: activeJobs.length,
    summary: series.length ? 'Monthly posting trends calculated from published role data.' : 'Insufficient data for reliable trend analysis.',
    series,
    trendItems: trendItems.sort((a, b) => b.currentPeriod - a.currentPeriod).slice(0, 10),
  }
}
