export const RESET_PASSWORD_PATH = '/reset-password'

export function parseRecoveryRedirect(hash = '', search = '') {
  const hashParams = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  const searchParams = new URLSearchParams(String(search || '').replace(/^\?/, ''))

  const errorCode = hashParams.get('error_code')
    || hashParams.get('error')
    || searchParams.get('error_code')
    || searchParams.get('error')
    || ''

  return {
    isRecovery: hashParams.get('type') === 'recovery' && Boolean(hashParams.get('access_token')),
    errorCode,
  }
}

export function buildResetPasswordRedirectUrl({ origin, baseUrl = '/', configuredSiteUrl = '' } = {}) {
  const currentOrigin = String(origin || '').replace(/\/+$/, '')

  if (!currentOrigin) {
    throw new Error('A site origin is required to build the password reset redirect URL.')
  }

  let basePath = `/${String(baseUrl || '/').replace(/^\/+/, '')}`.replace(/\/+$/, '')

  const configured = String(configuredSiteUrl || '').replace(/\/+$/, '')

  if (configured) {
    try {
      const configuredUrl = new URL(configured)

      // A stale build-time site URL (for example localhost baked into a
      // production bundle) would make Supabase reject the redirect and fall
      // back to the Site URL root, skipping the reset form entirely.
      if (configuredUrl.origin === currentOrigin) {
        const configuredPath = configuredUrl.pathname.replace(/\/+$/, '')
        if (configuredPath) basePath = configuredPath
        return `${configuredUrl.origin}${basePath}${RESET_PASSWORD_PATH}`
      }
    } catch {
      // Ignore malformed configured values and fall back to the live origin.
    }
  }

  return `${currentOrigin}${basePath}${RESET_PASSWORD_PATH}`
}
