import assert from 'node:assert/strict'
import test from 'node:test'
import { isCvAnalysisProfileEligible } from '../server/services/ai/cvAnalysisEligibility.js'

test('CV analysis allows student accounts with student or graduate candidate profiles', () => {
  assert.equal(isCvAnalysisProfileEligible({
    role: 'student',
    student_profiles: [{ candidate_type: 'student' }],
  }), true)
  assert.equal(isCvAnalysisProfileEligible({
    role: 'student',
    student_profiles: [{ candidate_type: 'graduate' }],
  }), true)
})

test('CV analysis allows legacy graduate roles but rejects unrelated roles and candidate types', () => {
  assert.equal(isCvAnalysisProfileEligible({ role: 'graduate' }), true)
  assert.equal(isCvAnalysisProfileEligible({ role: 'employer' }), false)
  assert.equal(isCvAnalysisProfileEligible({
    role: 'student',
    student_profiles: [{ candidate_type: 'employer' }],
  }), false)
})
