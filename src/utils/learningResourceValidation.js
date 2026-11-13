export const LEARNING_RESOURCE_TYPES = Object.freeze([
  'course',
  'tutorial',
  'article',
  'video',
  'documentation',
  'book',
  'project',
  'practice',
  'certificate',
])

export const LEARNING_RESOURCE_DIFFICULTIES = Object.freeze([
  'beginner',
  'intermediate',
  'advanced',
])

export const LEARNING_RESOURCE_STATUSES = Object.freeze([
  'draft',
  'published',
  'archived',
])

export function validateLearningResource(resource, { publishing = resource?.status === 'published' } = {}) {
  const title = String(resource?.title || '').trim()
  const description = String(resource?.description || '').trim()
  const url = String(resource?.url || '').trim()
  const category = String(resource?.category || '').trim()
  const duration = resource?.duration_minutes === '' || resource?.duration_minutes == null
    ? null
    : Number(resource.duration_minutes)

  if (!title) return 'Resource title is required.'
  if (title.length > 200) return 'Resource title must be 200 characters or fewer.'
  if (!description) return 'Resource description is required.'
  if (description.length > 4000) return 'Resource description must be 4,000 characters or fewer.'
  if (!LEARNING_RESOURCE_TYPES.includes(resource?.resource_type)) return 'Choose a valid learning resource type.'
  if (!LEARNING_RESOURCE_STATUSES.includes(resource?.status || 'draft')) return 'Choose a valid publication status.'
  if (category.length > 120) return 'Category must be 120 characters or fewer.'
  if (resource?.difficulty && !LEARNING_RESOURCE_DIFFICULTIES.includes(resource.difficulty)) return 'Choose a valid difficulty level.'
  if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) {
    return 'Duration must be a positive whole number of minutes.'
  }
  if (url) {
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch {
      return 'Enter a valid resource URL.'
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return 'Resource URLs must use HTTP or HTTPS.'
  }
  if (publishing && !category) return 'Choose an academic or professional category before publishing.'
  if (publishing && !url) return 'Add a resource URL before publishing.'
  if (publishing && !/^https:\/\//i.test(url)) return 'Published resource links must use HTTPS.'

  const skillIds = Array.isArray(resource?.skill_ids) ? resource.skill_ids : []
  const careerIds = Array.isArray(resource?.career_ids) ? resource.career_ids : []
  if (new Set(skillIds).size !== skillIds.length) return 'A skill cannot be linked more than once.'
  if (new Set(careerIds).size !== careerIds.length) return 'A career cannot be linked more than once.'
  return ''
}
