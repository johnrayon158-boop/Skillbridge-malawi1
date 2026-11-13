export const CAREER_STATUSES = ['draft', 'published', 'archived']

export function parseCareerList(value) {
  const seen = new Set()
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function validateCareerDefinition(career, { publishing = career?.status === 'published' } = {}) {
  const title = String(career?.title || '').trim()
  const sector = String(career?.sector || '').trim()
  const description = String(career?.description || '').trim()

  if (!title) return 'Career title is required.'
  if (title.length > 160) return 'Career title must be 160 characters or fewer.'
  if (!sector) return 'Industry or sector is required.'
  if (sector.length > 120) return 'Industry or sector must be 120 characters or fewer.'
  if (!description) return 'Career description is required.'
  if (description.length > 4000) return 'Career description must be 4,000 characters or fewer.'
  if (!CAREER_STATUSES.includes(career?.status || 'draft')) return 'Choose a valid career status.'

  const outlookSourceUrl = String(career?.outlook_source_url || '').trim()
  if (outlookSourceUrl && !/^https:\/\//i.test(outlookSourceUrl)) {
    return 'Employment outlook source links must use HTTPS.'
  }
  if (career?.outlook_reviewed && (!String(career.outlook_summary || '').trim() || !String(career.outlook_source || '').trim())) {
    return 'Add an employment outlook summary and source before marking it reviewed.'
  }
  const skillRequirements = Array.isArray(career?.skill_requirements) ? career.skill_requirements : []
  if (publishing && !skillRequirements.some((skill) => skill.is_required !== false)) {
    return 'Add at least one required catalog skill before publishing this career.'
  }
  return ''
}
