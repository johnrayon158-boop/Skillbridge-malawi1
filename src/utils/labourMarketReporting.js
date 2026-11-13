export function getPostingDateRange(range = 'all', now = new Date()) {
  if (range === 'all') return { range, from: null, to: null }
  const end = new Date(now)
  let start
  if (range === '30d' || range === '90d') {
    start = new Date(end)
    start.setUTCDate(start.getUTCDate() - (range === '30d' ? 30 : 90))
  } else if (range === 'year') {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
  } else {
    return getPostingDateRange('all', now)
  }
  return { range, from: start.toISOString(), to: end.toISOString() }
}

export function getLabourMarketQueryFilters(filters = {}, now = new Date()) {
  return {
    sector: String(filters.sector || '').trim(),
    location: String(filters.location || '').trim(),
    career: String(filters.career || '').trim(),
    employmentType: filters.employmentType || '',
    opportunityType: filters.opportunityType || '',
    academicProgramme: String(filters.academicProgramme || '').trim(),
    postingDateRange: getPostingDateRange(filters.postedWithin || 'all', now),
  }
}

export function summarizePostingDateCoverage(jobs = []) {
  const dates = jobs
    .map((job) => job.published_at || job.created_at || job.posted_at)
    .map((date) => new Date(date).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right)

  return {
    sampleSize: jobs.length,
    dateCoverage: dates.length
      ? { from: new Date(dates[0]).toISOString(), to: new Date(dates.at(-1)).toISOString() }
      : null,
  }
}
