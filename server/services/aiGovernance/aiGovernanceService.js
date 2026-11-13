import { buildExplanation } from './aiExplanationService.js'
import { analyzeFairness } from './aiFairnessService.js'
import { recordDecisionAudit } from './aiAuditService.js'
import { validateAiInput, validateAiOutput } from './aiValidationService.js'

export function summarizeGovernanceStatus({
  profileComplete = false,
  hasAssessment = false,
  hasSkills = false,
  hasEvidence = false,
  hasCareerPreference = false,
} = {}) {
  const missing = []
  if (!profileComplete) missing.push('profile data')
  if (!hasAssessment) missing.push('assessment results')
  if (!hasSkills) missing.push('skills evidence')
  if (!hasEvidence) missing.push('portfolio or project evidence')
  if (!hasCareerPreference) missing.push('career preference')

  const confidence = missing.length === 0 ? 'High' : missing.length <= 2 ? 'Medium' : 'Insufficient Data'

  return {
    confidence,
    summary: missing.length
      ? `Insufficient data: the recommendation is limited by missing ${missing.join(', ')}. Add more profile and evidence data to improve recommendation quality.`
      : 'The current profile has enough recorded data for a grounded recommendation.',
    missing,
  }
}

export function createRecommendationSummary({
  title = 'Recommendation',
  score = 0,
  profileComplete = false,
  hasAssessment = false,
  hasSkills = false,
  hasEvidence = false,
  missingItems = [],
} = {}) {
  const base = summarizeGovernanceStatus({
    profileComplete,
    hasAssessment,
    hasSkills,
    hasEvidence,
    hasCareerPreference: true,
  })
  const confidence = Number(score) >= 85 ? 'High' : Number(score) >= 60 ? 'Medium' : Number(score) >= 30 ? 'Low' : 'Insufficient Data'
  return {
    title,
    score: Number(score) || 0,
    confidence,
    summary: `${title} has a ${confidence.toLowerCase()} confidence score. ${base.summary}${missingItems.length ? ` Remaining gaps include: ${missingItems.join(', ')}.` : ''}`,
    governanceStatus: base,
  }
}

export function createGovernanceRecord(input = {}) {
  return recordDecisionAudit(input)
}

export function generateGovernanceSnapshot(payload = {}) {
  const validation = validateAiInput(payload)
  const outputValidation = validateAiOutput(payload.output || {})
  const fairness = analyzeFairness({
    records: payload.records || payload.scores || [],
    groups: payload.groups || [],
  })
  const explanation = buildExplanation(payload.explanation || {})
  return {
    validation,
    outputValidation,
    fairness,
    explanation,
  }
}
