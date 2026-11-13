import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createSystemHealthService,
  createSystemIncidentRecorder,
} from '../server/systemHealthService.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261121000002_system_health_monitoring.sql', import.meta.url),
  'utf8',
)
const serverSource = await readFile(new URL('../server/index.js', import.meta.url), 'utf8')
const routeSource = await readFile(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8')
const authServiceSource = await readFile(new URL('../src/services/authService.js', import.meta.url), 'utf8')

function createSupabaseMock({ failedTables = [], authError = null, storageError = null } = {}) {
  const failed = new Set(failedTables)
  return {
    from(table) {
      const state = { table, source: null, head: false }
      const query = {
        select(_columns, options = {}) { state.head = options.head === true; return query },
        limit() { return query },
        gte() { return query },
        order() { return query },
        eq(_column, value) { state.source = value; return query },
        then(resolve, reject) {
          const error = failed.has(table) ? { code: 'probe_failed' } : null
          const result = table === 'system_health_incidents'
            ? state.head
              ? { data: null, count: 2, error }
              : { data: [], count: null, error }
            : { data: null, count: null, error }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    },
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: authError }) } },
    storage: { listBuckets: async () => ({ data: [], error: storageError }) },
  }
}

function makeHealthService(overrides = {}) {
  return createSystemHealthService({
    supabase: createSupabaseMock(),
    geminiApiKey: 'test-key-not-a-real-secret',
    rateLimiter: {
      checkStorage: async () => ({
        configured: true,
        operational: true,
        storage: 'shared_database',
        distributed: true,
      }),
    },
    emailDeliveryStatus: { configured: false },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ supportedGenerationMethods: ['generateContent'] }),
    }),
    now: () => Date.parse('2026-11-13T00:00:00.000Z'),
    ...overrides,
  })
}

test('health checks only report operational after each provider probe succeeds', async () => {
  const result = await makeHealthService().runChecks()
  const checks = Object.fromEntries(result.checks.map((check) => [check.key, check]))

  assert.equal(result.status, 'degraded')
  assert.equal(checks.api.status, 'operational')
  assert.equal(checks.database.status, 'operational')
  assert.equal(checks.authentication.status, 'operational')
  assert.equal(checks.storage.status, 'operational')
  assert.equal(checks.gemini.status, 'operational')
  assert.equal(checks.rate_limit.status, 'operational')
  assert.equal(checks.email.status, 'not_verified')
  assert.equal(checks.email.lastSuccessfulAt, null)
  assert.equal(checks.gemini.lastSuccessfulAt, '2026-11-13T00:00:00.000Z')
  assert.equal(result.incidents.available, true)
})

test('failed database, auth, storage, Gemini, and rate-limit probes are not reported as operational', async () => {
  const recorded = []
  const result = await makeHealthService({
    supabase: createSupabaseMock({
      failedTables: ['profiles', 'system_health_incidents'],
      authError: { code: 'auth_unavailable' },
      storageError: { code: 'storage_unavailable' },
    }),
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    rateLimiter: {
      checkStorage: async () => ({
        configured: true,
        operational: false,
        storage: 'shared_database',
        distributed: true,
        lastErrorCode: 'rate_limit_store_down',
      }),
    },
    recordIncident: async (incident) => recorded.push(incident),
  }).runChecks()
  const checks = Object.fromEntries(result.checks.map((check) => [check.key, check]))

  assert.equal(result.status, 'degraded')
  for (const key of ['database', 'authentication', 'storage', 'gemini', 'rate_limit']) {
    assert.equal(checks[key].status, 'unavailable')
    assert.ok(checks[key].message)
    assert.equal(checks[key].lastSuccessfulAt, null)
  }
  assert.equal(checks.gemini.errorCode, 'http_503')
  assert.equal(result.incidents.available, false)
  assert.ok(recorded.some((incident) => incident.service === 'database'))
  assert.ok(recorded.some((incident) => incident.service === 'gemini'))
})

