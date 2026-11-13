import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSecurityOverview } from '../src/utils/securityOverview.js'

test('security overview accepts either supported public Supabase key configuration', () => {
  const overview = buildSecurityOverview({ hasSupabaseUrl: true, hasSupabaseKey: true })
  const auth = overview.checks.find((check) => check.key === 'authentication')

  assert.equal(auth.status, 'Configured')
  assert.equal(overview.note.includes('not a penetration test'), true)
})

test('security overview reports API CORS as unavailable when runtime configuration cannot be read', () => {
  const overview = buildSecurityOverview({ hasSupabaseUrl: false, hasSupabaseKey: false })
  const cors = overview.checks.find((check) => check.key === 'api')
  const throttling = overview.checks.find((check) => check.key === 'abuse-protection')
  const authRateLimits = overview.checks.find((check) => check.key === 'supabase-auth-rate-limits')
  const auth = overview.checks.find((check) => check.key === 'authentication')

  assert.equal(auth.status, 'Needs configuration')
  assert.equal(cors.status, 'Configuration unavailable')
  assert.match(cors.description, /runtime CORS configuration could not be read/)
  assert.equal(throttling.status, 'Configuration unavailable')
  assert.equal(authRateLimits.status, 'Not verified')
  assert.match(authRateLimits.description, /Supabase Dashboard > Authentication > Rate Limits/)
})

test('security overview reflects the API runtime allowlist and credential behavior', () => {
  const overview = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    corsConfiguration: {
      allowedOrigins: ['https://skillbridge.example'],
      allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
    },
  })
  const cors = overview.checks.find((check) => check.key === 'api')

  assert.equal(cors.status, 'Restricted origin allowlist')
  assert.equal(cors.tone, 'green')
  assert.match(cors.description, /https:\/\/skillbridge\.example/)
  assert.match(cors.description, /Credentials are not enabled/)
})

test('security overview warns when no cross-origin browser origins are allowed', () => {
  const overview = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    corsConfiguration: { allowedOrigins: [], allowedMethods: [], allowedHeaders: [], credentials: false },
  })
  const cors = overview.checks.find((check) => check.key === 'api')

  assert.equal(cors.status, 'No cross-origin origins allowed')
  assert.equal(cors.tone, 'amber')
})

test('security overview distinguishes shared rate limits from local-only protection', () => {
  const shared = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    corsConfiguration: { allowedOrigins: [], allowedMethods: [], allowedHeaders: [], credentials: false },
    rateLimitConfiguration: {
      configured: true,
      operational: true,
      distributed: true,
      storage: 'shared_database',
    },
  }).checks.find((check) => check.key === 'abuse-protection')
  const local = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    corsConfiguration: { allowedOrigins: [], allowedMethods: [], allowedHeaders: [], credentials: false },
    rateLimitConfiguration: {
      configured: true,
      operational: true,
      distributed: false,
      storage: 'in_memory',
    },
  }).checks.find((check) => check.key === 'abuse-protection')

  assert.equal(shared.status, 'Operational (shared storage)')
  assert.equal(shared.tone, 'green')
  assert.match(shared.description, /Limits are shared across API instances/)
  assert.equal(local.status, 'Operational (single instance only)')
  assert.equal(local.tone, 'amber')
  assert.match(local.description, /bypass this Node API/)
})

test('security overview warns when configured rate-limit storage is unhealthy', () => {
  const rateLimits = buildSecurityOverview({
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    rateLimitConfiguration: {
      configured: true,
      operational: false,
      distributed: true,
      storage: 'shared_database',
      lastErrorCode: 'PGRST202',
    },
  }).checks.find((check) => check.key === 'abuse-protection')

  assert.equal(rateLimits.status, 'Unavailable')
  assert.equal(rateLimits.tone, 'red')
  assert.match(rateLimits.description, /PGRST202/)
})
