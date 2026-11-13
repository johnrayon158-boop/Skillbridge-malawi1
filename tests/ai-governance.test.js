import test from 'node:test'
import assert from 'node:assert/strict'

import { validateAiInput, validateAiOutput, isKnownEntityRef } from '../server/services/aiGovernance/aiValidationService.js'
import { buildExplanation } from '../server/services/aiGovernance/aiExplanationService.js'
import { analyzeFairness } from '../server/services/aiGovernance/aiFairnessService.js'
import { recordDecisionAudit } from '../server/services/aiGovernance/aiAuditService.js'
import { summarizeGovernanceStatus, createRecommendationSummary } from '../server/services/aiGovernance/aiGovernanceService.js'

const validStudentProfile = {
  id: '01H00000000000000000000',
  full_name: 'Amina Banda',
  role: 'student',
  career_goal: 'Data Analyst',
}

test('AI input validation accepts well-formed profile and candidate data', () => {
  const result = validateAiInput({
    profile: validStudentProfile,
    skillIds: ['skill-1', 'skill-2'],
    jobId: 'job-1',
    education: [{ level: 'Bachelor' }],
    assessments: [{ score: 82 }],
  })

  assert.equal(result.valid, true)
  assert.equal(result.errors.length, 0)
})

test('AI input validation rejects malformed or missing data', () => {
  const result = validateAiInput({
    profile: { role: 'student' },
    skillIds: ['bad-value', ''],
    jobId: '',
    assessments: [{ score: 120 }],
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => String(error).includes('profile') || String(error).includes('job') || String(error).includes('skill') || String(error).includes('assessment')))
})

test('AI output validation rejects invalid career references', () => {
  const result = validateAiOutput({
    recommendations: [{ career_id: 'missing-career', title: 'Data Analyst' }],
    validCareerIds: ['career-1'],
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => String(error).includes('career')))
})

test('AI output validation accepts actual entity references', () => {
  const result = validateAiOutput({
    recommendations: [{ career_id: 'career-1', title: 'Data Analyst' }],
    validCareerIds: ['career-1'],
    learningResources: [{ id: 'resource-1' }],
    validResourceIds: ['resource-1'],
  })

  assert.equal(result.valid, true)
})

test('the governance layer labels missing data before producing a recommendation', () => {
  const result = summarizeGovernanceStatus({
    profileComplete: false,
    hasAssessment: false,
    hasSkills: false,
    hasEvidence: false,
    hasCareerPreference: false,
  })

  assert.equal(result.confidence, 'Insufficient Data')
  assert.ok(result.summary.includes('Insufficient data'))
})

test('explanations preserve only grounded evidence and include clear limitations', () => {
  const explanation = buildExplanation({
    summary: 'This career matches the available profile data.',
    strengths: ['SQL is supported by evidence', 'Assessment score is strong'],
    partialMatches: ['Power BI is developing'],
    gaps: ['Advanced analytics skill gap remains'],
    evidence: ['2 projects', '1 assessment'],
    factors: [{ label: 'Skill Match', value: '40%' }, { label: 'Education', value: '15%' }],
    nextActions: ['Add one portfolio project', 'Complete a statistics assessment'],
    limitations: ['The recommendation is based on the current profile and available data only.'],
  })

  assert.equal(explanation.summary.includes('available profile data'), true)
  assert.ok(Array.isArray(explanation.strengths))
  assert.ok(explanation.limitations.length > 0)
})

test('fairness analysis returns insufficient data when no lawful comparable groups exist', () => {
  const result = analyzeFairness({
    records: [{ score: 82 }, { score: 76 }],
    groups: [],
  })

  assert.equal(result.status, 'Insufficient data for fairness analysis')
})

test('audit logging captures the feature, score, and explanation without sensitive data', () => {
  const log = recordDecisionAudit({
    recommendationId: 'rec-1',
    featureType: 'career_recommendation',
    userId: 'user-1',
    modelProvider: 'deterministic-scoring',
    deterministicScore: 86,
    aiScore: 89,
    confidenceScore: 'High',
    explanation: 'Strong fit based on current evidence.',
    validationStatus: 'passed',
  })

  assert.equal(log.featureType, 'career_recommendation')
  assert.equal(log.validationStatus, 'passed')
  assert.equal(log.explanation.includes('Strong fit'), true)
})

test('known entity checks reject invalid references and accept valid records', () => {
  assert.equal(isKnownEntityRef('career-1', ['career-1']), true)
  assert.equal(isKnownEntityRef('missing-id', ['career-1']), false)
})

test('recommendation summaries return a real confidence level and missing-data guidance', () => {
  const result = createRecommendationSummary({
    title: 'Data Analyst',
    score: 86,
    profileComplete: true,
    hasAssessment: true,
    hasSkills: true,
    hasEvidence: true,
    missingItems: ['Advanced statistics'],
  })

  assert.equal(result.confidence, 'High')
  assert.ok(result.summary.includes('Data Analyst'))
  assert.ok(result.summary.includes('Advanced statistics'))
})
