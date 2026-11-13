import { describeInsufficientData } from './analyticsService.js'

export function buildEmploymentAnalytics({ records = [] } = {}) {
  const active = records.filter((item) => String(item.status || '').toLowerCase() === 'active').length
  const completed = records.filter((item) => String(item.status || '').toLowerCase() === 'completed').length
  const sectors = records.reduce((accumulator, item) => {
    const sector = item.sector || item.industry || 'Unspecified'
    accumulator[sector] = (accumulator[sector] || 0) + 1
    return accumulator
  }, {})

  return {
    totalRecords: records.length,
    active,
    completed,
    sectors,
    notes: records.length ? ['Employment analytics reflect tracked employment records only.'] : [describeInsufficientData('employment analytics').message],
  }
}
