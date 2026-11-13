import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMemoryRateLimitStore,
  createRateLimiter,
  createSupabaseRateLimitStore,
  getClientIp,
  getRateLimitRule,
} from '../server/rateLimitService.js'

test('rate-limit policies distinguish sensitive AI, search, upload, and general API requests', () => {
  assert.deepEqual(getRateLimitRule('POST', '/api/ai/cv-analysis'), {
    scope: 'cv-analysis',
    limit: 4,
    ipLimit: 12,
    windowSeconds: 900,
  })
  assert.equal(getRateLimitRule('POST', '/api/ai/career-chat').limit, 12)
  assert.equal(getRateLimitRule('GET', '/api/placements/public-search').scope, 'placement-search')
  assert.equal(getRateLimitRule('POST', '/api/admin/skills/extract-pdf').scope, 'admin-skills-pdf-upload')
  assert.deepEqual(getRateLimitRule('GET', '/api/admin/system-health'), {
    scope: 'admin-system-health',
    limit: 20,
    ipLimit: 30,
    windowSeconds: 60,
    storage: 'local',
  })
  assert.equal(getRateLimitRule('POST', '/api/unknown').scope, 'api')
  assert.equal(getRateLimitRule('GET', '/assets/app.js'), null)
})

test('memory limiter enforces a fixed window and returns retry details', async () => {
  let now = 1000
  const limiter = createRateLimiter({
    store: createMemoryRateLimitStore({ now: () => now }),
    storageMode: 'in_memory',
    hashSecret: 'test-secret',
  })
  const request = {
    scope: 'chat',
    identityType: 'user',
    identity: 'student-1',
    limit: 2,
    windowSeconds: 60,
  }

  assert.deepEqual(await limiter.consume(request), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 60,
    resetAt: new Date(61000).toISOString(),
  })
  assert.equal((await limiter.consume(request)).allowed, true)
  const blocked = await limiter.consume(request)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)
  assert.equal(blocked.retryAfterSeconds, 60)

  now = 61000
  assert.equal((await limiter.consume(request)).allowed, true)
})

test('rate-limit store keys are HMACed and do not expose identity values', async () => {
  let savedKey = ''
  const limiter = createRateLimiter({
    store: {
      async consume(key) {
        savedKey = key
        return { allowed: true, remaining: 1, retryAfterSeconds: 20 }
      },
    },
    storageMode: 'shared_database',
    hashSecret: 'test-secret',
  })

  await limiter.consume({
    scope: 'cv-analysis',
    identityType: 'user',
    identity: 'private-user-id',
    limit: 2,
    windowSeconds: 60,
  })
  assert.match(savedKey, /^[a-f0-9]{64}$/)
  assert.equal(savedKey.includes('private-user-id'), false)
})

test('Supabase limiter uses the atomic RPC and validates its response', async () => {
  const calls = []
  const store = createSupabaseRateLimitStore({
    async rpc(name, parameters) {
      calls.push({ name, parameters })
      return {
        data: [{ allowed: false, remaining: 0, retry_after_seconds: 18, reset_at: '2026-01-01T00:00:18Z' }],
        error: null,
      }
    },
  })

  const result = await store.consume('a'.repeat(64), { limit: 3, windowSeconds: 60 })
  assert.deepEqual(calls[0], {
    name: 'consume_api_rate_limit',
    parameters: { p_key_hash: 'a'.repeat(64), p_max_requests: 3, p_window_seconds: 60 },
  })
  assert.equal(result.allowed, false)
  assert.equal(result.retryAfterSeconds, 18)
})

test('client IP ignores untrusted forwarding headers unless Cloudflare proxy trust is enabled', () => {
  const req = {
    headers: { 'x-forwarded-for': '198.51.100.10', 'cf-connecting-ip': '203.0.113.8' },
    socket: { remoteAddress: '192.0.2.3' },
  }

  assert.equal(getClientIp(req), '192.0.2.3')
  assert.equal(getClientIp(req, 'cloudflare'), '203.0.113.8')
  assert.equal(getClientIp({ ...req, headers: { 'cf-connecting-ip': 'not-an-ip' } }, 'cloudflare'), '192.0.2.3')
})

test('missing shared storage is reported and cannot silently allow requests', async () => {
  const limiter = createRateLimiter({
    store: null,
    storageMode: 'unavailable',
    hashSecret: '',
  })

  assert.equal((await limiter.checkStorage()).configured, false)
  assert.equal(limiter.getPublicStatus().operational, false)
  await assert.rejects(limiter.consume({
    scope: 'api',
    identityType: 'ip',
    identity: '192.0.2.3',
    limit: 10,
    windowSeconds: 60,
  }), /not configured/)
})
