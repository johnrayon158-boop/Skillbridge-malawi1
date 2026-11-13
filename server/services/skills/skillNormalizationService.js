const COMMON_ALIASES = new Map([
  ['js', 'javascript'],
  ['javascript', 'javascript'],
  ['java script', 'javascript'],
  ['java-script', 'javascript'],
  ['microsoft excel', 'microsoft excel'],
  ['ms excel', 'microsoft excel'],
  ['excel', 'microsoft excel'],
  ['customer service', 'customer service'],
  ['customer care', 'customer service'],
  ['customer support', 'customer service'],
  ['database management', 'database management'],
  ['database administration', 'database management'],
  ['db management', 'database management'],
  ['sql', 'sql'],
  ['postgresql', 'postgresql'],
  ['mysql', 'mysql'],
  ['rest api', 'rest api'],
  ['rest apis', 'rest api'],
])

export function normalizeSkillValue(value = '') {
  const safeValue = String(value ?? '').trim()
  if (!safeValue) return ''

  const withoutPunctuation = safeValue
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return withoutPunctuation.toLowerCase()
}

export function canonicalizeSkillName(skillName = '') {
  const normalized = normalizeSkillValue(skillName)
  if (!normalized) return ''

  const mapped = COMMON_ALIASES.get(normalized) || normalized
  if (mapped === 'javascript' && normalized === 'js') return 'javascript'
  if (mapped === 'microsoft excel' && normalized === 'excel') return 'microsoft excel'
  if (mapped === 'customer service' && normalized === 'customer care') return 'customer service'
  return mapped
}

export function buildSkillNameIndex(skills = []) {
  const index = new Map()
  for (const skill of skills) {
    const name = String(skill?.name || skill?.title || '').trim()
    if (!name) continue

    const normalized = canonicalizeSkillName(name)
    index.set(normalized, { ...skill, normalizedName: normalized, canonicalName: normalized })
    if (skill?.normalized_name) {
      index.set(String(skill.normalized_name).trim().toLowerCase(), { ...skill, normalizedName: skill.normalized_name, canonicalName: canonicalizeSkillName(skill.normalized_name) })
    }
  }
  return index
}

export function resolveCanonicalSkill(rawSkillName = '', skills = [], aliases = []) {
  const name = String(rawSkillName ?? '').trim()
  if (!name) {
    return { canonicalSkill: '', skillId: null, matchType: 'empty', confidence: 0 }
  }

  const normalized = canonicalizeSkillName(name)
  const exactCandidate = skills.find((skill) => {
    const candidateName = String(skill?.name || skill?.title || '').trim()
    return normalizeSkillValue(candidateName) === normalizeSkillValue(name)
  })

  if (exactCandidate) {
    return {
      canonicalSkill: exactCandidate.name || exactCandidate.title || name,
      skillId: exactCandidate.id || null,
      matchType: 'exact',
      confidence: 1,
    }
  }

  const aliasCandidate = aliases.find((alias) => {
    const aliasValue = canonicalizeSkillName(alias?.alias || alias?.name || '')
    const aliasSkillName = String(alias?.skill_name || alias?.skill?.name || '').trim()
    return aliasValue === normalized && normalizeSkillValue(aliasSkillName) !== normalizeSkillValue(name)
  })

  if (aliasCandidate) {
    return {
      canonicalSkill: aliasCandidate.skill_name || aliasCandidate.skill?.name || aliasCandidate.name || name,
      skillId: aliasCandidate.skill_id || aliasCandidate.skill?.id || null,
      matchType: 'alias',
      confidence: Number(aliasCandidate.confidence || 0.8),
    }
  }

  const normalizedSkillCandidate = skills.find((skill) => {
    const candidate = canonicalizeSkillName(skill?.name || skill?.title || '')
    return candidate === normalized
  })

  if (normalizedSkillCandidate) {
    return {
      canonicalSkill: normalizedSkillCandidate.name || normalizedSkillCandidate.title || name,
      skillId: normalizedSkillCandidate.id || null,
      matchType: 'exact',
      confidence: 0.92,
    }
  }

  return {
    canonicalSkill: name,
    skillId: null,
    matchType: 'new',
    confidence: 0.05,
  }
}

export function checkDuplicateSkillName(rawSkillName = '', skills = [], aliases = []) {
  const normalized = canonicalizeSkillName(rawSkillName)
  const matches = []

  for (const skill of skills) {
    const candidate = canonicalizeSkillName(skill?.name || skill?.title || '')
    if (!candidate || candidate === normalized) {
      matches.push({ type: 'exact', skill })
    }
  }

  for (const alias of aliases) {
    const aliasName = canonicalizeSkillName(alias?.alias || alias?.name || '')
    if (aliasName && aliasName === normalized) {
      matches.push({ type: 'alias', skill: alias })
    }
  }

  return {
    input: rawSkillName,
    normalizedName: normalized,
    isPossibleDuplicate: matches.length > 0,
    matches,
  }
}
