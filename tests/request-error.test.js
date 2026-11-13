import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRequestError, createDebugReference, getSafeErrorMetadata } from '../src/utils/requestError.js'

test('classifies connection failures without exposing the underlying error text', () => {
  const error = new TypeError('Failed to fetch https://private-api.example/secret')
  const presentation = classifyRequestError(error)

  assert.equal(presentation.category, 'network')
  assert.match(presentation.message, /internet connection/)
  assert.doesNotMatch(presentation.message, /private-api|secret/)
})

test('distinguishes authentication and permission failures', () => {
  assert.equal(classifyRequestError(Object.assign(new Error('request failed'), { status: 401 })).category, 'authentication')
  assert.equal(classifyRequestError(Object.assign(new Error('request failed'), { code: '42501' })).category, 'permission')
})

test('provides a safe AI outage message and a debug reference', () => {
  const presentation = classifyRequestError(new Error('Gemini returned private provider details'))
  const referenceId = createDebugReference()
  const metadata = getSafeErrorMetadata(new Error('private response body'), 'service', referenceId)

  assert.equal(presentation.category, 'ai')
  assert.doesNotMatch(presentation.message, /private provider/)
  assert.match(referenceId, /^SB-/)
  assert.equal(metadata.referenceId, referenceId)
  assert.equal(Object.hasOwn(metadata, 'message'), false)
})

test('uses a safe fallback for server failures and marks AI outages by status', () => {
  const serverError = classifyRequestError(new Error('database connection string and query details'), {
    fallback: 'Dashboard data could not be loaded.',
  })
  const aiError = classifyRequestError(Object.assign(new Error('upstream response body'), {
    code: 'AI_UNAVAILABLE',
    status: 503,
  }))

  assert.equal(serverError.message, 'Dashboard data could not be loaded.')
  assert.doesNotMatch(serverError.message, /connection string|query details/)
  assert.equal(aiError.category, 'ai')
})
