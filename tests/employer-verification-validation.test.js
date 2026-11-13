import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateEmployerVerificationDocument,
  validateEmployerVerificationFields,
} from '../src/utils/employerVerificationValidation.js'

const validFields = {
  legal_business_name: 'SkillBridge Malawi',
  registration_number: 'BR-2026-01',
  registration_authority: 'Registrar General',
  registration_country: 'Malawi',
  representative_name: 'Tadala Banda',
  representative_role: 'Director',
}

test('requires complete, bounded employer verification information', () => {
  assert.equal(validateEmployerVerificationFields(validFields).valid, true)
  assert.match(validateEmployerVerificationFields({ ...validFields, registration_number: ' ' }).message, /Registration or licence number/)
  assert.match(validateEmployerVerificationFields({ ...validFields, representative_role: 'x'.repeat(101) }).message, /100 characters/)
})

test('accepts supported document formats and enforces the upload size', () => {
  assert.deepEqual(validateEmployerVerificationDocument({ type: 'application/pdf', size: 1024 }), { valid: true, extension: 'pdf' })
  assert.equal(validateEmployerVerificationDocument({ type: 'text/plain', size: 10 }).valid, false)
  assert.equal(validateEmployerVerificationDocument({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }).valid, false)
  assert.equal(validateEmployerVerificationDocument({ type: 'image/jpeg', size: 0 }).valid, false)
})
