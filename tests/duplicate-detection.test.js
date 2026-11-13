import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareAssessmentsForDuplicates,
  compareJobsForDuplicates,
  findPotentialAssessmentDuplicates,
  findPotentialJobDuplicatePairs,
  findPotentialJobDuplicates,
} from '../src/utils/duplicateDetection.js'

const duplicateJob = {
  id: 'job-1',
  employer_id: 'employer-1',
  title: 'Graphic Designer',
  location: 'Lilongwe',
  employment_type: 'part_time',
  application_deadline: '2026-11-20',
  published_at: '2026-10-10T09:00:00Z',
  description: 'Create visual materials for campaigns and maintain consistent brand assets.',
  status: 'published',
}

test('matches normalized duplicate jobs using employer, dates, terms, and description', () => {
  const duplicate = {
    ...duplicateJob,
    id: 'job-2',
    title: '  graphic-designer ',
    location: 'LILONGWE',
    description: 'Create visual materials for campaigns, and maintain consistent brand assets!',
  }
  const comparison = compareJobsForDuplicates(duplicateJob, duplicate)

  assert.equal(comparison.isPossibleDuplicate, true)
  assert.equal(comparison.sameEmployer, true)
  assert.equal(comparison.sameTitle, true)
  assert.equal(comparison.sameClosingDate, true)
  assert.equal(comparison.descriptionSimilarity, 1)
  assert.equal(findPotentialJobDuplicates(duplicateJob, [duplicate]).length, 1)
})

test('does not block a separate vacancy with materially different terms', () => {
  const separateVacancy = {
    ...duplicateJob,
    id: 'job-3',
    application_deadline: '2026-12-31',
    published_at: '2026-12-01T09:00:00Z',
    description: 'Design product packaging and coordinate print production with suppliers.',
  }

  assert.equal(compareJobsForDuplicates(duplicateJob, separateVacancy).isPossibleDuplicate, false)
})

test('job duplicate checks exclude the record being edited and archived jobs', () => {
  assert.deepEqual(findPotentialJobDuplicates(duplicateJob, [
    duplicateJob,
    { ...duplicateJob, id: 'archived', status: 'archived' },
  ]), [])
})

test('job review pairs include only likely matches and do not treat separate vacancies as duplicates', () => {
  const duplicate = { ...duplicateJob, id: 'job-2' }
  const separateEmployer = { ...duplicateJob, id: 'job-3', employer_id: 'employer-2' }
  const archived = { ...duplicateJob, id: 'job-4', status: 'archived' }

  assert.deepEqual(
    findPotentialJobDuplicatePairs([duplicateJob, duplicate, separateEmployer, archived])
      .map(({ left, right }) => [left.id, right.id]),
    [['job-1', 'job-2']],
  )
})

const question = {
  question: 'For this role, which response best demonstrates graphic design?',
  question_type: 'multiple_choice',
  options: ['A', 'B', 'C', 'D'],
  correct_answer: 'A',
  points: 1,
  difficulty: 'intermediate',
  explanation: 'Check the work against the role requirements.',
}

test('identifies assessments with the same target, title, type, and question content', () => {
  const left = {
    id: 'assessment-1',
    title: 'Graphic Designer Skills Assessment',
    job_id: 'job-1',
    assessment_type: 'job',
    status: 'published',
    assessment_questions: [question],
  }
  const right = {
    ...left,
    id: 'assessment-2',
    assessment_questions: [{ ...question, options: ['D', 'C', 'B', 'A'] }],
  }

  const comparison = compareAssessmentsForDuplicates(left, right)
  assert.equal(comparison.isPossibleDuplicate, true)
  assert.equal(comparison.sameQuestionSet, true)
  assert.equal(findPotentialAssessmentDuplicates([left, right]).length, 1)
})

test('does not label the same reusable assessment content for different jobs a duplicate', () => {
  const left = { id: 'assessment-1', title: 'Common Skills', job_id: 'job-1', assessment_type: 'job', assessment_questions: [question] }
  const right = { ...left, id: 'assessment-2', job_id: 'job-2' }

  assert.equal(compareAssessmentsForDuplicates(left, right).isPossibleDuplicate, false)
})

test('job-specific assessments are not duplicates merely because they share a career', () => {
  const left = { id: 'assessment-1', title: 'Common Skills', job_id: 'job-1', career_id: 'career-1', assessment_type: 'job', assessment_questions: [question] }
  const right = { ...left, id: 'assessment-2', job_id: 'job-2' }

  assert.equal(compareAssessmentsForDuplicates(left, right).isPossibleDuplicate, false)
})

test('assessment publication status is compared without treating draft and published copies as distinct content', () => {
  const left = { id: 'assessment-1', title: 'Graphic Designer Skills Assessment', job_id: 'job-1', assessment_type: 'job', status: 'published', assessment_questions: [question] }
  const right = { ...left, id: 'assessment-2', status: 'draft' }
  const comparison = compareAssessmentsForDuplicates(left, right)

  assert.equal(comparison.isPossibleDuplicate, true)
  assert.equal(comparison.samePublicationStatus, false)
})
