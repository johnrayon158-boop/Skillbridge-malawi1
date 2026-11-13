import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildCareerRecommendationRows } from '../server/services/ai/careerRecommendationPersistence.js'
import { calculateEvaluationReport } from '../src/utils/evaluationMetrics.js'

const migrationUrl = new URL('../supabase/migrations/20261120000001_evaluation_analytics_collection.sql', import.meta.url)

test('career recommendation persistence stores only allowlisted aggregate factor scores', () => {
  const rows = buildCareerRecommendationRows('student-1', [{
    career_id: 'career-1',
    overall_score: 72,
    explanation: 'Score based on skills and assessments.',
    strong_skills: ['Communication'],
    factors: { skills: 80, assessments: 60, email: 'private@example.test', career_goal: 'private goal', invalid: 101 },
    factor_weights: { skills: 75.4, education: 24.6, profile_text: 'private profile' },
  }])

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].factor_scores, { skills: 80, assessments: 60 })
  assert.deepEqual(rows[0].factor_weights, { skills: 75, education: 25 })
  assert.equal(JSON.stringify(rows[0]).includes('private@example.test'), false)
  assert.equal(JSON.stringify(rows[0]).includes('private profile'), false)
})

test('evaluation metrics use unique recommendation ratings and tracked assessment attempts', () => {
  const report = calculateEvaluationReport({
    careerFeedback: [
      { id: 'old', student_id: 'student-1', career_recommendation_id: 'rec-1', relevance_rating: 1, suitability_rating: 1, created_at: '2026-10-01' },
      { id: 'new', student_id: 'student-1', career_recommendation_id: 'rec-1', relevance_rating: 5, suitability_rating: 4, created_at: '2026-10-02' },
      { id: 'other', student_id: 'student-2', career_recommendation_id: 'rec-2', relevance_rating: 3, suitability_rating: 2, created_at: '2026-10-02' },
    ],
    recommendationActions: { sample_size: 4, accepted: 2, dismissed: 1, explored: 1 },
    assessmentResults: [
      { score: 80, passed: true, completed_at: '2026-10-02' },
      { score: 60, passed: false, completed_at: '2026-10-02' },
    ],
    assessmentAttempts: [
      { started_at: '2026-10-01', completed_at: '2026-10-02' },
      { started_at: '2026-10-01', completed_at: '2026-10-01' },
      { started_at: '2026-10-01', completed_at: null },
    ],
    usabilityResponses: [
      { user_id: 'student-1', workflow: 'assessments', overall_satisfaction: 4 },
      { user_id: 'student-1', workflow: 'career_recommendations', overall_satisfaction: 3 },
      { user_id: 'student-2', workflow: 'career_recommendations', overall_satisfaction: 5 },
    ],
  })

  assert.equal(report.recommendationRelevance.relevance.sampleSize, 2)
  assert.equal(report.recommendationRelevance.relevance.average, 4)
  assert.equal(report.recommendationEngagement.acceptanceRate, 50)
  assert.equal(report.recommendationEngagement.sampleSize, 4)
  assert.equal(report.assessmentPerformance.startedAttempts, 3)
  assert.equal(report.assessmentPerformance.completedAttempts, 2)
  assert.equal(report.assessmentPerformance.completionRate, (2 / 3) * 100)
  assert.equal(report.usability.respondentCount, 2)
  assert.equal(report.usability.byWorkflow.find((item) => item.workflow === 'career_recommendations').respondentCount, 2)
  assert.equal(report.usability.byWorkflow.find((item) => item.workflow === 'assessments').average, 4)
})

test('evaluation migration secures recommendation actions and stores attempt outcomes without answers', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const attemptTable = sql.match(/create table if not exists public\.assessment_attempts \([\s\S]*?\n\);/i)?.[0] || ''
  const interactionFunction = sql.match(/create or replace function public\.record_career_recommendation_interaction[\s\S]*?\n\$\$;/i)?.[0] || ''
  const submitFunction = sql.match(/create or replace function public\.submit_assessment_attempt[\s\S]*?\n\$\$;/i)?.[0] || ''

  assert.match(sql, /factor_scores jsonb not null default '\{\}'::jsonb/i)
  assert.match(sql, /interaction_status in \('accepted', 'dismissed', 'explored'\)/i)
  assert.match(interactionFunction, /where id = p_recommendation_id\s+and student_id = auth\.uid\(\)/i)
  assert.match(sql, /primary key \(user_id, survey_version, workflow\)/i)
  assert.match(sql, /workflow in \('general', 'career_recommendations', 'job_matching', 'assessments', 'learning'\)/i)
  assert.match(attemptTable, /client_request_id uuid not null/i)
  assert.match(attemptTable, /result_id uuid references public\.assessment_results/i)
  assert.doesNotMatch(attemptTable, /answers/i)
  assert.match(sql, /public\.start_assessment_attempt\(uuid, uuid\)/i)
  assert.match(submitFunction, /for update/i)
  assert.match(submitFunction, /public\.submit_assessment_result\(/i)
  assert.match(sql, /revoke all on function public\.submit_assessment_result\(uuid, uuid, jsonb, timestamptz\) from public, anon, authenticated/i)

  const assessmentService = await readFile(new URL('../src/services/assessmentService.js', import.meta.url), 'utf8')
  assert.match(assessmentService, /rpc\('start_assessment_attempt'/i)
  assert.match(assessmentService, /rpc\('submit_assessment_attempt'/i)
})
