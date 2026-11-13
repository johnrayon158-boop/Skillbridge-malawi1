import {
  normalizeSkillCatalogName,
  normalizeSkillDisplayName,
  SKILL_CATEGORIES,
  validateSkillCandidate,
} from './skillCatalog.js'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesSkill(text, phrase) {
  const normalizedPhrase = phrase.trim().replace(/\s+/g, ' ')
  if (!normalizedPhrase) return false

  const pattern = normalizedPhrase
    .split(' ')
    .map(escapeRegExp)
    .join('\\s+')

  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text)
}

export function addSkillAliases(skills, aliasRecords) {
  const aliasesBySkill = new Map()

  for (const record of aliasRecords) {
    if (!record?.skill_id || typeof record.alias !== 'string' || !record.alias.trim()) continue
    const aliases = aliasesBySkill.get(record.skill_id) || []
    if (!aliases.includes(record.alias)) aliases.push(record.alias)
    aliasesBySkill.set(record.skill_id, aliases)
  }

  return skills.map((skill) => ({
    ...skill,
    aliases: [...new Set([
      ...(Array.isArray(skill.aliases) ? skill.aliases : []),
      ...(aliasesBySkill.get(skill.id) || []),
    ])],
  }))
}

export function detectSkillsInText(text, skills) {
  if (typeof text !== 'string' || !text.trim()) return []

  return skills.filter((skill) => {
    const phrases = [skill.name, ...(Array.isArray(skill.aliases) ? skill.aliases : [])]
    return phrases.some((phrase) => typeof phrase === 'string' && matchesSkill(text, phrase))
  })
}

export function detectSkillsInJob(job, skills) {
  const text = [
    job.title,
    job.department,
    job.description,
    job.experience_required,
    job.education_required,
    job.responsibilities,
    job.learning_objectives,
  ].filter((value) => typeof value === 'string' && value.trim()).join('\n')

  return detectSkillsInText(text, skills)
}

export function createSkillDescription(name, category = 'General') {
  const skillName = String(name || '').trim().replace(/\s+/g, ' ')
  const skillCategory = String(category || '').trim().replace(/\s+/g, ' ') || 'General'
  if (!skillName) return ''
  return `The knowledge and practical ability to apply ${skillName} effectively in ${skillCategory.toLocaleLowerCase()} tasks and situations.`
}

const categoryAliases = new Map([
  ['technical', SKILL_CATEGORIES[0]],
  ['technology', SKILL_CATEGORIES[0]],
  ['digital', SKILL_CATEGORIES[0]],
  ['information technology', SKILL_CATEGORIES[0]],
  ['software', SKILL_CATEGORIES[0]],
  ['creative', SKILL_CATEGORIES[1]],
  ['design', SKILL_CATEGORIES[1]],
  ['arts', SKILL_CATEGORIES[1]],
  ['business', SKILL_CATEGORIES[2]],
  ['management', SKILL_CATEGORIES[2]],
  ['entrepreneurship', SKILL_CATEGORIES[2]],
  ['accounting', SKILL_CATEGORIES[3]],
  ['finance', SKILL_CATEGORIES[3]],
  ['financial', SKILL_CATEGORIES[3]],
  ['health', SKILL_CATEGORIES[4]],
  ['healthcare', SKILL_CATEGORIES[4]],
  ['medical', SKILL_CATEGORIES[4]],
  ['agriculture', SKILL_CATEGORIES[5]],
  ['environmental', SKILL_CATEGORIES[5]],
  ['education', SKILL_CATEGORIES[6]],
  ['teaching', SKILL_CATEGORIES[6]],
  ['engineering', SKILL_CATEGORIES[7]],
  ['construction', SKILL_CATEGORIES[7]],
  ['technical trades', SKILL_CATEGORIES[7]],
  ['communication', SKILL_CATEGORIES[8]],
  ['media', SKILL_CATEGORIES[8]],
  ['hospitality', SKILL_CATEGORIES[9]],
  ['tourism', SKILL_CATEGORIES[9]],
  ['soft', SKILL_CATEGORIES[10]],
  ['professional', SKILL_CATEGORIES[10]],
  ['general', SKILL_CATEGORIES[10]],
  ['transferable', SKILL_CATEGORIES[10]],
])

