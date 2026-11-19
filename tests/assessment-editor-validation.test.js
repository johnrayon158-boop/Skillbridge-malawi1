import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { validateAssessmentDraft } from '../src/utils/assessmentEditorValidation.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261122000005_admin_assessment_editor.sql', import.meta.url),
  'utf8',
)
const adminPage = await readFile(
  new URL('../src/pages/admin/AdminModulePage.jsx', import.meta.url),
  'utf8',
)
const adminService = await readFile(
  new URL('../src/services/adminService.js', import.meta.url),
  'utf8',
)
const appRoutes = await readFile(
  new URL('../src/routes/AppRoutes.jsx', import.meta.url),
  'utf8',
)

const validQuestion = {
  question: 'Which option demonstrates safe practice?',
  options: ['Check the result', 'Skip validation', 'Ignore the request', 'Use unrelated data'],
  correct_answer: 'Check the result',
  points: 2,
}

const validAssessment = {
  title: 'Data fundamentals',
  description: 'A short assessment of data fundamentals.',
  assessment_type: 'skill',
  duration_minutes: 20,
  passing_score: 70,
  questions: [validQuestion],
}

test('assessment draft accepts valid multiple-choice content', () => {
  assert.equal(validateAssessmentDraft(validAssessment), '')
})

test('assessment draft reports missing questions, duplicate options, and invalid answers inline', () => {
  assert.match(validateAssessmentDraft({ ...validAssessment, questions: [{ ...validQuestion, question: '' }] }), /question 1/i)
  assert.match(validateAssessmentDraft({ ...validAssessment, questions: [{ ...validQuestion, options: ['Same', 'Same'], correct_answer: 'Same' }] }), /duplicate/i)
  assert.match(validateAssessmentDraft({ ...validAssessment, questions: [{ ...validQuestion, correct_answer: 'Not an option' }] }), /correct answer/i)
})

test('assessment editor saves only draft content and protects published or attempted assessments', () => {
  assert.match(appRoutes, /path="\/admin\/assessments\/create"/)
  assert.match(appRoutes, /path="\/admin\/assessments\/:id\/edit"/)
  assert.match(adminPage, /pathname\.endsWith\('\/create'\) \? <AssessmentEditor/)
  assert.match(adminPage, /pathname\.endsWith\('\/edit'\) \? <AssessmentEditor/)
  assert.match(adminPage, /Draft saved - not visible to students until published\./)
  assert.match(adminService, /if \(status === 'published'\)[\s\S]*if \(!questionCount\) throw new Error\('Add at least one question before publishing this assessment\.'/)
  assert.match(migration, /auth\.uid\(\) is null or not public\.is_admin\(\)/)
  assert.match(migration, /'draft'\s*\)\s*returning id/i)
  assert.match(migration, /current_status = 'published'[\s\S]*Move the assessment to draft/)
  assert.match(migration, /assessment_results where assessment_id = p_assessment_id/)
  assert.match(migration, /revoke all on function public\.admin_save_assessment[\s\S]*from public, anon/i)
  assert.match(migration, /grant execute on function public\.admin_save_assessment[\s\S]*to authenticated/i)
  assert.doesNotMatch(migration, /set\s+status\s*=/i)
})
