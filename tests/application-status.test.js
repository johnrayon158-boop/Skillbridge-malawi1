import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canTransitionApplicationStatus,
  formatApplicationStatus,
  isApplicationInProgress,
  isApplicationOpen,
  normalizeApplicationStatus,
  summarizeApplications,
} from '../src/utils/applicationStatus.js'

test('normalizes legacy application statuses to the canonical labels', () => {
  assert.equal(normalizeApplicationStatus('submitted'), 'applied')
  assert.equal(normalizeApplicationStatus('viewed'), 'under_review')
  assert.equal(normalizeApplicationStatus('second_interview'), 'interview')
  assert.equal(normalizeApplicationStatus('hired'), 'accepted')
  assert.equal(normalizeApplicationStatus('declined'), 'offer_declined')
  assert.equal(normalizeApplicationStatus('unexpected'), 'unknown')
  assert.equal(formatApplicationStatus('under-review'), 'Under review')
  assert.equal(formatApplicationStatus('unexpected'), 'Status needs review')
})

test('allows the application lifecycle and blocks backwards and terminal transitions', () => {
  const lifecycle = [
    ['applied', 'under_review'],
    ['under_review', 'shortlisted'],
    ['shortlisted', 'assessment'],
    ['assessment', 'interview'],
    ['interview', 'offer'],
    ['offer', 'accepted'],
  ]

  for (const [from, to] of lifecycle) assert.equal(canTransitionApplicationStatus(from, to), true)
  assert.equal(canTransitionApplicationStatus('applied', 'accepted'), false)
  assert.equal(canTransitionApplicationStatus('offer', 'shortlisted'), false)
  assert.equal(canTransitionApplicationStatus('accepted', 'offer'), false)
  assert.equal(canTransitionApplicationStatus('rejected', 'withdrawn'), false)
  assert.equal(canTransitionApplicationStatus('offer', 'offer_declined'), true)
})

test('uses separate in-progress, offer, and scheduled-interview counts', () => {
  const now = Date.parse('2026-11-12T10:00:00Z')
  const summary = summarizeApplications([
    { status: 'applied', interviews: [{ status: 'scheduled', scheduled_at: '2026-11-13T10:00:00Z' }] },
    { status: 'interview', interviews: [{ status: 'rescheduled', scheduled_at: '2026-11-14T10:00:00Z' }] },
    { status: 'second_interview', interviews: [{ status: 'cancelled', scheduled_at: '2026-11-15T10:00:00Z' }] },
    { status: 'offer', interviews: [] },
    { status: 'accepted', interviews: [] },
    { status: 'rejected', interviews: [] },
  ], now)

  assert.deepEqual(summary, {
    total: 6,
    inProgress: 3,
    outstandingOffers: 1,
    accepted: 1,
    closed: 2,
    upcomingInterviews: 2,
  })
  assert.equal(isApplicationInProgress('second_interview'), true)
  assert.equal(isApplicationOpen('offer'), true)
  assert.equal(isApplicationOpen('accepted'), false)
})
