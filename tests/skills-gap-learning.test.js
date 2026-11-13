import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSkillGaps } from '../src/algorithms/skillGapAnalysis.js'
import { recommendLearning } from '../src/algorithms/learningRecommendation.js'
import { calculateSkillGaps } from '../server/services/ai/aiScoringService.js'
import { getRecommendationRows, getSafeResourceUrl, getSkillGapRows } from '../src/pages/student/skillInsightsViewModel.js'

test('skill-gap calculation compares normalized current skills with structured proficiency requirements', () => {
  const gaps = analyzeSkillGaps(
    [{ skills: { name: 'JavaScript' }, level: 'beginner' }],
    [
      { name: 'Java Script', required_level: 'advanced' },
      { name: 'SQL', required_level: 'intermediate' },
    ],
  )

  assert.equal(gaps.length, 2)
  assert.equal(gaps[0].gap, 'insufficient')
  assert.equal(gaps[0].currentLevel, 'Beginner')
  assert.equal(gaps[0].requiredLevel, 'Advanced')
  assert.equal(gaps[0].severity, 'high')
  assert.equal(gaps[1].gap, 'missing')
  assert.equal(gaps[1].currentLevel, 'Not assessed')
  assert.equal(gaps[1].requiredLevel, 'Intermediate')
})

test('skills with sufficient proficiency are not reported as gaps', () => {
  const gaps = analyzeSkillGaps(
    [{ name: 'SQL', level: 'expert' }],
    [{ name: 'SQL', required_level: 'advanced' }],
  )
  assert.deepEqual(gaps, [])
})

test('empty or incomplete profile skills and absent assessments do not prevent gap calculations', () => {
  const result = calculateSkillGaps({
    studentSkills: [],
    requiredSkills: [{ name: 'Communication', required_level: 'intermediate' }],
    learningResources: [],
  })
  assert.equal(result.gaps[0].gap, 'missing')
  assert.equal(result.gaps[0].requiredLevel, 'Intermediate')
  assert.deepEqual(result.strong_skills, [])
})

test('learning recommendations match resources and preserve only real resource links', () => {
  const recommendations = recommendLearning(
    [{ skill: 'Statistics', severity: 'high', gapSize: 40, currentLevel: 'Not assessed', requiredLevel: 'Intermediate' }],
    [{ id: 'resource-7', title: 'Statistics basics', url: 'https://learn.example/statistics', skills: { name: 'Statistics' } }],
  )
  assert.equal(recommendations[0].resourceId, 'resource-7')
  assert.equal(recommendations[0].resourceTitle, 'Statistics basics')
  assert.equal(recommendations[0].resourceUrl, 'https://learn.example/statistics')

  const noResource = recommendLearning([{ skill: 'SQL', severity: 'high' }], [])
  assert.equal(noResource[0].resourceId, null)
  assert.equal(noResource[0].resourceUrl, '')
})

test('learning resource matching never treats an empty resource skill as a match', () => {
  const recommendations = recommendLearning(
    [{ skill: 'SQL' }],
    [{ id: 'unrelated', title: 'General course', skills: { name: '' } }],
  )
  assert.equal(recommendations[0].resourceId, null)

  const nearMatch = recommendLearning(
    [{ skill: 'SQL' }],
    [{ id: 'nosql', title: 'NoSQL course', skills: { name: 'NoSQL' } }],
  )
  assert.equal(nearMatch[0].resourceId, null)
})

test('student insight view models expose gap and recommendation rows and reject unsafe resource links', () => {
  const gapRows = getSkillGapRows({
    skill_gaps: [{ skill: 'SQL' }],
    developing_skills: [{ skill: 'Excel' }],
  })
  assert.deepEqual(gapRows.map((row) => row.gap), ['missing', 'insufficient'])
  assert.deepEqual(getRecommendationRows({ recommendations: [{ skill: 'SQL' }] }), [{ skill: 'SQL' }])
  assert.equal(getSafeResourceUrl('javascript:alert(1)'), '')
  assert.equal(getSafeResourceUrl('https://learning.example/sql'), 'https://learning.example/sql')
})
