export function normalizeCareerInterests(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : []
  const normalized = []
  const seen = new Set()

  for (const entry of entries) {
    if (typeof entry !== 'string') throw new Error('Career interests must be text values.')
    const interest = entry.trim()
    if (!interest) continue
    if (interest.length > 80) throw new Error('Each career interest must be 80 characters or fewer.')
    const key = interest.toLocaleLowerCase()
    if (!seen.has(key)) {
      normalized.push(interest)
      seen.add(key)
    }
  }

  if (normalized.length > 20) throw new Error('Add no more than 20 career interests.')
  return normalized
}

export function normalizeTargetRole(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error('Target occupation must be text.')
  const targetRole = value.trim()
  if (targetRole.length > 120) throw new Error('Target occupation must be 120 characters or fewer.')
  return targetRole || null
}

export function buildStudentProfileChanges(changes = {}) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('Profile updates must be an object.')
  }
  return {
    ...changes,
    ...(Object.hasOwn(changes, 'target_role')
      ? { target_role: normalizeTargetRole(changes.target_role) }
      : {}),
    ...(Object.hasOwn(changes, 'interests')
      ? { interests: normalizeCareerInterests(changes.interests) }
      : {}),
  }
}
