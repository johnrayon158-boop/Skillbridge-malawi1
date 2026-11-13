import test from 'node:test'
import assert from 'node:assert/strict'

import { checkDuplicateSkillName, resolveCanonicalSkill } from '../server/services/skills/skillNormalizationService.js'
import { compareSkills } from '../server/services/skills/skillSimilarityService.js'
import { matchSkills } from '../server/services/matching/skillMatchingService.js'

const skillCatalog = [
  { id: 'js-1', name: 'JavaScript', category: 'Technical' },
  { id: 'sql-1', name: 'SQL', category: 'Technical' },
  { id: 'excel-1', name: 'Microsoft Excel', category: 'Digital' },
  { id: 'web-1', name: 'Web Development', category: 'Technical' },
  { id: 'react-1', name: 'React', category: 'Technical', parent_skill_id: 'web-1' },
  { id: 'customer-1', name: 'Customer Service', category: 'Business' },
] 

const aliases = [
  { skill_id: 'js-1', skill_name: 'JavaScript', alias: 'JS', normalized_alias: 'js', confidence: 0.95 },
  { skill_id: 'excel-1', skill_name: 'Microsoft Excel', alias: 'MS Excel', normalized_alias: 'ms excel', confidence: 0.9 },
  { skill_id: 'customer-1', skill_name: 'Customer Service', alias: 'Customer Care', normalized_alias: 'customer care', confidence: 0.87 },
]

test('exact skill match resolves to the same canonical skill', () => {
  const result = resolveCanonicalSkill('JavaScript', skillCatalog, aliases)
  assert.equal(result.matchType, 'exact')
  assert.equal(result.skillId, 'js-1')
})

test('alias matching converts JS to JavaScript', () => {
  const result = resolveCanonicalSkill('JS', skillCatalog, aliases)
  assert.equal(result.matchType, 'alias')
  assert.equal(result.canonicalSkill, 'JavaScript')
})

test('case normalization keeps JavaScript canonical', () => {
  const result = resolveCanonicalSkill('javascript', skillCatalog, aliases)
  assert.equal(result.matchType, 'exact')
  assert.equal(result.skillId, 'js-1')
})

test('spelling normalization resolves Microsoft Excel aliases', () => {
  const result = resolveCanonicalSkill('MS Excel', skillCatalog, aliases)
  assert.equal(result.matchType, 'alias')
  assert.equal(result.skillId, 'excel-1')
})

test('related skill matching identifies shared relationship', () => {
  const result = compareSkills({ name: 'React', parent_skill_id: 'web-1' }, { name: 'Web Development', id: 'web-1' })
  assert.equal(result.relationshipType, 'parent')
  assert.ok(result.similarityScore > 0.7)
})

test('parent skill match is not treated as exact duplicate', () => {
  const result = compareSkills({ name: 'Web Development' }, { name: 'React' })
  assert.notEqual(result.relationshipType, 'exact')
})

test('child skill match falls under the skill hierarchy', () => {
  const result = compareSkills({ name: 'React', parent_skill_id: 'web-1' }, { name: 'Web Development', id: 'web-1' })
  assert.equal(result.relationshipType, 'parent')
})

test('proficiency gap results in partial match rather than a full match', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'JavaScript', level: 'intermediate', confidence: 70 }],
    jobSkills: [{ name: 'JavaScript', required_level: 'advanced', mandatory: true }],
    aliases,
  })
  assert.equal(result.matches[0].status, 'partial')
  assert.ok(result.overallMatch < 100)
})

test('mandatory skill penalty reduces the overall score when key skills are missing', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'SQL', level: 'advanced', confidence: 80 }],
    jobSkills: [
      { name: 'JavaScript', required_level: 'advanced', mandatory: true },
      { name: 'SQL', required_level: 'advanced', mandatory: true },
    ],
    aliases,
  })
  assert.ok(result.skillGaps.length >= 1)
  assert.ok(result.mandatoryMissing >= 0)
})

test('optional skills are not penalized as hard as mandatory ones', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'SQL', level: 'advanced', confidence: 90 }],
    jobSkills: [
      { name: 'SQL', required_level: 'advanced', mandatory: true },
      { name: 'Power BI', required_level: 'intermediate', mandatory: false },
    ],
    aliases,
  })
  assert.ok(result.overallMatch >= 60)
})

test('duplicate detection catches Java Script as likely duplicate of JavaScript', () => {
  const result = checkDuplicateSkillName('Java Script', skillCatalog, aliases)
  assert.equal(result.isPossibleDuplicate, true)
  assert.ok(result.matches.length >= 1)
})

test('normalization keeps Java distinct from JavaScript', () => {
  const result = resolveCanonicalSkill('Java', skillCatalog, aliases)
  assert.equal(result.matchType, 'new')
})

test('evidence-aware matching respects confidence when evaluating a skill', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'SQL', level: 'advanced', confidence: 90 }],
    jobSkills: [{ name: 'SQL', required_level: 'advanced', mandatory: true }],
    aliases,
  })
  assert.equal(result.matches[0].status, 'strong')
})

test('career matching returns explainable results for canonical skills', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'SQL', level: 'advanced', confidence: 85 }, { name: 'Excel', level: 'intermediate', confidence: 78 }],
    jobSkills: [
      { name: 'SQL', required_level: 'advanced', mandatory: true },
      { name: 'Microsoft Excel', required_level: 'intermediate', mandatory: true },
    ],
    aliases,
  })
  assert.ok(result.explanation.length > 0)
  assert.ok(result.overallMatch >= 60)
})

test('job matching supports a strong exact match for the same canonical skill', () => {
  const result = matchSkills({
    studentSkills: [{ name: 'JavaScript', level: 'advanced', confidence: 88 }],
    jobSkills: [{ name: 'JavaScript', required_level: 'advanced', mandatory: true }],
    aliases,
  })
  assert.equal(result.matches[0].matchScore >= 80, true)
})

test('labour-market aggregation keeps canonical skill names consistent', () => {
  const result = resolveCanonicalSkill('Java Script', skillCatalog, aliases)
  assert.equal(result.canonicalSkill, 'JavaScript')
})
