const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

export const API_CONFIGURATION_ERROR =
  'Set VITE_API_BASE_URL to the public HTTPS URL of the deployed API and redeploy the frontend.'

export function resolveApiBaseUrl({
  apiBaseUrl,
  aiApiUrl,
  isDevelopment = false,
  location = null,
  developmentFallback = 'origin',
} = {}) {
  if (isDevelopment && developmentFallback === 'origin') return location?.origin || ''

  const configuredUrl = [apiBaseUrl, aiApiUrl]
    .find((value) => typeof value === 'string' && value.trim())

  if (configuredUrl) {
    const normalizedUrl = configuredUrl.trim()
    let parsedUrl
    try {
      parsedUrl = new URL(normalizedUrl, location?.origin || 'https://api-base.invalid')
    } catch {
      return ''
    }

    if (!isDevelopment && (
      parsedUrl.protocol !== 'https:'
      || LOOPBACK_HOSTNAMES.has(parsedUrl.hostname.toLowerCase())
    )) {
      return ''
    }

    return normalizedUrl.replace(/\/+$/, '')
  }

  if (!isDevelopment) return location?.origin || ''
  if (!location?.protocol || !location?.hostname) return ''
  return `${location.protocol}//${location.hostname}:4000`
}
