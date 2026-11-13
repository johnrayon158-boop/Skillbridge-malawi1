import { extractGeminiResponse, parseGeminiJson } from './responseSchemas.js'

export async function requestGeminiJson({ prompt, send, validate }) {
  let currentPrompt = prompt
  let failureReason = 'empty_response'
  let lastMetadata = { model: null, responseId: null, httpStatus: null }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response
    try {
      response = await send(currentPrompt)
    } catch (error) {
      return {
        value: null,
        status: 'unavailable',
        reason: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error',
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
    }

    if (!response.ok) {
      return {
        value: null,
        status: 'unavailable',
        reason: 'provider_error',
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
