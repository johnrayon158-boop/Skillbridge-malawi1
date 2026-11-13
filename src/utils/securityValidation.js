export function sanitizeText(value, maxLength = 1000) {
  if (value === null || value === undefined) return ''

  const stringValue = String(value)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 || code === 9 || code === 10 || code === 13
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  if (!stringValue) return ''
  return stringValue.slice(0, maxLength)
}

export function validateUuid(value) {
  if (typeof value !== 'string') return false
  const candidate = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
}

export function validateRequestBody(body, requiredFields = [], allowedValues = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object.' }
  }

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '') {
      return { ok: false, error: `Missing required field: ${field}` }
    }
  }

  const allowedMap = Array.isArray(allowedValues) && allowedValues.length > 0
    ? (requiredFields[0] ? { [requiredFields[0]]: allowedValues } : {})
    : (Array.isArray(allowedValues) ? {} : allowedValues)

  if (Object.keys(allowedMap).length > 0) {
    for (const [key, expected] of Object.entries(allowedMap)) {
      if (body[key] !== undefined && body[key] !== null && !expected.includes(body[key])) {
        return { ok: false, error: `Invalid value for ${key}.` }
      }
    }
  }

  return { ok: true }
}

export function limitTextLength(value, maxLength = 2000) {
  return sanitizeText(value, maxLength)
}

export function isSafeHtmlFree(value) {
  if (value === null || value === undefined) return true
  const candidate = String(value)
  return !/<[A-Za-z][\s\S]*>/i.test(candidate)
}
