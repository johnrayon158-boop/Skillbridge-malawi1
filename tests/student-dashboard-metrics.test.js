import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateStudentDashboardMetrics } from '../src/utils/studentDashboardMetrics.js'
import { calculateLearningProgressMetrics } from '../src/utils/studentProgressMetrics.js'
import { isCertificateIndependentlyVerified } from '../src/utils/certificateVerification.js'

test('learning progress counts each resource once using its latest record', () => {
  const metrics = calculateLearningProgressMetrics([
    { resource_id: 'resource-1', status: 'in_progress', progress: 20, updated_at: '2026-01-01' },
    { resource_id: 'resource-1', status: 'completed', progress: 100, updated_at: '2026-02-01' },
    { resource_id: 'resource-2', status: 'in_progress', progress: 50, updated_at: '2026-02-01' },
    { resource_id: 'resource-3', status: 'not_started', progress: 0 },
  ])

  assert.deepEqual(metrics, { average: 75, trackedCount: 2, completedCount: 1 })
})

test('dashboard presents named metrics and avoids percentages when evidence is unavailable', () => {
  const metrics = calculateStudentDashboardMetrics()

  assert.deepEqual(metrics.slice(0, 5).map(({ label }) => label), [
    'Profile Completion',
    'Evidence Readiness',
    'Assessment Average',
    'Learning Progress',
    'Portfolio Progress',
  ])
  assert.equal(metrics.find(({ label }) => label === 'Evidence Readiness').value, 'Not enough evidence')
  assert.equal(metrics.find(({ label }) => label === 'Assessment Average').value, 'No results yet')
  assert.equal(metrics.find(({ label }) => label === 'Learning Progress').value, 'Not started')
})

test('certificate evidence requires independent verification details', () => {
  assert.equal(isCertificateIndependentlyVerified({
    verification_status: 'verified',
    verification_method: 'issuer_confirmation',
    verified_by: 'admin-1',
    verified_at: '2026-06-01T10:00:00Z',
  }), true)
  assert.equal(isCertificateIndependentlyVerified({
    verification_status: 'verified',
    verification_method: 'self_reported',
    verified_by: 'admin-1',
    verified_at: '2026-06-01T10:00:00Z',
  }), false)
})
