import test from 'node:test'
import assert from 'node:assert/strict'

import { buildEmployerAnalytics } from '../src/utils/employerAnalytics.js'

test('employer analytics summarize job activity, current application stages, employees, and recent months', () => {
  const analytics = buildEmployerAnalytics([
    {
      id: 'job-1',
      title: 'Analyst',
      status: 'published',
      applications: [
        { status: 'applied', applied_at: '2026-10-02T12:00:00Z' },
        { status: 'shortlisted', applied_at: '2026-09-15T12:00:00Z' },
        { status: 'accepted', applied_at: '2026-10-08T12:00:00Z' },
      ],
    },
    { id: 'job-2', title: 'Developer', status: 'draft', applications: [{ status: 'rejected', applied_at: '2026-05-12T12:00:00Z' }] },
    { id: 'job-3', title: 'Designer', status: 'archived', applications: [] },
  ], [{ status: 'active' }, { status: 'completed' }], new Date('2026-10-09T12:00:00Z'))

  assert.deepEqual(analytics.jobs, { total: 3, published: 1, drafts: 1, closed: 1 })
  assert.equal(analytics.applications.total, 4)
  assert.equal(analytics.applications.accepted, 1)
  assert.equal(analytics.applications.acceptanceRate, 25)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'applied').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'under_review').count, 0)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'shortlisted').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'unsuccessful').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'accepted').count, 1)
  assert.equal(analytics.employees.active, 1)
  assert.deepEqual(analytics.monthlyApplications.map((month) => month.count), [1, 0, 0, 0, 1, 2])
  assert.equal(analytics.topJobs[0].title, 'Analyst')
  assert.equal(analytics.hasData, true)
})

test('employer pipeline counts offers separately from accepted and closed applications', () => {
  const analytics = buildEmployerAnalytics([{
    id: 'job-4',
    status: 'published',
    applications: [
      { status: 'offer' },
      { status: 'accepted' },
      { status: 'declined' },
      { status: 'second_interview' },
    ],
  }])

  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'offer').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'accepted').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'unsuccessful').count, 1)
  assert.equal(analytics.applications.stages.find((stage) => stage.key === 'interview').count, 1)
})

test('employer analytics handle an empty account without inventing rates or activity', () => {
  const analytics = buildEmployerAnalytics([], [], new Date('2026-10-09T12:00:00Z'))

  assert.equal(analytics.jobs.total, 0)
  assert.equal(analytics.applications.total, 0)
  assert.equal(analytics.applications.acceptanceRate, null)
  assert.equal(analytics.applications.perJob, null)
  assert.equal(analytics.monthlyApplications.every((month) => month.count === 0), true)
  assert.equal(analytics.hasData, false)
})
