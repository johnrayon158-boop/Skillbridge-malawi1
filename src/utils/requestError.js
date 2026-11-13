function getErrorDetails(error) {
  const source = error && typeof error === 'object' ? error : null
  const message = typeof error === 'string' ? error : String(source?.message || '')
  const rawStatus = source?.status ?? source?.statusCode
  return {
    code: String(source?.code || ''),
    name: String(source?.name || ''),
    message,
    status: rawStatus === undefined || rawStatus === null ? null : Number(rawStatus),
  }
}

export function classifyRequestError(error, { fallback = 'We could not load this information. Please try again.', kind } = {}) {
  const { code, name, message, status } = getErrorDetails(error)
  const details = `${code} ${name} ${message}`.toLowerCase()

  if ([401, 419].includes(status) || /pgrst301|jwt expired|session (has )?expired|authsessionmissing|not authenticated|unauthorized/.test(details)) {
    return {
      category: 'authentication',
      title: 'Your session needs attention',
      message: 'Your session may have expired. Sign in again, then retry.',
    }
  }

  if (status === 403 || code === '42501' || /permission denied|row-level security|insufficient privilege|forbidden|not authorized/.test(details)) {
    return {
      category: 'permission',
      title: 'You do not have access to this information',
      message: 'Check that you are using the right account. If you believe this is a mistake, contact support.',
    }
  }

  if (name === 'TypeError' || status === 0 || /pgrst00[0-9]|failed to fetch|network error|network unavailable|connection (refused|reset|failed|lost|timed? out|problem)|cannot reach|econn|timed? out|load failed|offline|fetcherror/.test(details)) {
    return {
      category: 'network',
      title: 'Connection problem',
      message: 'SkillBridge could not be reached. Check your internet connection and try again.',
    }
  }

  if (kind === 'ai' || /ai service|ai_unavailable|gemini|model unavailable|temporarily unavailable|unable to get an answer/.test(details)) {
    return {
      category: 'ai',
      title: 'AI service temporarily unavailable',
      message: 'Please try again shortly. Your saved information has not been changed.',
    }
  }

  return {
    category: 'service',
    title: 'Something went wrong',
    message: fallback,
  }
}

export function createDebugReference() {
  const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8)
    || Math.random().toString(36).slice(2, 10)
  return `SB-${Date.now().toString(36).toUpperCase()}-${randomPart.toUpperCase()}`
}

export function getSafeErrorMetadata(error, category, referenceId) {
  const { code, name, status } = getErrorDetails(error)
  return { referenceId, category, name: name || (typeof error === 'string' ? 'Error' : 'UnknownError'), code, status }
}
