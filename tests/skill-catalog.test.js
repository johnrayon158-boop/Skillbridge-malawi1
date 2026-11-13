import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterAssessmentsBySkillVisibility,
  filterRecommendationSkillNames,
  filterSelectableSkillRows,
  filterSkillCatalog,
  isSelectableSkill,
  normalizeSkillDisplayName,
  normalizeSkillCatalogName,
  SKILL_CATEGORIES,
  validateSkillCandidate,
} from '../src/utils/skillCatalog.js'

const approvedSkill = {
  id: 'excel',
  name: 'Microsoft Excel',
  category: 'Information Technology and Software Development',
  status: 'active',
  approval_status: 'approved',
  is_internal: false,
  aliases: ['Excel', 'MS Excel'],
}

test('exposes a broad, stable set of professional skill categories', () => {
  assert.equal(SKILL_CATEGORIES.length, 11)
  assert.ok(SKILL_CATEGORIES.includes('Agriculture and Environmental Sciences'))
  assert.ok(SKILL_CATEGORIES.includes('Health and Medical Sciences'))
  assert.ok(SKILL_CATEGORIES.includes('Hospitality and Tourism'))
})

test('only active, approved, non-internal skills are selectable', () => {
  assert.equal(isSelectableSkill(approvedSkill), true)
  assert.equal(isSelectableSkill({ ...approvedSkill, approval_status: 'pending' }), false)
  assert.equal(isSelectableSkill({ ...approvedSkill, status: 'archived' }), false)
  assert.equal(isSelectableSkill({ ...approvedSkill, is_internal: true }), false)
})

test('catalog filtering searches aliases and applies category selection', () => {
  const skills = [
    approvedSkill,
    { ...approvedSkill, id: 'pending', name: 'Financial Modelling', approval_status: 'pending' },
    { ...approvedSkill, id: 'bookkeeping', name: 'Bookkeeping', category: 'Accounting and Finance', aliases: ['Accounts'] },
  ]

  assert.deepEqual(filterSkillCatalog(skills, { query: 'MS Excel' }).map((skill) => skill.id), ['excel'])
  assert.deepEqual(filterSkillCatalog(skills, { category: 'Accounting and Finance' }).map((skill) => skill.id), ['bookkeeping'])
})

test('filters hidden skills from profile and assessment selection rows', () => {
  const rows = [
    { skill_id: 'excel', skills: approvedSkill },
    { skill_id: 'internal', skills: { ...approvedSkill, is_internal: true } },
    { skill_id: 'missing', skills: null },
  ]
  const assessments = [
    { id: 'general', skill_id: null, skills: null },
    { id: 'excel-check', skill_id: 'excel', skills: approvedSkill },
    { id: 'internal-check', skill_id: 'internal', skills: { ...approvedSkill, is_internal: true } },
  ]

  assert.deepEqual(filterSelectableSkillRows(rows).map((row) => row.skill_id), ['excel'])
  assert.deepEqual(filterAssessmentsBySkillVisibility(assessments).map((item) => item.id), ['general', 'excel-check'])
})

test('removes unapproved historical recommendation skills and suppresses stale explanations', () => {
  const recommendation = filterRecommendationSkillNames({
    strong_skills: ['MS Excel', 'Internal Automation'],
    missing_skills: ['Excel', 'Guides)'],
    reason: 'Internal Automation is a strong match.',
  }, [approvedSkill])

  assert.deepEqual(recommendation.strong_skills, ['MS Excel'])
  assert.deepEqual(recommendation.missing_skills, ['Excel'])
  assert.equal(recommendation.reason, 'Some skill details are hidden until they are approved in the catalog.')
})

test('normalizes punctuation variants before duplicate checks', () => {
  assert.equal(normalizeSkillCatalogName('Guides)'), 'guides')
})

test('normalizes casing and outer punctuation in imported skill names', () => {
  assert.equal(normalizeSkillDisplayName('  bookkeeping: '), 'Bookkeeping')
  assert.equal(normalizeSkillDisplayName('SQL'), 'SQL')
  assert.equal(normalizeSkillDisplayName('Guides)'), 'Guides')
})

test('validates skill name, category, duplicate-prone fragments, and meaningful description', () => {
  const valid = validateSkillCandidate({
    name: 'bookkeeping',
    category: 'Accounting and Finance',
    description: 'Maintaining accurate financial records, ledgers, and supporting documents.',
  })
  const invalid = validateSkillCandidate({
    name: 'and fill PDF forms',
    category: 'General',
    description: 'The knowledge and practical ability to apply this skill effectively in general tasks and situations.',
  })

  assert.equal(valid.valid, true)
  assert.equal(valid.name, 'Bookkeeping')
  assert.deepEqual(invalid.errors, [
    'Enter a professional skill name, not a document heading, fragment, or system term.',
    'Choose a category from the curated skills taxonomy.',
    'Add a meaningful description of 25–500 characters that explains what the skill involves.',
  ])
})

test('rejects imported skill names that exceed the word-count limit', () => {
  const result = validateSkillCandidate({
    name: 'Advanced professional communication and document management for public service',
    category: 'Communication and Media',
    description: 'Preparing clear information for public audiences and organizational teams.',
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('Skill names must contain no more than 8 words.'))
})

test('rejects document fragments and imported system content as skill candidates', () => {
  for (const name of [
    'and landing',
    'examplesDefault for editable shared documents',
    'InstalledEditable shared documents: reports',
    'benepass-reimbursemen',
  ]) {
    const result = validateSkillCandidate({
      name,
      category: 'General and Transferable Skills',
      description: 'This describes a practical ability used to complete professional tasks and responsibilities.',
    })

    assert.equal(result.valid, false, `${name} should not be accepted`)
  }
})
