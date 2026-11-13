import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateEvidenceTrust, aggregateSkillEvidence, getValidatedEmployerCompetencies } from '../server/services/evidenceTrustService.js'
import { buildStudentProfileChanges, normalizeCareerInterests } from '../src/utils/careerInterests.js'
import { buildEmployerFeedbackSubmission } from '../src/utils/employerFeedbackRules.js'

test('target occupation, career-goal description, and career interests remain distinct profile fields', () => {
  assert.deepEqual(normalizeCareerInterests('Data science, Public health, data science'), ['Data science', 'Public health'])
  assert.deepEqual(buildStudentProfileChanges({
    target_role: '  Data Analyst  ',
    career_goal: 'I want to use data to inform public policy.',
    interests: 'Data science, Public health',
  }), {
    target_role: 'Data Analyst',
    career_goal: 'I want to use data to inform public policy.',
    interests: ['Data science', 'Public health'],
  })
  assert.equal(buildStudentProfileChanges({ target_role: ' ' }).target_role, null)
  assert.throws(() => buildStudentProfileChanges({ target_role: 'x'.repeat(121) }), /120 characters/)
  assert.throws(() => normalizeCareerInterests('x'.repeat(81)), /80 characters/)
})

test('evidence links only by explicit skill associations and does not score uploaded files or self-entered strength', () => {
  const evidence = aggregateSkillEvidence({
    userSkills: [{ level: 'advanced', skills: { name: 'React' } }],
    assessmentResults: [{ id: 'assessment-1', percentage: 84, assessments: { title: 'React Assessment', skills: { name: 'React' } } }],
    projects: [
      { id: 'project-1', title: 'UI build', project_skills: [{ skills: { name: 'React' } }] },
      { id: 'project-2', title: 'Unlinked React experience', project_skills: [] },
    ],
    certificates: [{
      id: 'certificate-1',
      title: 'React Training',
      file_path: 'student/certificate.pdf',
      verification_status: 'verified',
      certificate_skills: [{ skills: { name: 'React' } }],
    }],
    skillEvidence: [{
      id: 'evidence-1',
      skillName: 'React',
      evidence_type: 'other',
      evidence_strength: 99,
      verification_status: 'pending',
    }],
    skillName: 'React',
  })

  assert.deepEqual(evidence.map((item) => item.type), ['self_reported', 'assessment', 'project', 'certificate', 'other'])
  assert.equal(evidence.find((item) => item.type === 'assessment').score, 84)
  assert.equal(evidence.find((item) => item.type === 'project').score, null)
  assert.equal(evidence.find((item) => item.type === 'certificate').evidenceStatus, 'uploaded_not_verified')
  assert.equal(evidence.find((item) => item.type === 'other').score, null)
  assert.ok(!evidence.some((item) => item.projectId === 'project-2'))
})

test('only validated, candidate-acknowledged and observed employer ratings qualify', () => {
  const feedback = [
    {
      id: 'pending',
      status: 'submitted',
      employer_feedback_competencies: [{ name: 'SQL', rating: 5 }],
      employer_feedback_acknowledgements: [{ student_id: 'student-1', status: 'acknowledged' }],
    },
    {
      id: 'unacknowledged',
      status: 'validated',
      employer_feedback_competencies: [{ name: 'SQL', rating: 5 }],
      employer_feedback_acknowledgements: [{ student_id: 'student-1', status: 'pending' }],
    },
    {
      id: 'qualified',
      status: 'validated',
      review_date: '2026-10-01',
      employer_feedback_competencies: [
        { name: 'SQL', rating: 4 },
        { name: 'Communication', rating: 5, not_observed: true },
        { name: 'Accessibility', rating: null },
      ],
      employer_feedback_acknowledgements: [{ student_id: 'student-1', status: 'acknowledged' }],
    },
  ]

  const ratings = getValidatedEmployerCompetencies(feedback, 'student-1')
  assert.equal(ratings.length, 1)
  assert.equal(ratings[0].score, 80)
  assert.equal(ratings[0].evidenceStatus, 'reviewed_by_employer')
  assert.equal(calculateEvidenceTrust({ evidence: ratings }).score, 80)
  assert.equal(getValidatedEmployerCompetencies(feedback, '').length, 0)
})

test('employer feedback submissions always enter review instead of self-validating', () => {
  const payload = buildEmployerFeedbackSubmission({
    employer_id: 'employer-1',
    candidate_id: 'student-1',
    status: 'validated',
    verification_status: 'verified',
  })

  assert.equal(payload.status, 'submitted')
  assert.equal(payload.created_by, 'employer-1')
  assert.equal(payload.candidate_id, 'student-1')
})

test('evidence with no numeric assessment or qualified employer score remains unscored', () => {
  const result = calculateEvidenceTrust({
    evidence: [
      { type: 'project', score: null, evidenceStatus: 'student_submitted' },
      { type: 'certificate', score: null, evidenceStatus: 'uploaded_not_verified' },
    ],
  })

  assert.equal(result.score, null)
  assert.equal(result.label, 'Supporting evidence only')
})
