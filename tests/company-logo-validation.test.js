import test from 'node:test'
import assert from 'node:assert/strict'

import { validateCompanyLogoFile } from '../src/utils/companyLogoValidation.js'

test('company logo upload accepts PNG, JPEG, and WebP images', () => {
  for (const [type, extension] of [
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ]) {
    assert.deepEqual(validateCompanyLogoFile({ type, size: 1024 }), { valid: true, extension })
  }
})

test('company logo upload rejects missing, unsupported, and oversized files', () => {
  assert.deepEqual(validateCompanyLogoFile(null), {
    valid: false,
    message: 'Choose an image for your company logo.',
  })
  assert.deepEqual(validateCompanyLogoFile({ type: 'image/svg+xml', size: 1024 }), {
    valid: false,
    message: 'Company logos must be PNG, JPEG, or WebP images.',
  })
  assert.deepEqual(validateCompanyLogoFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), {
    valid: false,
    message: 'Company logos must be 5 MB or smaller.',
  })
})
