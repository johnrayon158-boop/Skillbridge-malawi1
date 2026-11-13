import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getEmploymentListingTypes,
  getVisibleEmploymentTypes,
  JOB_EMPLOYMENT_TYPES,
} from '../src/utils/candidateType.js'

test('student listings include employment and internship types but exclude graduate-only listings', () => {
  assert.deepEqual(getVisibleEmploymentTypes('student'), JOB_EMPLOYMENT_TYPES.filter((type) => type !== 'graduate'))
})

test('graduates can see all job types, including internships and graduate listings', () => {
  assert.deepEqual(getVisibleEmploymentTypes('graduate'), JOB_EMPLOYMENT_TYPES)
  assert.ok(getVisibleEmploymentTypes('graduate').includes('internship'))
  assert.ok(getVisibleEmploymentTypes('graduate').includes('graduate'))
})

test('employment listings exclude placement-only employment types by default', () => {
  assert.deepEqual(getEmploymentListingTypes('student'), ['full_time', 'part_time', 'contract', 'temporary', 'volunteer'])
  assert.deepEqual(getEmploymentListingTypes('graduate'), ['full_time', 'part_time', 'contract', 'temporary', 'volunteer'])
})

test('all-opportunities listings include candidate-eligible placements', () => {
  assert.ok(getEmploymentListingTypes('student', 'all').includes('internship'))
  assert.ok(!getEmploymentListingTypes('student', 'all').includes('graduate'))
  assert.deepEqual(getEmploymentListingTypes('graduate', 'all'), JOB_EMPLOYMENT_TYPES)
})

test('unknown candidate types use student-eligible listings', () => {
  assert.deepEqual(getVisibleEmploymentTypes('unknown'), getVisibleEmploymentTypes('student'))
})
