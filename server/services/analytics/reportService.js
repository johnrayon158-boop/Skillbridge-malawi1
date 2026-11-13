export function buildReport({ title = 'SkillBridge report', rows = [], filters = {}, type = 'general' } = {}) {
  const csvHeader = ['label', 'value']
  const csvRows = rows.map((row) => `${row.label},${row.value}`)
  const csv = [csvHeader.join(','), ...csvRows].join('\n')

  return {
    title,
    type,
    filters,
    rows,
    csv: `${csv}\nfilters,${JSON.stringify(filters)}`,
    generatedAt: new Date().toISOString(),
    notes: ['SkillBridge Malawi', 'Report generated from actual platform data only.', 'Selected filters are included in the export.'],
  }
}

export function generateCsvReport(report) {
  return report?.csv || ''
}
