import assert from 'node:assert/strict'
import test from 'node:test'
import { INTERNSHIP_MATCH_WEIGHTS, matchInternship } from '../src/utils/internshipMatching.js'

const completeStudent = {
  programme: 'Computer Science',
  education_level: 'Bachelor degree',
  target_role: 'Software engineering placement',
  career_goal: 'Software engineering placement',
  current_year_of_study: 3,
  preferred_location: 'Lilongwe',
  available_from: '2026-06-01',
  available_to: '2026-12-01',
  user_skills: [{ skill_id: 'js', level: 'advanced', skills: { name: 'JavaScript' } }],
  projects: [{ id: 'project-1' }, { id: 'project-2' }, { id: 'project-3' }, { id: 'project-4' }],
  assessment_results: [{ id: 'assessment-1' }, { id: 'assessment-2' }],
  certificates: [{ id: 'certificate-1' }, { id: 'certificate-2' }],
}

const opportunity = {
  title: 'Software engineering placement',
  description: 'Build software products',
  location: 'Lilongwe',
  placement_start_date: '2026-07-01',
  placement_end_date: '2026-10-01',
  eligible_programmes: ['Computer Science'],
  min_study_year: 2,
  max_study_year: 4,
  education_required: 'Bachelor',
  job_skills: [{
    skill_id: 'js',
    required_level: 'intermediate',
    importance: 50,
    is_required: true,
    skills: { name: 'JavaScript' },
  }],
}

test('match weights total 100 and a complete eligible profile gets a full match', () => {
  assert.equal(Object.values(INTERNSHIP_MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100)
  const result = matchInternship(completeStudent, opportunity)
  assert.equal(result.score, 100)
  assert.equal(result.eligible, true)
  assert.equal(result.eligibilityPending, false)
  assert.equal(result.factors.assessments, null)
  assert.equal(result.factors.career, 100)
})

test('internship matching prioritizes the selected target role over a conflicting career-goal description', () => {
  const student = {
    target_role: 'Software Developer',
    career_goal: 'I hope to work in public health and improve rural nursing access.',
  }
  const softwareMatch = matchInternship(student, {
    title: 'Software Developer',
    department: 'Engineering',
    employer_profiles: { industry: 'Technology' },
  })
  const healthMatch = matchInternship(student, {
    title: 'Public Health Nurse',
    department: 'Rural Health',
    employer_profiles: { industry: 'Healthcare' },
  })

  assert.ok(softwareMatch.factors.career > healthMatch.factors.career)
})

test('unknown profile data remains provisional and does not invent a hard mismatch', () => {
  const result = matchInternship({}, { ...opportunity, job_skills: [] })
  assert.equal(result.eligible, true)
  assert.equal(result.eligibilityPending, true)
  assert.equal(result.provisional, true)
  assert.equal(result.score, null)
})

test('a known programme mismatch and missing required skill make the student ineligible', () => {
  const result = matchInternship({
    ...completeStudent,
    programme: 'Accounting',
    user_skills: [],
  }, opportunity)
  assert.equal(result.eligible, false)
  assert.match(result.eligibilityReasons.join(' '), /programme does not match/)
  assert.match(result.eligibilityReasons.join(' '), /Required skills not recorded/)
})

test('missing a preferred skill lowers the score without creating a hard rejection', () => {
  const result = matchInternship(completeStudent, {
    ...opportunity,
    job_skills: [{
      skill_id: 'excel',
      required_level: 'intermediate',
      importance: 50,
      is_required: false,
      skills: { name: 'Excel' },
    }],
  })
  assert.equal(result.eligible, true)
  assert.equal(result.skills[0].found, false)
  assert.equal(result.score < 100, true)
})

test('study-year and education eligibility checks are enforced', () => {
  const result = matchInternship({
    ...completeStudent,
    current_year_of_study: 1,
    education_level: 'Secondary',
  }, opportunity)
  assert.equal(result.eligible, false)
  assert.equal(result.eligibilityReasons.length, 2)
})

test('internship assessments contribute their actual relevant score, not a generic evidence count', () => {
  const result = matchInternship({
    ...completeStudent,
    assessment_results: [
      { assessment_id: 'js-test', percentage: 72, assessments: { skills: { name: 'JavaScript' } } },
      { assessment_id: 'other-test', percentage: 100, assessments: { skills: { name: 'Accounting' } } },
    ],
  }, opportunity)

  assert.equal(result.factors.assessments, 72)
  assert.equal(result.factors.evidence, 100)
  assert.ok(result.score < 100)
})

test('job-driven internship assessment evidence is accepted only for the matching opportunity', () => {
  const jobDrivenOpportunity = { ...opportunity, id: 'placement-1' }
  const result = matchInternship({
    assessment_results: [
      { id: 'job-test', assessment_id: 'job-assessment', percentage: 84, assessments: { job_id: 'placement-1' } },
      { id: 'other-test', assessment_id: 'other-assessment', percentage: 100, assessments: { job_id: 'placement-2' } },
    ],
  }, jobDrivenOpportunity)

  assert.equal(result.factors.assessments, 84)
})
