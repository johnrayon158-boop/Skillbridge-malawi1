const SERVICE_LABELS = {
  api: 'Backend API',
  database: 'Supabase database',
  authentication: 'Supabase authentication',
  storage: 'Supabase storage',
  email: 'Email delivery (password reset)',
  gemini: 'Google Gemini',
  rate_limit: 'API rate limiting',
}

const INCIDENT_SOURCES = new Set([
  'service_check',
  'api_error',
  'rate_limit',
  'authentication',
  'client_auth_failure',
])
const INCIDENT_SERVICES = new Set(Object.keys(SERVICE_LABELS))
const ROUTE_CATEGORIES = new Set(['api', 'ai', 'admin', 'search', 'health'])
const INCIDENT_MESSAGES = {
  service_check: (service) => `${SERVICE_LABELS[service]} health check did not pass.`,
  api_error: () => 'An API request returned a server error.',
  rate_limit: () => 'An API request exceeded its rate limit.',
  authentication: () => 'An API authentication token was rejected.',
  client_auth_failure: () => 'A sign-in failure was reported by the browser.',
}

const errorCode = (error) => {
  const code = error?.code || error?.name
  return typeof code === 'string' && /^[A-Z0-9_-]{2,40}$/i.test(code)
    ? code
    : 'check_failed'
}

function makeCheck({ key, status, message, checkedAt, responseTimeMs, lastSuccessfulAt = null, errorCode: code = null }) {
  return {
    key,
    label: SERVICE_LABELS[key],
    status,
    message,
    checkedAt,
    lastSuccessfulAt,
    responseTimeMs,
    errorCode: code,
  }
}

export function createSystemIncidentRecorder({
  supabase,
  now = Date.now,
  cooldownMs = 60_000,
  logger = console,
} = {}) {
  const lastRecordedAt = new Map()

  return async (incident) => {
    if (!supabase || !INCIDENT_SOURCES.has(incident?.source) || !INCIDENT_SERVICES.has(incident?.service)) return false
    const routeCategory = ROUTE_CATEGORIES.has(incident.routeCategory) ? incident.routeCategory : null
    const httpStatus = Number.isInteger(incident.httpStatus) && incident.httpStatus >= 100 && incident.httpStatus <= 599
      ? incident.httpStatus
      : null
    const key = [incident.source, incident.service, routeCategory || '', httpStatus || ''].join(':')
    const timestamp = now()
    if (timestamp - (lastRecordedAt.get(key) ?? Number.NEGATIVE_INFINITY) < cooldownMs) return false
    lastRecordedAt.set(key, timestamp)

    try {
      const { error } = await supabase.from('system_health_incidents').insert({
        source: incident.source,
        service: incident.service,
        severity: incident.severity === 'warning' ? 'warning' : 'error',
        message: INCIDENT_MESSAGES[incident.source](incident.service),
        route_category: routeCategory,
        http_status: httpStatus,
        occurred_at: new Date(timestamp).toISOString(),
      })
      if (error) {
        logger.warn('[system-health] incident could not be persisted.', { errorCode: errorCode(error) })
        return false
      }
      return true
    } catch (error) {
      logger.warn('[system-health] incident could not be persisted.', { errorCode: errorCode(error) })
      return false
    }
  }
}

