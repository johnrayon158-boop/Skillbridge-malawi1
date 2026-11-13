import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCareerReadiness, CAREER_READINESS_WEIGHTS } from '../src/algorithms/careerReadiness.js'

test('readiness uses actual records with separate self-reported and assessed signals', () => {
  const result = calculateCareerReadiness({
    skills: [{ id: 'skill-1', level: 'intermediate' }],
    assessments: [
      { id: 'old-attempt', assessment_id: 'sql', percentage: 10, completed_at: '2026-01-01' },
      { id: 'new-attempt', assessment_id: 'sql', percentage: 90, completed_at: '2026-02-01' },
    ],
    portfolio: { id: 'portfolio-1' },
    certificates: [
      {
        verification_status: 'verified',
        verification_method: 'issuer_confirmation',
        verified_by: 'admin-1',
        verified_at: '2026-02-01',
      },
      { verification_status: 'pending' },
    ],
    employment: [{ id: 'employment-1' }],
    projects: [{ status: 'completed' }],
    learningProgress: [
      { status: 'in_progress', progress: 50 },
      { status: 'completed', progress: 100 },
    ],
  })

  assert.equal(Object.values(CAREER_READINESS_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100)
  assert.equal(result.skills_score, 60)
  assert.equal(result.assessment_score, 90)
  assert.equal(result.certificate_score, 50)
  assert.equal(result.projects_score, 100)
  assert.equal(result.learning_score, 75)
  assert.equal(result.readiness_score, 76)
  assert.equal(result.evidence_counts.assessments, 1)
  assert.equal(result.evidence_availability.learning, true)
})

test('incomplete profiles receive no fabricated evidence or readiness credit', () => {
  const result = calculateCareerReadiness({})

  assert.equal(result.readiness_score, null)
  assert.equal(result.skills_score, null)
  assert.equal(result.assessment_score, null)
  assert.equal(result.evidence_counts.assessments, 0)
  assert.equal(result.evidence_availability.learning, false)
})

test('career skill coverage uses requirement levels and returns explicit missing or insufficient gaps', () => {
  const result = calculateCareerReadiness({
    skills: [{ level: 'intermediate', skills: { name: 'SQL' } }],
    targetCareer: {
      title: 'Data Analyst',
      career_skills: [
        { required_level: 'advanced', skills: { name: 'SQL' } },
        { required_level: 'beginner', skills: { name: 'Statistics' } },
      ],
    },
  })

  assert.equal(result.target_career, 'Data Analyst')
  assert.equal(result.skills_score, 57)
  assert.deepEqual(result.skill_gaps.map((gap) => [gap.name, gap.gap, gap.currentLevel, gap.requiredLevel]), [
    ['SQL', 'insufficient', 'Intermediate', 'Advanced'],
    ['Statistics', 'missing', 'Not recorded', 'Beginner'],
  ])
})
