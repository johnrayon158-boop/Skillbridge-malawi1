import assert from 'node:assert/strict'
import test from 'node:test'
import { getFriendlyAuthError } from '../src/utils/authError.js'

test('asks users to confirm their email when Supabase rejects an unconfirmed account', () => {
  const message = getFriendlyAuthError(Object.assign(new Error('Email not confirmed'), {
    code: 'email_not_confirmed',
  }))

  assert.match(message, /confirm your email/i)
  assert.match(message, /inbox/i)
})

test('keeps invalid credentials separate from email confirmation errors', () => {
  assert.equal(
    getFriendlyAuthError(Object.assign(new Error('Invalid login credentials'), {
      code: 'invalid_credentials',
    })),
    'Email or password is incorrect.',
  )
})