export function createSystemHealthService({
  supabase,
  geminiApiKey,
  geminiModel = 'gemini-2.0-flash',
  rateLimiter,
  emailDeliveryStatus = { configured: false },
  recordIncident = async () => false,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = 5000,
} = {}) {
  const lastSuccessfulAt = new Map()

  async function check(key, run) {
    const startedAt = now()
    const checkedAt = new Date(startedAt).toISOString()
    try {
      const message = await run()
      lastSuccessfulAt.set(key, checkedAt)
      return makeCheck({
        key,
        status: 'operational',
        message,
        checkedAt,
        lastSuccessfulAt: checkedAt,
        responseTimeMs: Math.max(0, now() - startedAt),
      })
    } catch (error) {
      const code = errorCode(error)
      return makeCheck({
        key,
        status: 'unavailable',
        message: `${SERVICE_LABELS[key]} could not be confirmed. Check server logs for the diagnostic code.`,
        checkedAt,
        lastSuccessfulAt: lastSuccessfulAt.get(key) || null,
        responseTimeMs: Math.max(0, now() - startedAt),
        errorCode: code,
      })
    }
  }

  async function checkEmail() {
    const checkedAt = new Date(now()).toISOString()
    const configured = emailDeliveryStatus?.configured === true
    return makeCheck({
      key: 'email',
      status: 'not_verified',
      message: configured
        ? 'An email provider is configured, but delivery is not probed because that would send a test message.'
        : 'Application notification email is not configured. Password reset delivery is managed by Supabase Auth and is not actively tested.',
      checkedAt,
      responseTimeMs: 0,
    })
  }

  async function checkRateLimit() {
    const checkedAt = new Date(now()).toISOString()
    const status = await rateLimiter?.checkStorage?.() || rateLimiter?.getPublicStatus?.()
    const configured = status?.configured === true
    const operational = configured && status?.operational === true
    const key = 'rate_limit'
    if (operational) lastSuccessfulAt.set(key, checkedAt)
    return makeCheck({
      key,
      status: operational ? 'operational' : 'unavailable',
      message: !configured
        ? 'Rate-limit storage is not configured.'
        : operational
          ? `Rate limiting is active using ${status.storage}; ${status.distributed ? 'requests share limits across instances.' : 'limits are per instance.'}`
          : 'Rate-limit storage could not be confirmed.',
      checkedAt,
      lastSuccessfulAt: lastSuccessfulAt.get(key) || null,
      responseTimeMs: null,
      errorCode: status?.lastErrorCode || null,
    })
  }

  async function collectIncidents() {
    if (!supabase) {
      return { available: false, message: 'Incident history is unavailable because database access is not configured.', counts: null, recent: [] }
    }

    const since = new Date(now() - 24 * 60 * 60 * 1000).toISOString()
    const sourceCounts = ['api_error', 'rate_limit', 'authentication', 'client_auth_failure', 'service_check']
    const [incidentResult, ...countResults] = await Promise.all([
      supabase
        .from('system_health_incidents')
        .select('id, source, service, severity, message, route_category, http_status, occurred_at')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(50),
      ...sourceCounts.map((source) => supabase
        .from('system_health_incidents')
        .select('id', { count: 'exact', head: true })
        .eq('source', source)
        .gte('occurred_at', since)),
    ])
    const errors = [incidentResult.error, ...countResults.map((result) => result.error)].filter(Boolean)
    if (errors.length) {
      return {
        available: false,
        message: 'Incident history could not be loaded. Apply the system health migration and check database connectivity.',
        counts: null,
        recent: [],
        errorCode: errorCode(errors[0]),
      }
    }

    const incidents = Array.isArray(incidentResult.data) ? incidentResult.data : []
    const countBySource = Object.fromEntries(sourceCounts.map((source, index) => [source, countResults[index].count ?? 0]))
    return {
      available: true,
      message: incidents.length ? 'Showing up to 50 incidents from the last 24 hours.' : 'No incidents were recorded in the last 24 hours.',
      counts: {
        apiErrors: countBySource.api_error,
        rateLimitEvents: countBySource.rate_limit,
        failedAuthentication: countBySource.authentication,
        reportedSignInFailures: countBySource.client_auth_failure,
        serviceFailures: countBySource.service_check,
      },
      recent: incidents,
    }
  }

  return {
    async runChecks() {
      const checks = await Promise.all([
        check('api', async () => 'The admin health endpoint responded successfully.'),
        check('database', async () => {
          if (!supabase) throw Object.assign(new Error('Supabase is not configured.'), { code: 'not_configured' })
          const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1)
          if (error) throw error
          return 'A server-side database query completed successfully.'
        }),
        check('authentication', async () => {
          if (!supabase) throw Object.assign(new Error('Supabase is not configured.'), { code: 'not_configured' })
          const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
          if (error) throw error
          if (!Array.isArray(data?.users)) {
            throw Object.assign(new Error('Supabase Auth returned an invalid health response.'), { code: 'invalid_response' })
          }
          return 'Supabase Auth accepted a server-side health request.'
        }),
        check('storage', async () => {
          if (!supabase) throw Object.assign(new Error('Supabase is not configured.'), { code: 'not_configured' })
          const { data, error } = await supabase.storage.listBuckets()
          if (error) throw error
          if (!Array.isArray(data)) {
            throw Object.assign(new Error('Supabase Storage returned an invalid health response.'), { code: 'invalid_response' })
          }
          return 'Supabase Storage accepted a server-side health request.'
        }),
        check('gemini', async () => {
          if (!geminiApiKey) throw Object.assign(new Error('Gemini is not configured.'), { code: 'not_configured' })
          const response = await fetchImpl(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}`,
            {
              headers: { 'x-goog-api-key': geminiApiKey, Accept: 'application/json' },
              signal: AbortSignal.timeout(timeoutMs),
            },
          )
          if (!response.ok) throw Object.assign(new Error('Gemini health request failed.'), { code: `http_${response.status}` })
          const model = await response.json()
          if (!model.supportedGenerationMethods?.includes('generateContent')) {
            throw Object.assign(new Error('Configured Gemini model is unavailable.'), { code: 'model_unavailable' })
          }
          return 'The configured Gemini model is reachable and supports content generation.'
        }),
        checkEmail(),
        checkRateLimit(),
      ])

      for (const result of checks) {
        if (result.status === 'unavailable') {
          await recordIncident({ source: 'service_check', service: result.key, severity: 'error' })
        }
      }

      const incidents = await collectIncidents()
      const allOperational = checks.every((item) => item.status === 'operational')
      return {
        status: allOperational ? 'operational' : 'degraded',
        checkedAt: new Date(now()).toISOString(),
        checks,
        incidents,
      }
    },
  }
}
