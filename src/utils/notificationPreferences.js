export const NOTIFICATION_CATEGORIES = [
  ['new_job_match', 'Jobs'],
  ['internship_match', 'Internships and attachments'],
  ['learning_recommendation', 'Learning recommendations'],
  ['training_recommendation', 'Training and certification'],
  ['scholarship_opportunity', 'Scholarships and funding'],
  ['apprenticeship_programme', 'Apprenticeships and graduate programmes'],
  ['deadline_reminder', 'Deadline reminders'],
  ['application_update', 'Application updates'],
  ['interview_reminder', 'Interview reminders'],
  ['employer_message', 'Employer messages'],
  ['skill_gap_update', 'Skills and career recommendations'],
  ['career_recommendation', 'Career recommendations'],
  ['system_announcement', 'System announcements'],
]

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled_categories: NOTIFICATION_CATEGORIES.map(([type]) => type),
  preferred_industries: [],
  preferred_opportunity_types: [],
  preferred_locations: [],
  remote_work: true,
  deadline_reminders: true,
  minimum_relevance_score: 30,
  digest_frequency: 'off',
  email_enabled: false,
}

export function normalizeNotificationPreferences(preferences = {}) {
  const input = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {}
  const allowedCategories = new Set(NOTIFICATION_CATEGORIES.map(([type]) => type))
  const enabledCategories = Array.isArray(input.enabled_categories)
    ? [...new Set(input.enabled_categories.filter((type) => allowedCategories.has(type)))]
    : DEFAULT_NOTIFICATION_PREFERENCES.enabled_categories
  const normalizeList = (value) => Array.isArray(value)
    ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))].slice(0, 30)
    : []
  const rawScore = input.minimum_relevance_score === '' ? Number.NaN : Number(input.minimum_relevance_score)
  return {
    enabled_categories: enabledCategories,
    preferred_industries: normalizeList(input.preferred_industries),
    preferred_opportunity_types: normalizeList(input.preferred_opportunity_types),
    preferred_locations: normalizeList(input.preferred_locations),
    remote_work: input.remote_work === undefined ? DEFAULT_NOTIFICATION_PREFERENCES.remote_work : input.remote_work === true,
    deadline_reminders: input.deadline_reminders === undefined ? DEFAULT_NOTIFICATION_PREFERENCES.deadline_reminders : input.deadline_reminders === true,
    minimum_relevance_score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : DEFAULT_NOTIFICATION_PREFERENCES.minimum_relevance_score,
    digest_frequency: ['off', 'daily', 'weekly'].includes(input.digest_frequency) ? input.digest_frequency : 'off',
    email_enabled: false,
  }
}
