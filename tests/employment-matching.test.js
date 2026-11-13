import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPLOYMENT_MATCH_WEIGHTS, matchCandidateToJob } from '../src/algorithms/employmentMatching.js'
import { rankItems } from '../src/algorithms/ranking.js'
import { calculateJobMatches } from '../server/services/ai/aiScoringService.js'

const job = {
  id: 'job-data',
  title: 'Data Analyst',
  status: 'published',
  education_required: 'Bachelor',
  experience_required: '2 years',
  job_skills: [
    { required_level: 'intermediate', importance: 3, skills: { name: 'SQL' } },
    { required_level: 'advanced', importance: 1, skills: { name: 'Statistics' } },
    { required_level: 'beginner', importance: 1, skills: { name: 'Data visualization' } },
  ],
}

test('job matching compares skill levels and explains matches, development gaps, and factors', () => {
  const result = matchCandidateToJob({
    skills: [
      { name: 'SQL', level: 'advanced' },
      { name: 'Statistics', level: 'intermediate' },
    ],
    education: [{ qualification: 'Bachelor of Science', education_level: 'Bachelor' }],
    assessments: [{ percentage: 84, skills: { name: 'SQL' } }],
    projects: [{ title: 'Data dashboard', project_skills: [{ skills: { name: 'Data visualization' } }] }],
    profile: { student_profiles: [{ years_experience: 1 }] },
  }, job)

  assert.deepEqual(result.matches, ['SQL'])
  assert.deepEqual(result.developing_skills, ['Statistics'])
  assert.deepEqual(result.gaps, ['Data visualization'])
  assert.equal(result.education_score, 100)
  assert.equal(result.assessment_score, 84)
  assert.equal(result.project_score, 33)
  assert.ok(result.overallMatch > 0)
  assert.match(result.explanation, /1 required skills meet the target proficiency/)
  assert.equal(result.factors.skills < 100, true)
})

test('preferred skills remain distinct and do not become missing requirements', () => {
  const result = matchCandidateToJob(
    { skills: [{ name: 'SQL', level: 'advanced' }] },
    {
      job_skills: [
        { skill_id: 'required-sql', is_required: true, required_level: 'intermediate', skills: { name: 'SQL' } },
        { skill_id: 'preferred-power-bi', is_required: false, required_level: 'intermediate', skills: { name: 'Power BI' } },
      ],
    },
  )

  assert.deepEqual(result.required_matches, ['SQL'])
  assert.deepEqual(result.preferred_missing_skills, ['Power BI'])
  assert.deepEqual(result.gaps, [])
  assert.match(result.explanation, /preferred skills are not recorded and do not count as missing requirements/)
})

test('job matching handles incomplete candidate records without throwing or inventing evidence', () => {
  const result = matchCandidateToJob({}, job)
  assert.equal(result.overallMatch, 0)
  assert.deepEqual(result.matches, [])
  assert.deepEqual(result.gaps, ['SQL', 'Statistics', 'Data visualization'])
  assert.equal(result.education_score, 0)
  assert.equal(result.assessment_score, null)
})

test('employment matching uses the selected target role first and treats the goal description as supporting context', () => {
  const candidate = {
    profile: {
      student_profiles: [{
        target_role: 'Software Developer',
        career_goal: 'I hope to work in public health and improve rural nursing access.',
      }],
    },
  }
  const softwareJob = matchCandidateToJob(candidate, { title: 'Software Developer' })
  const healthJob = matchCandidateToJob(candidate, { title: 'Public Health Nurse' })

  assert.equal(softwareJob.career_target_score, 100)
  assert.ok(softwareJob.career_target_score > healthJob.career_target_score)
})

test('job matching does not award skill-evidence scores when the vacancy has no requirements', () => {
  const result = matchCandidateToJob(
    { projects: [{ title: 'Data project', project_skills: [] }], portfolio: { title: 'Portfolio' } },
    { id: 'job-without-requirements', job_skills: [] },
  )
  assert.equal(result.skills_score, null)
  assert.equal(result.project_score, null)
  assert.equal(result.portfolio_score, null)
  assert.equal(result.overallMatch, 0)
})

test('assessment evidence uses the latest relevant result once and stays separate from self-reported skills', () => {
  const result = matchCandidateToJob({
    skills: [{ name: 'SQL', level: 'advanced' }],
    assessments: [
      { assessment_id: 'sql-assessment', percentage: 20, completed_at: '2026-01-01', assessments: { skills: { name: 'SQL' } } },
      { assessment_id: 'sql-assessment', percentage: 90, completed_at: '2026-02-01', assessments: { skills: { name: 'SQL' } } },
      { assessment_id: 'other-assessment', percentage: 100, completed_at: '2026-02-01', assessments: { skills: { name: 'Unrelated' } } },
    ],
  }, { job_skills: [{ required_level: 'beginner', skills: { name: 'SQL' } }] })

  assert.equal(result.assessment_score, 90)
  assert.equal(result.skills_score, 100)
  assert.equal(result.factors.assessments, 90)
  assert.equal(Object.values(EMPLOYMENT_MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1)
  assert.match(result.explanation, /assessed results are scored separately/)
})

test('job-specific assessment results contribute to their matching vacancy only', () => {
  const result = matchCandidateToJob({
    assessments: [
      { assessment_id: 'assigned-1', percentage: 88, assessments: { job_id: job.id } },
      { assessment_id: 'assigned-2', percentage: 100, assessments: { job_id: 'another-job' } },
    ],
  }, job)

  assert.equal(result.assessment_score, 88)
})

test('backend job matches rank and return only published opportunities', () => {
  const matches = calculateJobMatches({
    jobs: [
      { ...job, id: 'unpublished', status: 'closed' },
      { ...job, id: 'job-lower', job_skills: [{ required_level: 'expert', skills: { name: 'SQL' } }] },
      { ...job, id: 'job-higher', job_skills: [{ required_level: 'beginner', skills: { name: 'SQL' } }] },
    ],
    studentSkills: [{ name: 'SQL', level: 'advanced' }],
  }).matches

  assert.deepEqual(matches.map((item) => item.job_id), ['job-higher', 'job-lower'])
  assert.ok(matches.every((item) => item.factors.skills !== undefined))
})

test('ranking uses score aliases and preserves input order for tied scores', () => {
  const ranked = rankItems([
    { id: 'low', match_score: 20 },
    { id: 'first-tie', overall_score: 60 },
    { id: 'second-tie', score: 60 },
    { id: 'high', overallMatch: 90 },
    { id: 'not-a-score', score: 'unknown' },
  ])
  assert.deepEqual(ranked.map((item) => item.id), ['high', 'first-tie', 'second-tie', 'low', 'not-a-score'])
})
