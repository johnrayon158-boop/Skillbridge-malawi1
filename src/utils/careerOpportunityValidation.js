const OPPORTUNITY_TYPES = new Set(['training', 'scholarship'])
const CANDIDATE_TYPES = new Set(['student', 'graduate'])

function normalizeList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,\n]/)
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].slice(0, 30)
}

function normalizeStudyYear(value, field) {
  if (value === '' || value == null) return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1 || year > 20) {
    throw new Error(`${field} must be a whole number from 1 to 20.`)
  }
  return year
}

export function buildCareerOpportunityPayload(opportunity) {
  if (!opportunity || typeof opportunity !== 'object' || Array.isArray(opportunity)) {
    throw new Error('Opportunity details must be provided.')
  }
  const title = String(opportunity.title || '').trim()
  const description = String(opportunity.description || '').trim()
  if (!title || !description) throw new Error('Opportunity title and description are required.')
  if (!OPPORTUNITY_TYPES.has(opportunity.opportunity_type)) {
    throw new Error('Choose either a training programme or scholarship.')
  }
  if (!['draft', 'published', 'closed', 'archived'].includes(opportunity.status)) {
    throw new Error('Choose a valid publication status.')
  }
  if (opportunity.status === 'published' && !String(opportunity.provider || '').trim()) {
    throw new Error('Add the opportunity provider before publishing.')
  }

  let applicationUrl = String(opportunity.application_url || '').trim()
  if (applicationUrl) {
    let parsedUrl
    try {
      parsedUrl = new URL(applicationUrl)
    } catch {
      throw new Error('Enter a valid application URL.')
    }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
      throw new Error('Application links must use HTTPS and cannot contain embedded credentials.')
    }
    applicationUrl = parsedUrl.href
  }
  if (opportunity.status === 'published' && !applicationUrl) {
    throw new Error('Add a valid HTTPS application URL before publishing.')
  }

  const minStudyYear = normalizeStudyYear(opportunity.min_study_year, 'Minimum study year')
  const maxStudyYear = normalizeStudyYear(opportunity.max_study_year, 'Maximum study year')
  if (minStudyYear !== null && maxStudyYear !== null && minStudyYear > maxStudyYear) {
    throw new Error('Minimum study year cannot exceed maximum study year.')
  }
  const candidateTypes = [...new Set(normalizeList(opportunity.eligible_candidate_types).map((type) => type.toLowerCase()))]
  if (candidateTypes.some((type) => !CANDIDATE_TYPES.has(type))) {
    throw new Error('Eligible candidate types must be student or graduate.')
  }

  const deadline = String(opportunity.application_deadline || '').trim() || null
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    throw new Error('Enter a valid application deadline.')
  }
  if (deadline) {
    const parsedDeadline = new Date(`${deadline}T00:00:00Z`)
    if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.toISOString().slice(0, 10) !== deadline) {
      throw new Error('Enter a valid application deadline.')
    }
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (opportunity.status === 'published' && deadline < today) {
      throw new Error('Expired opportunities cannot be published.')
    }
  }

  const deliveryMode = String(opportunity.delivery_mode || '').trim() || null
  if (deliveryMode && !['in_person', 'online', 'hybrid'].includes(deliveryMode)) {
    throw new Error('Choose a valid delivery mode.')
  }

  return {
    ...(opportunity.id ? { id: opportunity.id } : {}),
    title,
    description,
    opportunity_type: opportunity.opportunity_type,
    provider: String(opportunity.provider || '').trim() || null,
    application_url: applicationUrl || null,
    location: String(opportunity.location || '').trim() || null,
    is_remote: Boolean(opportunity.is_remote),
    delivery_mode: deliveryMode,
    industries: normalizeList(opportunity.industries),
    eligible_programmes: normalizeList(opportunity.eligible_programmes),
    academic_qualifications: normalizeList(opportunity.academic_qualifications),
    eligibility_requirements: normalizeList(opportunity.eligibility_requirements),
    eligible_candidate_types: candidateTypes,
    min_study_year: minStudyYear,
    max_study_year: maxStudyYear,
    application_deadline: deadline,
    status: opportunity.status,
    skill_ids: normalizeList(opportunity.skill_ids),
    career_ids: normalizeList(opportunity.career_ids),
  }
}
