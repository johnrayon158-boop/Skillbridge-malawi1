import { requestGeminiJson } from './geminiJson.js'

const GEMINI_MODEL = 'gemini-3.8-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

export function getGeminiStatus() {
  return {
    enabled: Boolean(geminiApiKey),
    message: geminiApiKey
      ? 'Gemini is configured.'
      : 'AI recommendations are temporarily unavailable because the Gemini API key is not configured.',
  }
}

export async function generateGeminiExplanation(prompt, context = {}) {
  const apiKey = geminiApiKey
  if (!apiKey) {
    return {
      enabled: false,
      status: 'fallback',
      message: 'Gemini is not configured; using structured recommendation logic instead.',
      response: {
        explanation: `This recommendation was generated from your current profile, evidence, and role requirements. ${context.summary || ''}`.trim(),
      },
    }
  }

  const generated = await requestGeminiJson({
    prompt: `${prompt}\n\nReturn JSON with one non-empty string field named "explanation".`,
    validate: (value) => typeof value?.explanation === 'string' && value.explanation.trim()
      ? { explanation: value.explanation.trim().slice(0, 4000) }
      : null,
    send: (input) => fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: input }],
        }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(20000),
    }),
  })

  if (generated.value) {
    return {
      enabled: true,
      status: 'ok',
      response: generated.value,
    }
  }

  console.warn('[ai] Gemini explanation was not usable.', {
    model: generated.model || GEMINI_MODEL,
    responseId: generated.responseId,
    httpStatus: generated.httpStatus,
    reason: generated.reason,
    providerErrorCode: generated.providerErrorCode,
  })
  return {
    enabled: true,
    status: 'fallback',
    message: 'AI explanation is not available right now; using the structured recommendation instead.',
    response: {
      explanation: `This recommendation was generated from your current profile, evidence, and role requirements. ${context.summary || ''}`.trim(),
    },
  }
}
