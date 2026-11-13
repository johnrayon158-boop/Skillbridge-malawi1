import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

const seconds = (value) => Math.max(1, Math.ceil(value / 1000))

export function getRateLimitRule(method, pathname) {
  if (pathname === '/health' && method === 'GET') {
    return { scope: 'health', limit: 120, ipLimit: 120, windowSeconds: 60, storage: 'local' }
  }
  if (pathname === '/api/admin/system-health' && method === 'GET') {
    return { scope: 'admin-system-health', limit: 20, ipLimit: 30, windowSeconds: 60, storage: 'local' }
  }
  if (pathname === '/api/auth/sign-in-failure' && method === 'POST') {
    return { scope: 'auth-failure-telemetry', limit: 10, ipLimit: 10, windowSeconds: 60, storage: 'local' }
  }
  if (!pathname.startsWith('/api/')) return null

  if (pathname === '/api/placements/public-search') {
    return { scope: 'placement-search', limit: 20, ipLimit: 100, windowSeconds: 60 }
  }
  if (pathname === '/api/ai/career-recommendations') {
    return { scope: 'career-recommendations', limit: 10, ipLimit: 40, windowSeconds: 60 }
  }
  if (pathname === '/api/ai/career-chat' && method === 'POST') {
    return { scope: 'career-chat', limit: 12, ipLimit: 30, windowSeconds: 60 }
  }
  if (pathname.startsWith('/api/ai/career-chat/conversations')) {
    return method === 'DELETE'
      ? { scope: 'career-chat-history-delete', limit: 10, ipLimit: 30, windowSeconds: 60 }
      : { scope: 'career-chat-history-read', limit: 60, ipLimit: 180, windowSeconds: 60 }
  }
  if (pathname === '/api/ai/cv-analysis' && method === 'POST') {
    return { scope: 'cv-analysis', limit: 4, ipLimit: 12, windowSeconds: 15 * 60 }
  }
  if (pathname.startsWith('/api/ai/cv-analysis')) {
    return { scope: 'cv-analysis-history', limit: 60, ipLimit: 180, windowSeconds: 60 }
  }
  if (pathname === '/api/admin/skills/extract-pdf' && method === 'POST') {
    return { scope: 'admin-skills-pdf-upload', limit: 3, ipLimit: 10, windowSeconds: 15 * 60 }
  }
  if (pathname.startsWith('/api/ai/') || pathname.startsWith('/api/employer/')) {
    return { scope: 'ai-and-employer-operations', limit: 30, ipLimit: 120, windowSeconds: 60 }
  }
  return { scope: 'api', limit: 100, ipLimit: 300, windowSeconds: 60 }
}

export function getClientIp(req, trustedProxy = '') {
  if (trustedProxy === 'cloudflare') {
    const forwardedIp = req.headers['cf-connecting-ip']
    if (typeof forwardedIp === 'string' && isIP(forwardedIp)) return forwardedIp
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function createMemoryRateLimitStore({ now = Date.now } = {}) {
  const buckets = new Map()
  let requestsSinceCleanup = 0

  return {
    async consume(key, { limit, windowSeconds }) {
      const currentTime = now()
      let bucket = buckets.get(key)
      if (!bucket || currentTime >= bucket.resetAt) {
        bucket = { count: 0, resetAt: currentTime + windowSeconds * 1000 }
      }

      bucket.count = Math.min(bucket.count + 1, limit + 1)
      buckets.set(key, bucket)
      requestsSinceCleanup += 1
      if (requestsSinceCleanup >= 256) {
        for (const [bucketKey, entry] of buckets) {
          if (currentTime >= entry.resetAt) buckets.delete(bucketKey)
        }
        requestsSinceCleanup = 0
      }

      return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: seconds(bucket.resetAt - currentTime),
        resetAt: new Date(bucket.resetAt).toISOString(),
      }
    },
    async probe() {
      return true
    },
  }
}

export function createSupabaseRateLimitStore(supabase) {
  return {
    async consume(keyHash, { limit, windowSeconds }) {
      const { data, error } = await supabase.rpc('consume_api_rate_limit', {
        p_key_hash: keyHash,
        p_max_requests: limit,
        p_window_seconds: windowSeconds,
      })
      if (error) throw error

      const result = Array.isArray(data) ? data[0] : data
      if (
        !result ||
        typeof result.allowed !== 'boolean' ||
        !Number.isFinite(Number(result.remaining)) ||
        !Number.isFinite(Number(result.retry_after_seconds))
      ) {
        throw new Error('Rate-limit storage returned an invalid result.')
      }

      return {
        allowed: result.allowed,
        remaining: Number(result.remaining),
        retryAfterSeconds: Number(result.retry_after_seconds),
        resetAt: result.reset_at || null,
      }
    },
    async probe() {
      const { data, error } = await supabase.rpc('check_api_rate_limit_storage')
      if (error) throw error
      if (data !== true) throw new Error('Rate-limit storage health check failed.')
      return true
    },
  }
}

export function createRateLimiter({ store, storageMode, hashSecret }) {
  let operational = storageMode === 'in_memory' && Boolean(store)
  let lastCheckAt = null
  let lastErrorCode = null
  const getPublicStatus = () => {
    const configured = Boolean(store && hashSecret)
    return {
      enabled: true,
      configured,
      operational: configured && operational,
      storage: configured ? storageMode : 'unavailable',
      distributed: configured && storageMode === 'shared_database',
      lastCheckedAt: lastCheckAt,
      lastErrorCode: lastErrorCode || null,
    }
  }

  const consume = async ({ scope, identityType, identity, limit, windowSeconds }) => {
    if (!store || !hashSecret) {
      operational = false
      throw new Error('Rate-limit storage is not configured.')
    }

    const keyHash = createHmac('sha256', hashSecret)
      .update(`${scope}:${identityType}:${identity}`)
      .digest('hex')

    try {
      const result = await store.consume(keyHash, { limit, windowSeconds })
      operational = true
      lastCheckAt = new Date().toISOString()
      lastErrorCode = null
      return result
    } catch (error) {
      operational = false
      lastErrorCode = error?.code || error?.name || 'storage_error'
      throw error
    }
  }

  return {
    consume,
    async checkStorage() {
      if (!store || !hashSecret) {
        operational = false
        lastCheckAt = new Date().toISOString()
        lastErrorCode = 'not_configured'
        return getPublicStatus()
      }

      try {
        await store.probe()
        operational = true
        lastCheckAt = new Date().toISOString()
        lastErrorCode = null
      } catch (error) {
        operational = false
        lastCheckAt = new Date().toISOString()
        lastErrorCode = error?.code || error?.name || 'storage_error'
      }
      return getPublicStatus()
    },
    getPublicStatus,
  }
}
