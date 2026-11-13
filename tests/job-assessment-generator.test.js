import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJobAssessment } from '../src/utils/jobAssessmentGenerator.js'

test('generates a job assessment from required job skills', () => {
  const assessment = buildJobAssessment({
    id: 'job-1',
    title: 'Junior Data Analyst',
    job_skills: [
      { is_required: true, skills: { name: 'Data Analysis' } },
      { is_required: true, skills: { name: 'Excel' } },
      { is_required: false, skills: { name: 'Presentation' } },
    ],
  })

  assert.equal(assessment.title, 'Junior Data Analyst Skills Assessment')
  assert.equal(assessment.questions.length, 2)
  assert.equal(assessment.durationMinutes, 15)
  for (const question of assessment.questions) {
    assert.equal(question.question_type, 'multiple_choice')
    assert.equal(question.options.length, 4)
    assert.ok(question.options.includes(question.correct_answer))
    assert.match(question.question, /Junior Data Analyst/)
  }
})

test('requires a valid job with required skills before generating an assessment', () => {
  assert.throws(() => buildJobAssessment({ id: 'job-1', title: 'Data Analyst', job_skills: [] }), /Add required skills/)
  assert.throws(() => buildJobAssessment(null), /Select a valid job/)
})
