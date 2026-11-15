import test from 'node:test'
import assert from 'node:assert/strict'

import { createAssessmentRequestId } from '../src/utils/assessmentRequestId.js'

test('uses the native UUID API when it is available', () => {
  assert.equal(createAssessmentRequestId({ randomUUID: () => 'native-uuid' }), 'native-uuid')
})

test('creates a UUID v4 when randomUUID is unavailable', () => {
  const id = createAssessmentRequestId({
    getRandomValues(bytes) {
      bytes.fill(0)
      return bytes
    },
  })

  assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-8[\da-f]{3}-[\da-f]{12}$/)
})

test('creates a UUID v4 when Web Crypto is unavailable', () => {
  const id = createAssessmentRequestId({})

  assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
})
