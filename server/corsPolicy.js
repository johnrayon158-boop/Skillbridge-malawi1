export const CORS_ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'DELETE', 'OPTIONS'])
export const CORS_ALLOWED_HEADERS = Object.freeze(['Authorization', 'Content-Type'])

const DEFAULT_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5179',
  'http://127.0.0.1:5179',
])

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.origin === 'null'
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) return null
    return url.origin
  } catch {
    return null
  }
}

function parseConfiguredOrigins(value) {
  if (value == null || value.trim() === '') return []
  return value.split(',').map((entry) => {
    const origin = normalizeOrigin(entry)
    if (!origin) throw new Error(`Invalid CORS origin configuration: "${entry.trim()}".`)
    return origin
  })
}

export function createCorsPolicy({
  allowedOrigins = '',
  developmentOrigins = '',
  environment = process.env.NODE_ENV,
} = {}) {
  const origins = new Set(parseConfiguredOrigins(allowedOrigins))
  if (environment === 'development') {
    for (const origin of [...DEFAULT_DEVELOPMENT_ORIGINS, ...parseConfiguredOrigins(developmentOrigins)]) {
      origins.add(origin)
    }
  }

  const allowedOriginList = Object.freeze([...origins])
  return Object.freeze({
    allowedOrigins: allowedOriginList,
    allowsOrigin(origin) {
      const normalized = normalizeOrigin(origin)
      return normalized !== null && origins.has(normalized)
    },
    publicConfiguration() {
      return {
        allowedOrigins: allowedOriginList,
        allowedMethods: CORS_ALLOWED_METHODS,
        allowedHeaders: CORS_ALLOWED_HEADERS,
        credentials: false,
      }
    },
  })
}

export function applyCorsPolicy(req, res, policy) {
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (!origin) return { allowed: true }

  if (!policy.allowsOrigin(origin)) {
    return { allowed: false, statusCode: 403, message: 'Origin is not allowed.' }
  }

  const normalizedOrigin = normalizeOrigin(origin)
  res.setHeader('Access-Control-Allow-Origin', normalizedOrigin)
  res.setHeader('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS.join(', '))
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '))

  if (req.method !== 'OPTIONS') return { allowed: true }

  res.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
  const requestedMethod = req.headers['access-control-request-method']
  if (requestedMethod && !CORS_ALLOWED_METHODS.includes(requestedMethod.toUpperCase())) {
    return { allowed: false, statusCode: 403, message: 'Requested method is not allowed.' }
  }

  const requestedHeaders = String(req.headers['access-control-request-headers'] || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  const allowedHeaders = new Set(CORS_ALLOWED_HEADERS.map((header) => header.toLowerCase()))
  if (requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    return { allowed: false, statusCode: 403, message: 'Requested headers are not allowed.' }
  }

  return { allowed: true }
}
