export function getSkillGapRows(data = {}) {
  if (Array.isArray(data.gaps)) return data.gaps
  return [
    ...(data.skill_gaps || []).map((item) => ({ ...item, gap: 'missing' })),
    ...(data.developing_skills || []).map((item) => ({ ...item, gap: 'insufficient' })),
  ]
}

export function getRecommendationRows(data = {}) {
  return Array.isArray(data.recommendations) ? data.recommendations : []
}

export function getSafeResourceUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : ''
}
