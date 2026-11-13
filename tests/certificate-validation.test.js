import test from 'node:test'
import assert from 'node:assert/strict'

import { validateCertificateFile } from '../src/utils/certificateValidation.js'

test('certificate upload accepts supported PDF and image formats', () => {
  for (const [type, extension] of [
    ['application/pdf', 'pdf'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
  ]) {
    assert.deepEqual(validateCertificateFile({ type, size: 1024 }), { valid: true, extension })
  }
})

test('certificate upload rejects missing, unsupported and oversized files', () => {
  assert.equal(validateCertificateFile(null).valid, false)
  assert.equal(validateCertificateFile({ type: 'image/svg+xml', size: 1024 }).valid, false)
  assert.deepEqual(validateCertificateFile({ type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }), {
    valid: false,
    message: 'Certificate files must be 10 MB or smaller.',
  })
})
