const PROVIDERS = new Set([
  'google-gemini',
  'deterministic-scoring',
  'deterministic-fallback',
  'not_attempted',
])

const PROVIDER_STATUSES = new Set(['ok', 'invalid', 'unavailable', 'not_attempted', 'not_applicable'])
const VALIDATION_STATUSES = new Set(['passed', 'failed', 'not_attempted', 'not_applicable'])
const ERROR_CATEGORIES = new Set([
  'empty_response',
  'invalid_provider_json',
  'invalid_schema',
  'invalid_json',
  'timeout',
  'network_error',
  'provider_error',
  'provider_not_configured',
  'validation_error',
  'permission_error',
  'service_unavailable',
  'request_failed',
])

const safeIdentifier = (value) => (
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,180}$/.test(value) ? value : null
)

export function updateAiProviderMetadata(req, generated, requestedModel) {
  if (!req?.aiMonitoring) return
  const providerStatus = ['ok', 'invalid', 'unavailable'].includes(generated?.status)
    ? generated.status
    : 'not_attempted'

  req.aiMonitoring.modelProvider = 'google-gemini'
  req.aiMonitoring.modelIdentifier = safeIdentifier(generated?.model) || safeIdentifier(requestedModel)
  req.aiMonitoring.providerResponseId = safeIdentifier(generated?.responseId)
  req.aiMonitoring.providerStatus = providerStatus
  req.aiMonitoring.validationStatus = providerStatus === 'ok'
    ? 'passed'
    : providerStatus === 'invalid' ? 'failed' : 'not_attempted'
  req.aiMonitoring.errorCategory = ERROR_CATEGORIES.has(generated?.reason)
    ? generated.reason
    : null
}

export function setAiFallbackMetadata(req) {
  if (!req?.aiMonitoring) return
  req.aiMonitoring.modelProvider = 'deterministic-fallback'
  req.aiMonitoring.modelIdentifier = 'deterministic-fallback'
  req.aiMonitoring.providerStatus = 'not_attempted'
  req.aiMonitoring.validationStatus = 'not_applicable'
  req.aiMonitoring.errorCategory = 'provider_not_configured'
}

export function buildAiRequestEvent({ featureType, statusCode, durationMs, metadata = {} }) {
  const status = Number.isInteger(statusCode) ? statusCode : 500
  let requestOutcome = 'failure'
  if (status >= 200 && status < 300) {
    requestOutcome = metadata.requestOutcome === 'fallback' ? 'fallback' : 'success'
  } else if (status === 400 || status === 422) {
    requestOutcome = 'validation_error'
  } else if (status === 401 || status === 403) {
    requestOutcome = 'unauthorized'
  } else if (status === 503 || status >= 500) {
    requestOutcome = 'unavailable'
  }

  const providerStatus = PROVIDER_STATUSES.has(metadata.providerStatus)
    ? metadata.providerStatus
    : requestOutcome === 'success' ? 'ok' : 'not_attempted'
  const validationStatus = requestOutcome === 'validation_error'
    ? 'failed'
    : requestOutcome === 'success'
      ? metadata.validationStatus === 'failed' ? 'failed' : 'passed'
      : VALIDATION_STATUSES.has(metadata.validationStatus) && metadata.validationStatus !== 'passed'
        ? metadata.validationStatus
        : 'not_attempted'

  let errorCategory = ERROR_CATEGORIES.has(metadata.errorCategory) ? metadata.errorCategory : null
  if (!errorCategory && requestOutcome === 'validation_error') errorCategory = 'validation_error'
  if (!errorCategory && requestOutcome === 'unavailable') errorCategory = 'service_unavailable'
  if (!errorCategory && requestOutcome === 'failure') errorCategory = 'request_failed'
  if (!errorCategory && requestOutcome === 'unauthorized') errorCategory = 'permission_error'

  return {
    feature_type: safeIdentifier(featureType) || 'unknown',
    request_outcome: requestOutcome,
    model_provider: PROVIDERS.has(metadata.modelProvider) ? metadata.modelProvider : 'not_attempted',
    model_identifier: safeIdentifier(metadata.modelIdentifier),
    provider_status: providerStatus,
    validation_status: validationStatus,
    error_category: errorCategory,
    provider_response_id: safeIdentifier(metadata.providerResponseId),
    duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
    http_status: status,
  }
}

export async function persistAiRequestEvent(supabaseAdmin, event) {
  if (!supabaseAdmin) throw new Error('AI monitoring storage is not configured.')
  const { error } = await supabaseAdmin.from('ai_request_events').insert(event)
  if (error) throw error
}
