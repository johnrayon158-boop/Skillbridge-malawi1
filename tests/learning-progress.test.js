import assert from 'node:assert/strict'
import test from 'node:test'
import { applySavedLearningProgress, buildLearningProgressUpdate } from '../src/utils/learningProgress.js'

test('learning progress records first start and preserves its start time when completing', () => {
  const started = buildLearningProgressUpdate('student-1', { id: 'resource-1' }, '2026-06-01T10:00:00.000Z')
  assert.deepEqual(started, {
    student_id: 'student-1',
    resource_id: 'resource-1',
    status: 'in_progress',
    progress: 1,
    started_at: '2026-06-01T10:00:00.000Z',
    completed_at: null,
  })

  const completed = buildLearningProgressUpdate('student-1', {
    id: 'resource-1',
    progress: { status: 'in_progress', progress: 35, started_at: started.started_at },
  }, '2026-06-02T10:00:00.000Z')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.progress, 100)
  assert.equal(completed.started_at, started.started_at)
  assert.equal(completed.completed_at, '2026-06-02T10:00:00.000Z')
})

test('learning UI state refresh uses the persisted row returned by the service', () => {
  const resources = [
    { id: 'resource-1', progress: { status: 'in_progress', progress: 1 } },
    { id: 'resource-2', progress: null },
  ]
  const savedProgress = {
    id: 'saved-row',
    student_id: 'student-1',
    resource_id: 'resource-1',
    status: 'completed',
    progress: 100,
  }

  assert.deepEqual(applySavedLearningProgress(resources, savedProgress), [
    { id: 'resource-1', progress: savedProgress },
    { id: 'resource-2', progress: null },
  ])
  assert.throws(() => applySavedLearningProgress(resources, null), /missing its resource ID/)
})
