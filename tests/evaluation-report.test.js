import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { calculateEvaluationReport } from '../src/utils/evaluationMetrics.js'
import { evaluateSkillsGapCases, SKILLS_GAP_EVALUATION_CASES } from '../src/utils/skillsGapEvaluation.js'

const migrationUrl = new URL('../supabase/migrations/20261014000002_evaluation_reporting.sql', import.meta.url)

test('skills-gap evaluation cases compare outputs to explicit expected results', () => {
  const results = evaluateSkillsGapCases()
  assert.equal(results.length, SKILLS_GAP_EVALUATION_CASES.length)
  assert.deepEqual(results.map((item) => item.passed), [true, true, true, true])
  assert.deepEqual(results.map((item) => item.actual), SKILLS_GAP_EVALUATION_CASES.map((item) => item.expected))
})

test('evaluation calculations use actual samples and return conventional reviewed matching metrics', () => {
  const report = calculateEvaluationReport({
    careerFeedback: [
      { relevance_rating: 5, suitability_rating: 4, is_useful: true },
      { relevance_rating: 3, suitability_rating: 2, is_useful: false },
      { relevance_rating: null, suitability_rating: null },
    ],
    assessmentResults: [
      { score: 80, passed: true, completed_at: '2026-10-01T00:00:00Z' },
      { score: 60, passed: false, completed_at: '2026-10-02T00:00:00Z' },
      { score: null, passed: null, completed_at: null },
    ],
    matchReviews: [
      { candidate_id: 'a', job_id: '1', expected_match: true },
      { candidate_id: 'b', job_id: '1', expected_match: false },
      { candidate_id: 'c', job_id: '1', expected_match: true },
      { candidate_id: 'd', job_id: '1', expected_match: false },
      { candidate_id: 'e', job_id: '1', expected_match: true },
    ],
    jobMatches: [
      { student_id: 'a', job_id: '1', match_score: 80 },
      { student_id: 'b', job_id: '1', match_score: 70 },
      { student_id: 'c', job_id: '1', match_score: 40 },
      { student_id: 'd', job_id: '1', match_score: 20 },
    ],
    usabilityResponses: [
      { ease_of_use: 4, navigation_clarity: 3, task_completion: 5, trust_in_recommendations: 4, overall_satisfaction: 5 },
      { ease_of_use: 2, navigation_clarity: 5, task_completion: 3, trust_in_recommendations: 2, overall_satisfaction: 3 },
    ],
    openFeedbackCount: 1,
  })

  assert.equal(report.recommendationRelevance.relevance.average, 4)
  assert.equal(report.recommendationRelevance.relevance.sampleSize, 2)
  assert.equal(report.recommendationRelevance.suitability.average, 3)
  assert.equal(report.recommendationRelevance.legacyUsefulPercentage, 50)
  assert.equal(report.assessmentPerformance.resultRows, 3)
  assert.equal(report.assessmentPerformance.scoredSampleSize, 2)
  assert.equal(report.assessmentPerformance.averageScore, 70)
  assert.equal(report.assessmentPerformance.passRate, 50)
  assert.equal(report.assessmentPerformance.completionRate, null)
  assert.deepEqual([
    report.matchingAccuracy.truePositive,
    report.matchingAccuracy.falsePositive,
    report.matchingAccuracy.falseNegative,
    report.matchingAccuracy.trueNegative,
  ], [1, 1, 1, 1])
  assert.equal(report.matchingAccuracy.sampleSize, 4)
  assert.equal(report.matchingAccuracy.unscoredExamples, 1)
  assert.equal(report.matchingAccuracy.accuracy, 50)
  assert.equal(report.matchingAccuracy.precision, 50)
  assert.equal(report.matchingAccuracy.recall, 50)
  assert.equal(report.matchingAccuracy.f1, 50)
  assert.equal(report.usability.respondentCount, 2)
  assert.equal(report.userSatisfaction.average, 4)
  assert.equal(report.usability.openFeedbackCount, 1)
})

test('empty evaluation data is reported unavailable rather than as a fabricated zero score', () => {
  const report = calculateEvaluationReport()
  assert.equal(report.recommendationRelevance.relevance.average, null)
  assert.equal(report.recommendationRelevance.relevance.sampleSize, 0)
  assert.equal(report.assessmentPerformance.averageScore, null)
  assert.equal(report.assessmentPerformance.passRate, null)
  assert.equal(report.matchingAccuracy.accuracy, null)
  assert.equal(report.matchingAccuracy.precision, null)
  assert.equal(report.matchingAccuracy.recall, null)
  assert.equal(report.matchingAccuracy.f1, null)
  assert.equal(report.matchingAccuracy.unavailableReason !== null, true)
  assert.equal(report.userSatisfaction.average, null)
  assert.equal(report.userSatisfaction.unavailableReason !== null, true)
})

test('evaluation writes and matching-reference review enforce authenticated access and valid data', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const evaluationFunction = sql.match(/create or replace function public\.submit_platform_evaluation[\s\S]*?\n\$\$;/i)?.[0] || ''
  const reviewFunction = sql.match(/create or replace function public\.save_job_match_evaluation_example[\s\S]*?\n\$\$;/i)?.[0] || ''

  assert.match(sql, /alter table public\.platform_evaluations enable row level security/i)
  assert.match(sql, /user_id = auth\.uid\(\) or public\.is_admin\(\)/i)
  assert.match(sql, /primary key \(user_id, survey_version\)/i)
  assert.match(evaluationFunction, /v_user_id uuid := auth\.uid\(\)/i)
  assert.match(evaluationFunction, /v_role is null or v_role not in \('student', 'graduate', 'employer'\)/i)
  assert.match(evaluationFunction, /v_answers\.ease_of_use is null or v_answers\.ease_of_use not between 1 and 5/i)
  assert.match(evaluationFunction, /on conflict \(user_id, survey_version\) do update/i)
  assert.match(reviewFunction, /not public\.is_admin\(\)/i)
  assert.match(reviewFunction, /m\.student_id = p_candidate_id and m\.job_id = p_job_id/i)
  assert.match(reviewFunction, /j\.status = 'published'/i)
  assert.match(sql, /grant execute on function public\.submit_platform_evaluation\(jsonb, text\) to authenticated/i)
  assert.match(sql, /grant execute on function public\.save_job_match_evaluation_example\(uuid, uuid, boolean\) to authenticated/i)

  const routes = await readFile(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8')
  assert.match(routes, /path="\/evaluation"[\s\S]*?allowedRoles=\{\['student', 'graduate', 'employer'\]\}/i)
  assert.match(routes, /path="\/admin\/evaluation"[\s\S]*?allowedRoles=\{\['admin'\]\}/i)
})
