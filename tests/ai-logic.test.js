import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateEvidenceTrust } from '../server/services/evidenceTrustService.js'
import { generateInterviewPreparation } from '../server/services/ai/interviewPreparationService.js'

test('evidence trust does not assign numeric scores to project or uploaded certificate evidence', () => {
  const result = calculateEvidenceTrust({
    skillName: 'React',
    evidence: [
      { type: 'assessment', strength: 90, score: 90 },
      { type: 'project', strength: 84, evidenceStatus: 'student_submitted' },
      { type: 'certificate', strength: 88, evidenceStatus: 'uploaded_not_verified' },
    ],
  })

  assert.equal(result.score, 90)
  assert.equal(result.label, 'Strong scored evidence')
  assert.equal(result.scoredEvidenceCount, 1)
})

test('employer scores are weighted by category averages and only qualified feedback counts', () => {
  const result = calculateEvidenceTrust({
    evidence: [
      { type: 'assessment', score: 90 },
      { type: 'assessment', score: 70 },
      { type: 'employer', score: 100, evidenceStatus: 'reviewed_by_employer' },
      { type: 'employer', score: 100, evidenceStatus: 'student_submitted' },
    ],
  })

  assert.equal(result.score, 86)
  assert.equal(result.scoredEvidenceCount, 3)
  assert.equal(result.reviewedFeedbackCount, 1)
})

test('interview preparation uses the role requirement list to create role-specific questions', () => {
  const result = generateInterviewPreparation({
    userId: 'student-1',
    jobId: 'job-1',
    candidateSkills: ['React', 'Communication'],
    jobRequirements: {
      title: 'Frontend Developer',
      job_skills: [
        { skills: { name: 'React' } },
        { skills: { name: 'Communication' } },
        { skills: { name: 'Testing' } },
      ],
    },
    identifiedGaps: [{ skill: 'Testing' }],
  })

  assert.ok(result.requiredSkills.includes('Testing'))
  assert.ok(result.summary.length > 0)
  assert.ok(result.technicalQuestions.length >= 1)
  assert.ok(result.revisionTopics.some((topic) => topic === 'Testing'))
})
