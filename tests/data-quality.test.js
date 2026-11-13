import test from 'node:test'
import assert from 'node:assert/strict'

import {
  validateEmail,
  validateRole,
  validateScore,
  validatePercentage,
  validateApplicationStatus,
  validateJobStatus,
  normalizeSkillName,
} from '../src/utils/dataValidation.js'
import { getDataQualityProblems } from '../src/utils/dataQuality.js'

test('data validation accepts valid email, role, score and percentage', () => {
  assert.equal(validateEmail('student@skillbridge.mw'), true)
  assert.equal(validateRole('student'), true)
  assert.equal(validateRole('admin'), true)
  assert.equal(validateScore(87, 100), true)
  assert.equal(validatePercentage(82), true)
  assert.equal(validateApplicationStatus('shortlisted'), true)
  assert.equal(validateJobStatus('published'), true)
  assert.equal(normalizeSkillName('Java Script'), 'javascript')
})

test('data validation rejects invalid or unsafe values', () => {
  assert.equal(validateEmail('bad-email'), false)
  assert.equal(validateRole('superadmin'), false)
  assert.equal(validateScore(-5, 100), false)
  assert.equal(validateScore(150, 100), false)
  assert.equal(validatePercentage(120), false)
  assert.equal(validateApplicationStatus('mystery-status'), false)
  assert.equal(validateJobStatus('not-real'), false)
})

test('data quality validates applications using the student_id schema field', () => {
  assert.deepEqual(getDataQualityProblems('Applications', {
    student_id: 'student-1',
    job_id: 'job-1',
    status: 'applied',
  }), [])
  assert.deepEqual(getDataQualityProblems('Applications', {
    user_id: 'student-1',
    job_id: 'job-1',
    status: 'unknown',
  }), ['Missing student reference', 'Invalid or missing application status'])
})

test('data quality validates assessment schema fields without inventing score columns', () => {
  assert.deepEqual(getDataQualityProblems('Assessments', {
    title: 'Workplace safety',
    description: 'Safety assessment',
    assessment_type: 'skill',
    passing_score: 70,
  }), [])
  assert.deepEqual(getDataQualityProblems('Assessments', {
    title: 'Assessment',
    description: 'Description',
    assessment_type: 'practice',
    passing_score: 101,
  }), ['Passing score must be between 0 and 100'])
})

test('data quality validates employer profile fields from the employer schema', () => {
  assert.deepEqual(getDataQualityProblems('Employers', {
    company_name: 'SkillBridge',
    industry: 'Technology',
    description: 'Career platform',
    email: 'team@skillbridge.mw',
  }), [])
  assert.deepEqual(getDataQualityProblems('Employers', {
    user_id: 'employer-1',
  }), ['Missing company name', 'Missing industry', 'Missing company description', 'Invalid or missing company email'])
})
