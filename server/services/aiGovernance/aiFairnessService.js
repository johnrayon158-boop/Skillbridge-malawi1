const getAverage = (values = []) => {
  if (!Array.isArray(values) || !values.length) return 0
  const total = values.reduce((sum, value) => sum + Number(value ?? 0), 0)
  return total / values.length
}

export function analyzeFairness({ records = [], groups = [] } = {}) {
  const sourceRecords = Array.isArray(records) ? records : []
  const availableGroups = Array.isArray(groups) ? groups.filter((group) => Array.isArray(group?.records) && group.records.length) : []

  if (!sourceRecords.length || !availableGroups.length || sourceRecords.length < 2) {
    return {
      status: 'Insufficient data for fairness analysis',
      summary: 'There is not enough comparable data to assess whether recommendations differ materially across available groups.',
      groups: [],
      scoreDifferences: [],
    }
  }

  const scoreDifferences = availableGroups.map((group) => {
    const averageScore = getAverage(group.records.map((entry) => Number(entry?.score ?? entry?.overall_score ?? 0)))
    return {
      label: group.label || 'Group',
      count: group.records.length,
      averageScore,
    }
  })

  const maxScore = Math.max(...scoreDifferences.map((item) => item.averageScore), 0)
  const minScore = Math.min(...scoreDifferences.map((item) => item.averageScore), 0)
  const difference = maxScore - minScore

  if (difference <= 10 || scoreDifferences.length < 2) {
    return {
      status: 'Insufficient data for fairness analysis',
      summary: 'The available data does not show a material difference large enough to justify a fairness concern, or there is not enough comparable data.',
      groups: scoreDifferences,
      scoreDifferences,
    }
  }

  return {
    status: 'Monitoring active',
    summary: `Recommendation variation across available groups is ${difference.toFixed(1)} points. This is a monitoring signal, not proof of bias.`,
    groups: scoreDifferences,
    scoreDifferences,
  }
}
