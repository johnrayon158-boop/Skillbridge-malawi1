import { extractGeminiResponse, parseGeminiJson } from './responseSchemas.js'

function getProviderErrorCode(payload) {
  const value = payload?.error?.status ?? payload?.error?.code
  const code = typeof value === 'string' ? value : ''
  return /^[A-Za-z0-9_.-]{1,60}$/.test(code) ? code : null
}

export function classifyGeminiProviderError(status, providerCode = '') {
  const code = providerCode.toLowerCase()
  if (status === 401 || /authentication|unauthenticated/.test(code)) return 'provider_authentication'
  if (status === 403 || /permission_denied|permissiondenied/.test(code)) return 'provider_permission'
  if (status === 402 || /quota|resource_exhausted/.test(code)) return 'provider_quota'
  if (status === 429 || /rate_limit|too_many_requests/.test(code)) return 'provider_rate_limit'
  if (status === 404 || /model_not_found|not_found/.test(code)) return 'model_not_found'
  if ([408, 504].includes(status) || /deadline_exceeded|timeout/.test(code)) return 'timeout'
  if (status >= 500 || /service_unavailable|unavailable/.test(code)) return 'provider_unavailable'
  return 'provider_error'
}

export async function requestGeminiJson({ prompt, send, validate }) {
  let currentPrompt = prompt
  let failureReason = 'empty_response'
  let lastMetadata = { model: null, responseId: null, httpStatus: null, providerErrorCode: null }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response
    try {
      response = await send(currentPrompt)
    } catch (error) {
      const errorDetails = `${error?.name || ''} ${error?.code || ''}`
      return {
        value: null,
        status: 'unavailable',
        reason: /timeout|abort|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(errorDetails) ? 'timeout' : 'network_error',
        ...lastMetadata,
      }
    }

    let payload = null
    try {
      payload = await response.json()
    } catch {
      failureReason = 'invalid_provider_json'
    }

    const extracted = extractGeminiResponse(payload)
    lastMetadata = {
      model: extracted.model,
      responseId: extracted.responseId || response.headers?.get?.('x-goog-request-id') || null,
      httpStatus: response.status,
      providerErrorCode: getProviderErrorCode(payload),
    }

    if (!response.ok) {
      return {
        value: null,
        status: 'unavailable',
        reason: classifyGeminiProviderError(response.status, lastMetadata.providerErrorCode || ''),
        ...lastMetadata,
      }
    }

    if (payload) {
      const parsed = parseGeminiJson(extracted.text)
      const normalized = parsed ? validate(parsed) : null
      if (normalized) {
        return {
          value: normalized,
          status: 'ok',
          reason: null,
          sources: extracted.sources,
          ...lastMetadata,
        }
      }
      failureReason = parsed ? 'invalid_schema' : (extracted.text ? 'invalid_json' : 'empty_response')
    }

    if (attempt === 0) {
      currentPrompt = `${prompt}\n\nCorrection: Your previous output was missing or did not match the required response schema. Return one complete valid JSON object that exactly follows the schema in the original instructions. Do not include markdown, comments, or any text outside the JSON object.`
    }
  }

  return {
    value: null,
    status: 'invalid',
    reason: failureReason,
    ...lastMetadata,
  }
}
