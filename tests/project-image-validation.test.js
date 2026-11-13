import test from 'node:test'
import assert from 'node:assert/strict'

import { validateProjectImageFile } from '../src/utils/projectImageValidation.js'

test('project image upload accepts supported image formats', () => {
  for (const [type, extension] of [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
    ['image/gif', 'gif'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
  ]) {
    assert.deepEqual(validateProjectImageFile({ type, size: 1024 }), { valid: true, extension })
  }
})

test('project image upload rejects missing, unsupported and oversized files', () => {
  assert.equal(validateProjectImageFile(null).valid, false)
  assert.equal(validateProjectImageFile({ type: 'application/pdf', size: 1024 }).valid, false)
  assert.deepEqual(validateProjectImageFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), {
    valid: false,
    message: 'Project images must be 10 MB or smaller.',
  })
})
