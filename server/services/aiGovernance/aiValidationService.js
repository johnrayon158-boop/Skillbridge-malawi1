const normalizeId = (value) => {
  const text = typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim()
  return text
}

export function isKnownEntityRef(value, validIds = []) {
  const target = normalizeId(value)
  if (!target) return false
  return validIds.some((candidate) => normalizeId(candidate) === target)
}

export function validateAiInput(payload = {}) {
  const errors = []
  const profile = payload.profile || {}
  const profileId = normalizeId(profile.id)
  const role = normalizeId(profile.role)

  if (!profileId || !role) {
    errors.push('AI input validation failed: profile is missing a valid id and role.')
  }

  if (payload.skillIds !== undefined && payload.skillIds !== null) {
    const skillIds = Array.isArray(payload.skillIds) ? payload.skillIds : [payload.skillIds]
    if (!skillIds.length || skillIds.some((skillId) => !normalizeId(skillId))) {
      errors.push('AI input validation failed: skill IDs are missing or malformed.')
    }
  }

  if (payload.jobId !== undefined && payload.jobId !== null && !normalizeId(payload.jobId)) {
    errors.push('AI input validation failed: job identifier is missing or malformed.')
  }

  if (payload.careerId !== undefined && payload.careerId !== null && !normalizeId(payload.careerId)) {
    errors.push('AI input validation failed: career identifier is missing or malformed.')
  }

  if (Array.isArray(payload.assessments)) {
    payload.assessments.forEach((assessment, index) => {
      const score = Number(assessment?.score ?? assessment?.result_score ?? assessment?.percentage ?? NaN)
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        errors.push(`AI input validation failed: assessment ${index + 1} score is outside the valid range.`)
      }
    })
  }

  if (Array.isArray(payload.education)) {
    payload.education.forEach((entry, index) => {
      if (entry && entry.level !== undefined && !normalizeId(entry.level)) {
        errors.push(`AI input validation failed: education entry ${index + 1} is missing a valid level.`)
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

export function validateAiOutput(response = {}) {
  const errors = []
  const validCareerIds = Array.isArray(response.validCareerIds) ? response.validCareerIds : []
  const validResourceIds = Array.isArray(response.validResourceIds) ? response.validResourceIds : []
  const recommendations = Array.isArray(response.recommendations) ? response.recommendations : []

  recommendations.forEach((item, index) => {
    const careerId = normalizeId(item?.career_id)
    if (!careerId || !isKnownEntityRef(careerId, validCareerIds)) {
      errors.push(`AI output validation failed: recommendation ${index + 1} references an invalid career ID.`)
    }

    const scoreValue = item?.overall_score ?? item?.match_score
    if (scoreValue !== undefined && scoreValue !== null) {
      const score = Number(scoreValue)
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        errors.push(`AI output validation failed: recommendation ${index + 1} score is outside the valid 0-100 range.`)
      }
    }
  })

  const learningResources = Array.isArray(response.learningResources) ? response.learningResources : []
  learningResources.forEach((item, index) => {
    const resourceId = normalizeId(item?.id)
    if (!resourceId || !isKnownEntityRef(resourceId, validResourceIds)) {
      errors.push(`AI output validation failed: learning resource ${index + 1} references an invalid resource ID.`)
    }
  })

  if (response.recommendationId !== undefined && response.recommendationId !== null && !normalizeId(response.recommendationId)) {
    errors.push('AI output validation failed: recommendation ID is malformed.')
  }

  return { valid: errors.length === 0, errors, sanitized: response }
}
