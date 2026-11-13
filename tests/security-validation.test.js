import test from 'node:test'
import assert from 'node:assert/strict'

import {
  validateUuid,
  sanitizeText,
  validateRequestBody,
  limitTextLength,
  isSafeHtmlFree,
} from '../src/utils/securityValidation.js'

test('security validator accepts safe IDs and text', () => {
  assert.equal(validateUuid('123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(sanitizeText('<script>alert(1)</script> Hello'), 'Hello')
  assert.deepEqual(validateRequestBody({ role: 'student', email: 'demo@skillbridge.mw' }, ['role', 'email']), { ok: true })
  assert.equal(limitTextLength('hello world', 20), 'hello world')
  assert.equal(isSafeHtmlFree('<b>strong</b>'), false)
})

test('security validator rejects unsafe values', () => {
  assert.equal(validateUuid('not-a-uuid'), false)
  assert.equal(validateRequestBody({ role: 'admin' }, ['role'], ['student']).ok, false)
  assert.equal(limitTextLength('x'.repeat(200), 10), 'x'.repeat(10))
  assert.equal(isSafeHtmlFree('<img src=x onerror=alert(1)>'), false)
})
