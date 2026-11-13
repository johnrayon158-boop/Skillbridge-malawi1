export function buildExplanation({
  summary = '',
  strengths = [],
  partialMatches = [],
  gaps = [],
  evidence = [],
  factors = [],
  nextActions = [],
  limitations = [],
} = {}) {
  const safeStrengths = Array.isArray(strengths) ? strengths.map((value) => String(value)) : []
  const safePartialMatches = Array.isArray(partialMatches) ? partialMatches.map((value) => String(value)) : []
  const safeGaps = Array.isArray(gaps) ? gaps.map((value) => String(value)) : []
  const safeEvidence = Array.isArray(evidence) ? evidence.map((value) => String(value)) : []
  const safeFactors = Array.isArray(factors)
    ? factors.map((factor) => ({
        label: String(factor?.label || 'Factor'),
        value: factor?.value !== undefined ? String(factor.value) : 'N/A',
      }))
    : []
  const safeNextActions = Array.isArray(nextActions) ? nextActions.map((value) => String(value)) : []
  const safeLimitations = Array.isArray(limitations) && limitations.length
    ? limitations.map((value) => String(value))
    : ['This explanation is based only on the current SkillBridge profile, evidence, and available structured records.']

  return {
    summary: String(summary || 'Recommendation based on the current available profile data and platform evidence only.'),
    strengths: safeStrengths,
    partialMatches: safePartialMatches,
    gaps: safeGaps,
    evidence: safeEvidence,
    factors: safeFactors,
    nextActions: safeNextActions,
    limitations: safeLimitations,
  }
}