test('unconfigured providers remain unverified instead of appearing healthy', async () => {
  const result = await createSystemHealthService({
    supabase: null,
    geminiApiKey: '',
    rateLimiter: null,
    emailDeliveryStatus: { configured: false },
    now: () => Date.parse('2026-11-13T00:00:00.000Z'),
  }).runChecks()
  const checks = Object.fromEntries(result.checks.map((check) => [check.key, check]))

  assert.equal(checks.api.status, 'operational')
  assert.equal(checks.database.status, 'unavailable')
  assert.equal(checks.authentication.status, 'unavailable')
  assert.equal(checks.storage.status, 'unavailable')
  assert.equal(checks.gemini.status, 'unavailable')
  assert.equal(checks.email.status, 'not_verified')
  assert.equal(checks.rate_limit.status, 'unavailable')
  assert.equal(result.status, 'degraded')
})

test('incident recorder stores only allowlisted operational metadata and throttles duplicates', async () => {
  let timestamp = Date.parse('2026-11-13T00:00:00.000Z')
  const inserted = []
  const recorder = createSystemIncidentRecorder({
    now: () => timestamp,
    cooldownMs: 60_000,
    logger: { warn() {} },
    supabase: {
      from(table) {
        assert.equal(table, 'system_health_incidents')
        return {
          insert: async (record) => {
            inserted.push(record)
            return { error: null }
          },
        }
      },
    },
  })
  const incident = {
    source: 'authentication',
    service: 'authentication',
    routeCategory: 'admin',
    httpStatus: 401,
    userId: 'private-user-id',
    token: 'private-token',
    message: 'raw request body must not be stored',
  }

  assert.equal(await recorder(incident), true)
  assert.equal(await recorder(incident), false)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].message, 'An API authentication token was rejected.')
  assert.equal('userId' in inserted[0], false)
  assert.equal('token' in inserted[0], false)
  assert.equal('routeCategory' in inserted[0], false)
  assert.equal(inserted[0].route_category, 'admin')

  timestamp += 60_001
  assert.equal(await recorder({ ...incident, routeCategory: '/api/admin/users/123?email=user@example.com' }), true)
  assert.equal(inserted.length, 2)
  assert.equal(inserted[1].route_category, null)
  timestamp += 60_001
  assert.equal(await recorder({ source: 'client_auth_failure', service: 'authentication' }), true)
  assert.equal(inserted[2].message, 'A sign-in failure was reported by the browser.')
})

test('health incidents are admin-readable only and the health endpoint enforces backend role checks', () => {
  assert.match(migration, /alter table public\.system_health_incidents enable row level security/)
  assert.match(migration, /system_health_incidents_admin_read[\s\S]*using \(public\.is_admin\(\)\)/)
  assert.match(migration, /revoke all on public\.system_health_incidents from public, anon, authenticated/)
  assert.match(migration, /grant select, insert on public\.system_health_incidents to service_role/)
  assert.match(migration, /client_auth_failure/)
  assert.match(serverSource, /url\.pathname === '\/api\/admin\/system-health'[\s\S]*requireAdminUser\(req, res\)/)
  assert.match(serverSource, /url\.pathname === '\/api\/auth\/sign-in-failure'[\s\S]*source: 'client_auth_failure'/)
  assert.match(serverSource, /profile\?\.role !== 'admin'/)
  assert.match(authServiceSource, /if \(error\) \{\s*reportSignInFailure\(\)/)
  assert.match(authServiceSource, /fetch\(`\$\{apiBase\}\/api\/auth\/sign-in-failure`/)
  assert.doesNotMatch(authServiceSource.slice(authServiceSource.indexOf('function reportSignInFailure'), authServiceSource.indexOf('export const authService')), /body:|email|password/)
  assert.match(routeSource, /path="\/admin\/system-health" element=\{<RoleRoute allowedRoles=\{\['admin'\]\}/)
})
