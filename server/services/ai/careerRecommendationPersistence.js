const FACTOR_NAMES = new Set([
  'skills',
  'education',
  'assessments',
  'interests',
  'preference',
  'employer_feedback',
])

function normalizeFactorValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  return Object.fromEntries(Object.entries(values)
    .filter(([name, value]) => FACTOR_NAMES.has(name)
      && typeof value === 'number'
      && Number.isFinite(value)
      && value >= 0
      && value <= 100)
    .map(([name, value]) => [name, Math.round(value)]))
}

export function buildCareerRecommendationRows(userId, recommendations, existing = []) {
  const recommendationIds = new Map((existing || []).map((row) => [row.career_id, row.id]))
  return (recommendations || []).filter((item) => item?.career_id).map((item) => ({
    ...(recommendationIds.has(item.career_id) ? { id: recommendationIds.get(item.career_id) } : {}),
    student_id: userId,
    career_id: item.career_id,
    match_score: item.overall_score,
    reason: item.explanation,
    strong_skills: item.strong_skills || [],
    developing_skills: item.developing_skills || [],
    missing_skills: item.missing_skills || [],
    factor_scores: normalizeFactorValues(item.factors),
    factor_weights: normalizeFactorValues(item.factor_weights),
    generated_by: 'deterministic-scoring',
  }))
}
