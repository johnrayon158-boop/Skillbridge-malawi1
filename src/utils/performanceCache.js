const defaultCache = new Map()

export function getCachedValue(key, ttlMs = 5 * 60 * 1000) {
  const entry = defaultCache.get(key)
  if (!entry) return null

  if (typeof ttlMs === 'number' && ttlMs <= 0) return null

  if (Date.now() > entry.expiresAt) {
    defaultCache.delete(key)
    return null
  }

  return entry.value
}

export function setCachedValue(key, value, ttlMs = 5 * 60 * 1000) {
  defaultCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
  return value
}

export function clearCacheByPrefix(prefix) {
  for (const key of [...defaultCache.keys()]) {
    if (key.startsWith(prefix)) {
      defaultCache.delete(key)
    }
  }
}

export function readThroughCache(key, callback, ttlMs = 5 * 60 * 1000) {
  const cached = getCachedValue(key, ttlMs)
  if (cached !== null) return Promise.resolve(cached)

  return Promise.resolve(callback()).then((result) => {
    setCachedValue(key, result, ttlMs)
    return result
  })
}
