const makeId = () => {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function recordDecisionAudit({
  recommendationId = null,
  featureType = 'general',
  userId = null,
  relatedEntityType = null,
  relatedEntityId = null,
  modelProvider = 'deterministic-scoring',
  modelVersion = 'N/A',
  deterministicScore = null,
  aiScore = null,
  confidenceScore = 'Insufficient Data',
  explanation = '',
  validationStatus = 'pending',
} = {}) {
  return {
    id: makeId(),
    recommendationId,
    featureType,
    userId,
    relatedEntityType,
    relatedEntityId,
    modelProvider,
    modelVersion,
    deterministicScore,
    aiScore,
    confidenceScore,
    explanation: String(explanation || 'Recommendation recorded for audit purposes.'),
    validationStatus,
    createdAt: new Date().toISOString(),
  }
}
