import test from 'node:test'
import assert from 'node:assert/strict'

import { buildInitials, validateProfilePictureFile } from '../src/utils/avatar.js'

test('buildInitials returns the expected initials for a full name', () => {
  assert.equal(buildInitials('Amina Banda'), 'AB')
  assert.equal(buildInitials('J'), 'J')
})

test('validateProfilePictureFile rejects unsupported or oversized images', () => {
  assert.deepEqual(validateProfilePictureFile({ type: 'image/png', size: 250000 }), { valid: true })
  assert.deepEqual(validateProfilePictureFile({ type: 'application/pdf', size: 250000 }), {
    valid: false,
    message: 'Please upload a JPG, PNG, or WEBP image.'
  })
  assert.deepEqual(validateProfilePictureFile({ type: 'image/jpeg', size: 4 * 1024 * 1024 }), {
    valid: false,
    message: 'The image is too large. Please choose a smaller image.'
  })
})
