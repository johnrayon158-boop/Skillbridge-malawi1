export const SKILL_CATEGORIES = Object.freeze([
  'Information Technology and Software Development',
  'Graphic Design and Creative Arts',
  'Business and Management',
  'Accounting and Finance',
  'Health and Medical Sciences',
  'Agriculture and Environmental Sciences',
  'Education and Teaching',
  'Engineering and Technical Trades',
  'Communication and Media',
  'Hospitality and Tourism',
  'General and Transferable Skills',
])

const PRESERVED_ACRONYMS = new Set([
  'AC', 'API', 'CAD', 'CPR', 'CSS', 'DC', 'GIS', 'GPS', 'HIV', 'HR', 'HTML',
  'ICT', 'IT', 'PLC', 'PV', 'SEO', 'SQL', 'UI', 'UX',
])

const INVALID_SKILL_NAME_PATTERNS = [
  /^(?:and|or|but)\b/i,
  /^(?:skills?|competencies|learning outcomes|contents|table of contents|appendix|references|introduction)$/i,
  /^(?:page|examples?)(?:\s+\d+|\.\.\.)?$/i,
  /^examples?/i,
  /\b(?:claude\s+skills?\s+catalog|benepass|built[- ]?in[- ]?browser|mcp[- ]?builder|skill[- ]?testing|public[_ -]?read)\b/i,
  /installed\s*editable|shared documents|fill\s+pdf\s+forms/i,
  /https?:\/\/|@/i,
]

export function normalizeSkillDisplayName(value) {
  let name = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s()[\]{}"'`“”‘’,.;:!?|]+|[\s()[\]{}"'`“”‘’,.;:!?|]+$/g, '')
    .trim()

  if (!name) return ''
  if (name === name.toLocaleLowerCase()) {
    name = name.replace(/(^|\s)(\S)/g, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase()}`)
  } else if (name === name.toLocaleUpperCase()) {
    name = name.split(/(\s+)/).map((token) => {
      if (/^\s+$/.test(token) || PRESERVED_ACRONYMS.has(token)) return token
      return token.charAt(0).toLocaleUpperCase() + token.slice(1).toLocaleLowerCase()
    }).join('')
  }
  return name
}

export function validateSkillCandidate(candidate, { requireDescription = true } = {}) {
  const name = normalizeSkillDisplayName(candidate?.name)
  const category = String(candidate?.category || '').trim()
  const description = String(candidate?.description || '').trim().replace(/\s+/g, ' ')
  const errors = []
  const nameTokens = name.match(/[\p{L}\p{N}]+/gu) || []

  if (name.length < 3 || name.length > 80) errors.push('Skill names must contain between 3 and 80 characters.')
  if (nameTokens.length > 8) errors.push('Skill names must contain no more than 8 words.')
  if (!nameTokens.length || INVALID_SKILL_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    errors.push('Enter a professional skill name, not a document heading, fragment, or system term.')
  }
  if (!SKILL_CATEGORIES.includes(category)) errors.push('Choose a category from the curated skills taxonomy.')

  if (requireDescription) {
    const descriptionTokens = description.match(/[\p{L}\p{N}]+/gu) || []
    const isGenericDescription = /^the knowledge and practical ability to apply .+ effectively in .+ tasks and situations\.?$/i.test(description)
    if (description.length < 25 || description.length > 500 || descriptionTokens.length < 4 || isGenericDescription) {
      errors.push('Add a meaningful description of 25–500 characters that explains what the skill involves.')
    }
  }

  return { valid: errors.length === 0, errors, name, category, description }
}

export function isSelectableSkill(skill) {
  return Boolean(
    skill
    && skill.status === 'active'
    && skill.approval_status === 'approved'
    && skill.is_internal !== true,
  )
}

export function filterSelectableSkills(skills = []) {
  return skills.filter(isSelectableSkill)
}

export function filterSelectableSkillRows(rows = []) {
  return rows.filter((row) => isSelectableSkill(row?.skills || row?.skill || row))
}

export function filterSkillCatalog(skills = [], { query = '', category = '' } = {}) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase()

  return filterSelectableSkills(skills).filter((skill) => {
    if (category && skill.category !== category) return false
    if (!normalizedQuery) return true

    const searchable = [
      skill.name,
      skill.category,
      skill.subcategory,
      ...(Array.isArray(skill.aliases) ? skill.aliases : []),
    ].filter(Boolean).join(' ').toLocaleLowerCase()

    return searchable.includes(normalizedQuery)
  })
}

export function filterAssessmentsBySkillVisibility(assessments = []) {
  return assessments.filter((assessment) =>
    !assessment?.skill_id || isSelectableSkill(assessment.skills),
  )
}

export function filterAssessmentResultSkillRows(rows = []) {
  return rows.filter((row) => {
    const assessment = Array.isArray(row?.assessments) ? row.assessments[0] : row?.assessments
    return !assessment?.skill_id || isSelectableSkill(assessment.skills)
  })
}

export function filterRecommendationSkillNames(recommendation, visibleSkills = []) {
  const allowedNames = new Set()
  for (const row of visibleSkills) {
    const skill = row?.skills || row?.skill || row
    if (!isSelectableSkill(skill)) continue
    for (const name of [skill.name, ...(Array.isArray(skill.aliases) ? skill.aliases : [])]) {
      const normalized = normalizeSkillCatalogName(name)
      if (normalized) allowedNames.add(normalized)
    }
  }

  let hiddenSkillName = false
  const result = { ...recommendation }
  for (const field of ['strong_skills', 'developing_skills', 'missing_skills']) {
    if (!Array.isArray(recommendation?.[field])) continue
    result[field] = recommendation[field].filter((name) => {
      const visible = typeof name === 'string' && allowedNames.has(normalizeSkillCatalogName(name))
      if (!visible) hiddenSkillName = true
      return visible
    })
  }
  if (hiddenSkillName && typeof recommendation?.reason === 'string') {
    result.reason = 'Some skill details are hidden until they are approved in the catalog.'
  }
  return result
}

export function normalizeSkillCatalogName(name) {
  return String(name || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
