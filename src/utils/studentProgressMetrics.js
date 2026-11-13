function latestTimestamp(record) {
  const timestamp = Date.parse(record?.updated_at || record?.completed_at || record?.created_at || '')
  return Number.isFinite(timestamp) ? timestamp : null
}

function uniqueLearningProgress(items = []) {
  const latest = new Map()
  items.forEach((item, index) => {
    const record = item?.progress && typeof item.progress === 'object' ? item.progress : item
    if (!record || typeof record !== 'object') return
    const key = record.resource_id || item.resource_id || item.id || `unkeyed-${index}`
    const current = latest.get(key)
    const nextTimestamp = latestTimestamp(record)
    const currentTimestamp = latestTimestamp(current)
    if (!current || (nextTimestamp !== null && (currentTimestamp === null || nextTimestamp >= currentTimestamp))) {
      latest.set(key, record)
    }
  })
  return [...latest.values()]
}

export function calculateLearningProgressMetrics(items = []) {
  const tracked = uniqueLearningProgress(Array.isArray(items) ? items : [])
    .filter((record) => ['in_progress', 'completed'].includes(record.status))
  const completedCount = tracked.filter((record) => record.status === 'completed').length
  const progressValues = tracked.map((record) => {
    if (record.status === 'completed') return 100
    const progress = Number(record.progress)
    return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0
  })

  return {
    average: progressValues.length
      ? Math.round(progressValues.reduce((sum, progress) => sum + progress, 0) / progressValues.length)
      : null,
    trackedCount: tracked.length,
    completedCount,
  }
}
