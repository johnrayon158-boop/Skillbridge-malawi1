import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCareerRecommendations } from '../server/services/ai/aiScoringService.js'
import { createCareerRecommendationHandler } from '../server/services/ai/careerRecommendationHandler.js'

const candidateData = {
  profile: {
    id: 'student-1',
    role: 'student',
    student_profiles: [{
      target_role: 'Data Analyst',
      career_goal: 'I want to use data to inform public policy and improve decisions.',
      education_level: 'Bachelor',
    }],
  },
  skills: [
    { level: 'advanced', skills: { name: 'SQL' } },
    { level: 'beginner', skills: { name: 'Statistics' } },
  ],
  assessments: [{ percentage: 88, assessments: { skills: { name: 'SQL' } } }],
  education: [{ qualification: 'Bachelor of Science', education_level: 'Bachelor' }],
  interests: ['Data analysis'],
  careers: [
    {
      id: 'career-data',
      title: 'Data Analyst',
      sector: 'Data analysis',
      preferred_education: 'Bachelor',
      career_skills: [
        { required_level: 'intermediate', importance: 5, skills: { name: 'SQL' } },
        { required_level: 'advanced', importance: 2, skills: { name: 'Statistics' } },
        { required_level: 'beginner', importance: 1, skills: { name: 'Data visualization' } },
      ],
    },
    {
      id: 'career-project',
      title: 'Project Coordinator',
      career_skills: [{ required_level: 'beginner', skills: { name: 'Planning' } }],
    },
  ],
}

function createHarness({ user = { id: 'student-1' }, data = candidateData } = {}) {
  const responses = []
  const saved = []
  const handler = createCareerRecommendationHandler({
    authenticate: async () => user,
    loadData: async () => data,
    saveRecommendations: async (userId, recommendations) => saved.push({ userId, recommendations }),
    sendJson: (_res, status, body) => responses.push({ status, body }),
    errorResponse: (error, statusCode) => ({ ok: false, error, statusCode }),
  })
  return {
    call: async () => {
      responses.length = 0
      await handler({}, {})
      return responses[0]
    },
    saved,
  }
}

test('career recommendations score real skills, education, interests, goals, and skill-specific assessments', () => {
  const result = calculateCareerRecommendations(candidateData)
  const dataAnalyst = result.recommendations.find((item) => item.career_id === 'career-data')
  const projectCoordinator = result.recommendations.find((item) => item.career_id === 'career-project')

  assert.ok(dataAnalyst.overall_score > projectCoordinator.overall_score)
  assert.equal(dataAnalyst.factors.education, 100)
  assert.equal(dataAnalyst.factors.assessments, 88)
  assert.equal(dataAnalyst.factors.interests, 100)
  assert.equal(dataAnalyst.preference_score, 100)
  assert.deepEqual(dataAnalyst.strong_skills, ['SQL'])
  assert.deepEqual(dataAnalyst.developing_skills, ['Statistics'])
  assert.deepEqual(dataAnalyst.missing_skills, ['Data visualization'])
  assert.match(dataAnalyst.explanation, /skills, education, assessments, interests, preference/)
  assert.equal(result.model, 'deterministic-scoring')
})

test('career-goal descriptions do not act as a target-role search when no occupation is selected', () => {
  const result = calculateCareerRecommendations({
    ...candidateData,
    profile: {
      student_profiles: [{
        career_goal: 'I hope to become a Data Analyst and support better decisions.',
      }],
    },
  })

  assert.equal(result.recommendations.find((item) => item.career_id === 'career-data').preference_score, null)
})

test('career scoring handles missing profile evidence without fabricated career records', () => {
  const result = calculateCareerRecommendations({ profile: {}, careers: candidateData.careers })
  assert.equal(result.recommendations.length, 2)
  assert.ok(result.recommendations.every((item) => item.overall_score === 0))
  assert.ok(result.recommendations.every((item) => item.factors.skills === 0))
  assert.ok(result.recommendations.every((item) => item.missing_skills.length > 0))
})

test('career scoring uses recorded fields of study against actual career information when no education level is specified', () => {
  const result = calculateCareerRecommendations({
    profile: {},
    education: [{ programme: 'Data Science and Statistics' }],
    careers: [{
      id: 'career-research',
      title: 'Research Analyst',
      sector: 'Research',
      description: 'Analyze datasets and report statistics and statistical findings for decision making.',
      career_skills: [],
    }],
  }).recommendations[0]

  assert.equal(result.education_score, 33)
  assert.equal(result.factors.education, 33)
})

test('career recommendations use only validated and candidate-acknowledged employer ratings', () => {
  const career = candidateData.careers[0]
  const qualified = {
    id: 'employer-1',
    status: 'validated',
    employer_feedback_competencies: [{ name: 'SQL', rating: 4, not_observed: false }],
    employer_feedback_acknowledgements: [{ student_id: 'student-1', status: 'acknowledged' }],
  }
  const unacknowledged = {
    ...qualified,
    employer_feedback_acknowledgements: [{ student_id: 'student-1', status: 'pending' }],
  }

  const accepted = calculateCareerRecommendations({ ...candidateData, employerFeedback: [qualified] })
    .recommendations.find((item) => item.career_id === career.id)
  const excluded = calculateCareerRecommendations({ ...candidateData, employerFeedback: [unacknowledged] })
    .recommendations.find((item) => item.career_id === career.id)

  assert.equal(accepted.employer_feedback_score, 80)
  assert.equal(accepted.factors.employer_feedback, 80)
  assert.equal(excluded.employer_feedback_score, null)
  assert.ok(Object.hasOwn(accepted.factors, 'employer_feedback'))
  assert.ok(!Object.hasOwn(excluded.factors, 'employer_feedback'))
})

test('career recommendations use the latest assessment per required skill rather than double counting retries', () => {
  const result = calculateCareerRecommendations({
    ...candidateData,
    assessments: [
      { assessment_id: 'sql-test', percentage: 35, completed_at: '2026-01-01', assessments: { skills: { name: 'SQL' } } },
      { assessment_id: 'sql-test', percentage: 92, completed_at: '2026-02-01', assessments: { skills: { name: 'SQL' } } },
    ],
  }).recommendations.find((item) => item.career_id === 'career-data')

  assert.equal(result.assessment_score, 92)
})

test('career recommendation API authenticates, returns explainable scores, and saves results for the caller', async () => {
  const { call, saved } = createHarness()
  const response = await call()
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(response.body.data.model, 'deterministic-scoring')
  assert.equal(saved.length, 1)
  assert.equal(saved[0].userId, 'student-1')
  assert.ok(saved[0].recommendations[0].factors)
})

test('career recommendation API rejects anonymous and unauthorized roles', async () => {
  const unauthenticated = createHarness({ user: null })
  const unauthorized = createHarness({ data: { ...candidateData, profile: { role: 'employer' } } })

  assert.equal((await unauthenticated.call()).status, 401)
  assert.equal((await unauthorized.call()).status, 403)
  assert.equal(unauthorized.saved.length, 0)
})

test('career recommendation API reports missing student profiles without scoring fake records', async () => {
  const harness = createHarness({ data: { ...candidateData, profile: null } })
  const response = await harness.call()
  assert.equal(response.status, 404)
  assert.equal(harness.saved.length, 0)
})
