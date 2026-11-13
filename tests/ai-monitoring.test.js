import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildAiRequestEvent,
  persistAiRequestEvent,
  setAiFallbackMetadata,
  updateAiProviderMetadata,
} from '../server/services/aiGovernance/aiMonitoringService.js'

test('AI request events classify success, fallback, validation, and provider failures', () => {
  const cases = [
    [200, {}, 'success', 'passed'],
    [200, { requestOutcome: 'fallback' }, 'fallback', 'not_attempted'],
    [422, {}, 'validation_error', 'failed'],
    [503, {}, 'unavailable', 'not_attempted'],
  ]

  for (const [statusCode, metadata, outcome, validation] of cases) {
    const event = buildAiRequestEvent({
      featureType: 'career_chat',
      statusCode,
      durationMs: 42.6,
      metadata,
    })
    assert.equal(event.request_outcome, outcome)
    assert.equal(event.validation_status, validation)
    assert.equal(event.duration_ms, 43)
  }
})

test('AI request events persist only allowlisted telemetry fields', () => {
  const event = buildAiRequestEvent({
    featureType: 'cv_analysis',
    statusCode: 200,
    durationMs: 25,
    metadata: {
      modelProvider: 'google-gemini',
      modelIdentifier: 'gemini-2.5-flash',
      providerStatus: 'invalid',
      validationStatus: 'failed',
      errorCategory: 'invalid_schema',
      providerResponseId: 'resp_123',
      privatePrompt: 'must not be persisted',
      cvText: 'private CV contents',
    },
  })

  assert.deepEqual(Object.keys(event).sort(), [
    'duration_ms',
    'error_category',
    'feature_type',
    'http_status',
    'model_identifier',
    'model_provider',
    'provider_response_id',
    'provider_status',
    'request_outcome',
    'validation_status',
  ].sort())
  assert.equal(JSON.stringify(event).includes('private'), false)
  assert.equal(event.provider_status, 'invalid')
  assert.equal(event.provider_response_id, 'resp_123')
})

test('provider metadata sanitizes provider identifiers and fallback state', () => {
  const req = { aiMonitoring: {} }
  updateAiProviderMetadata(req, {
    status: 'ok',
    model: 'gemini-2.5-flash',
    responseId: 'resp_123',
  }, 'gemini-2.5-flash')
  assert.equal(req.aiMonitoring.validationStatus, 'passed')
  assert.equal(req.aiMonitoring.modelProvider, 'google-gemini')

  updateAiProviderMetadata(req, {
    status: 'invalid',
    model: 'model with unexpected text',
    responseId: 'invalid response id',
    reason: 'invalid_schema',
  }, 'gemini-2.5-flash')
  assert.equal(req.aiMonitoring.modelIdentifier, 'gemini-2.5-flash')
  assert.equal(req.aiMonitoring.providerResponseId, null)
  assert.equal(req.aiMonitoring.errorCategory, 'invalid_schema')
  setAiFallbackMetadata(req)
  assert.equal(req.aiMonitoring.modelProvider, 'deterministic-fallback')
  assert.equal(req.aiMonitoring.errorCategory, 'provider_not_configured')
})

test('AI telemetry is inserted through the server database client', async () => {
  let inserted = null
  const database = {
    from(table) {
      assert.equal(table, 'ai_request_events')
      return { insert: async (event) => { inserted = event; return { error: null } } }
    },
  }
  const event = buildAiRequestEvent({ featureType: 'job_match', statusCode: 200, durationMs: 5 })
  await persistAiRequestEvent(database, event)
  assert.deepEqual(inserted, event)
})

test('AI telemetry migration limits client access and excludes prompt or response payloads', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261119000006_ai_monitoring_telemetry.sql', import.meta.url), 'utf8')
  assert.match(migration, /alter table public\.ai_request_events enable row level security/i)
  assert.match(migration, /for select using \(public\.is_admin\(\)\)/i)
  assert.match(migration, /revoke insert, update, delete, truncate on public\.ai_request_events from anon, authenticated/i)
  assert.match(migration, /drop policy if exists ai_decision_logs_admin_all/i)
  assert.match(migration, /drop policy if exists ai_governance_events_admin_all/i)
  assert.doesNotMatch(migration, /\b(prompt|cv_text|response_payload|request_body)\b/i)
})