function normalizeSkillCategory(category, fallback = SKILL_CATEGORIES[10]) {
  const normalized = normalizeSkillCatalogName(category).replace(/\s+skills?$/, '')
  if (SKILL_CATEGORIES.some((item) => normalizeSkillCatalogName(item) === normalized)) {
    return SKILL_CATEGORIES.find((item) => normalizeSkillCatalogName(item) === normalized)
  }
  return categoryAliases.get(normalized) || fallback
}

export function extractSkillCandidates(text, existingSkills = []) {
  const existingNames = new Set(existingSkills.map((skill) => normalizeSkillCatalogName(skill.name)))
  const candidates = new Map()
  let category = SKILL_CATEGORIES[10]
  const ignoredHeading = /^(skills?|competencies|learning outcomes|contents|table of contents|page\s+\d+|appendix|references|introduction)$/i
  const internalNoise = /\b(claude\s+skills?\s+catalog|catalog\s*page|built[- ]?in[- ]?browser|mcp[- ]?builder|skill[- ]?testing|public[_ -]?read|examples?)\b|^page\s*\d+$/i

  const addCandidate = (rawName, rawCategory = category) => {
    const name = normalizeSkillDisplayName(rawName.replace(/^\s*(?:(?:[-*•▪◦]|\d+[.)])\s*)+/, ''))
    if (!name || internalNoise.test(name) || ignoredHeading.test(name)) return
    const key = normalizeSkillCatalogName(name)
    if (existingNames.has(key) || candidates.has(key)) return
    const candidateCategory = normalizeSkillCategory(rawCategory)
    if (!validateSkillCandidate({ name, category: candidateCategory }, { requireDescription: false }).valid) return
    candidates.set(key, {
      name,
      category: candidateCategory,
      description: '',
      selected: true,
    })
  }

  for (const sourceLine of String(text || '').split(/\r?\n/)) {
    const line = sourceLine
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue

    const cleanedLine = line.replace(/^\s*(?:(?:[-*•▪◦]|\d+[.)])\s*)+/, '').trim()
    const heading = cleanedLine.replace(/[:.]$/, '').trim()
    const normalizedHeading = normalizeSkillCatalogName(heading).replace(/\s+skills?$/, '')
    if (categoryAliases.has(normalizedHeading)
      || SKILL_CATEGORIES.some((item) => normalizeSkillCatalogName(item) === normalizedHeading)) {
      category = normalizeSkillCategory(heading)
      continue
    }

    const cells = cleanedLine.split(/\t+|\s+\|\s+/).map((cell) => cell.trim()).filter(Boolean)
    if (cells.length > 1) {
      const skillCell = cells[0]
      const categoryCell = cells[1]
      if (skillCell.length <= 80 && !/[.!?]/.test(skillCell)) {
        addCandidate(skillCell, categoryCell.length <= 50 ? categoryCell : category)
        continue
      }
    }

    const listItems = cleanedLine.split(/\s*[,;]\s*/).filter(Boolean)
    if (listItems.length > 1 && listItems.length <= 15 && listItems.every((item) => item.length <= 60 && !/[.!?]/.test(item))) {
      for (const item of listItems) addCandidate(item)
      continue
    }

    if (cleanedLine.length <= 80 && !/[.!?:]/.test(cleanedLine)) addCandidate(cleanedLine)
  }

  return [...candidates.values()]
}

export function detectSkillsInSources(sources, skills) {
  const detected = new Map()

  for (const source of sources) {
    if (!source.text?.trim()) continue
    for (const skill of detectSkillsInText(source.text, skills)) {
      const result = detected.get(skill.id) || { ...skill, evidence: [] }
      if (!result.evidence.includes(source.label)) result.evidence.push(source.label)
      detected.set(skill.id, result)
    }
  }

  return [...detected.values()]
}
