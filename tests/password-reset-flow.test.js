import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResetPasswordRedirectUrl, parseRecoveryRedirect } from '../src/utils/authRedirect.js'

test('detects a Supabase recovery link before the auth client clears the URL hash', () => {
  const result = parseRecoveryRedirect(
    '#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery',
    '',
  )

  assert.equal(result.isRecovery, true)
  assert.equal(result.errorCode, '')
})

test('detects recovery tokens in query parameters', () => {
  const result = parseRecoveryRedirect(
    '',
    '?access_token=abc&type=recovery',
  )

  assert.equal(result.isRecovery, true)
})

test('detects a PKCE callback code on the reset-password route only', () => {
  assert.equal(parseRecoveryRedirect('', '?code=abc', '/reset-password').isRecovery, true)
  assert.equal(parseRecoveryRedirect('', '?code=abc', '/').isRecovery, false)
  assert.equal(parseRecoveryRedirect('', '?code=abc', '/Skillbridge-malawi1/reset-password').isRecovery, true)
})

test('ignores ordinary navigation, signup links, and missing access tokens', () => {
  assert.equal(parseRecoveryRedirect('', '').isRecovery, false)
  assert.equal(parseRecoveryRedirect('#section-two', '').isRecovery, false)
  assert.equal(parseRecoveryRedirect('#access_token=abc&type=signup', '').isRecovery, false)
  assert.equal(parseRecoveryRedirect('#type=recovery', '').isRecovery, false)
})

test('reports expired reset links instead of treating them as recovery sessions', () => {
  const result = parseRecoveryRedirect(
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    '',
  )

  assert.equal(result.isRecovery, false)
  assert.equal(result.errorCode, 'otp_expired')
})

test('builds the reset redirect on the live origin when no site URL is configured', () => {
  assert.equal(
    buildResetPasswordRedirectUrl({
      origin: 'https://skillbridge-malawi1-johnrayon158-7510s-projects.vercel.app',
      baseUrl: '/',
      configuredSiteUrl: '',
    }),
    'https://skillbridge-malawi1-johnrayon158-7510s-projects.vercel.app/reset-password',
  )
})

test('keeps a configured sub-path when it belongs to the live origin', () => {
  assert.equal(
    buildResetPasswordRedirectUrl({
      origin: 'https://johnrayon158-boop.github.io',
      baseUrl: '/Skillbridge-malawi1/',
      configuredSiteUrl: 'https://johnrayon158-boop.github.io/Skillbridge-malawi1',
    }),
    'https://johnrayon158-boop.github.io/Skillbridge-malawi1/reset-password',
  )
})

test('ignores a stale configured site URL from another origin', () => {
  assert.equal(
    buildResetPasswordRedirectUrl({
      origin: 'https://skillbridge-malawi1-johnrayon158-7510s-projects.vercel.app',
      baseUrl: '/',
      configuredSiteUrl: 'http://localhost:5179',
    }),
    'https://skillbridge-malawi1-johnrayon158-7510s-projects.vercel.app/reset-password',
  )
})

test('ignores malformed configured site URLs', () => {
  assert.equal(
    buildResetPasswordRedirectUrl({
      origin: 'https://skillbridge.example.com',
      baseUrl: '/',
      configuredSiteUrl: 'not a url',
    }),
    'https://skillbridge.example.com/reset-password',
  )
})
