import test from 'node:test'
import assert from 'node:assert/strict'
import { addSkillAliases, createSkillDescription, detectSkillsInJob, detectSkillsInSources, detectSkillsInText, extractSkillCandidates } from '../src/utils/skillDetection.js'
import { SKILL_CATEGORIES } from '../src/utils/skillCatalog.js'

test('detects known skill names and aliases in job text', () => {
  const skills = [
    { id: 'data', name: 'Data Analysis' },
    { id: 'project', name: 'Project Management', aliases: ['project coordination'] },
  ]

  assert.deepEqual(
    detectSkillsInText('We need data analysis and project coordination experience.', skills).map(({ id }) => id),
    ['data', 'project'],
  )
})

test('matches complete skill phrases rather than partial words', () => {
  const skills = [{ id: 'design', name: 'Design' }]

  assert.deepEqual(detectSkillsInText('The designation is full time.', skills), [])
  assert.deepEqual(detectSkillsInText('Design accessible learning materials.', skills).map(({ id }) => id), ['design'])
})

test('detects job skills from all relevant opportunity details', () => {
  const skills = [
    { id: 'excel', name: 'Microsoft Excel', aliases: ['Excel'] },
    { id: 'communication', name: 'Communication' },
    { id: 'accounting', name: 'Accounting' },
  ]

  assert.deepEqual(
    detectSkillsInJob({
      title: 'Finance Assistant',
      description: 'Support the finance team.',
      responsibilities: 'Prepare reports using Excel.',
      learning_objectives: 'Develop communication skills.',
    }, skills).map(({ id }) => id),
    ['excel', 'communication'],
  )
})

test('extracts selectable skill candidates from PDF-style skill lists', () => {
  assert.deepEqual(extractSkillCandidates(
    'Technical Skills\n1. Data Analysis\n• Microsoft Excel\nPython, Database Management\nA paragraph describing a role in detail.',
    [{ name: 'Python' }],
  ), [
    { name: 'Data Analysis', category: SKILL_CATEGORIES[0], description: '', selected: true },
    { name: 'Microsoft Excel', category: SKILL_CATEGORIES[0], description: '', selected: true },
    { name: 'Database Management', category: SKILL_CATEGORIES[0], description: '', selected: true },
  ])
})

test('maps cross-sector category headings and skips extracted system noise', () => {
  const candidates = extractSkillCandidates(
    'Accounting and Finance Skills\nBookkeeping\nClaude Skills CatalogPage 1\nexamples...\npublicRead\nbuilt-in-browser\nmcp-builder\nskill-testing',
  )

  assert.deepEqual(candidates.map(({ name, category }) => ({ name, category })), [
    { name: 'Bookkeeping', category: SKILL_CATEGORIES[3] },
  ])
})

test('normalizes imported names and rejects fragments, headings, and unrelated document content', () => {
  const candidates = extractSkillCandidates(
    'and\nand fill PDF forms\nbenepass-reimburseme\nInstalledEditable shared documents\nbookkeeping\n',
  )

  assert.deepEqual(candidates.map(({ name }) => name), ['Bookkeeping'])
})

test('automatically describes skills from their name and category', () => {
  assert.equal(
    createSkillDescription('Data Analysis', 'Technology'),
    'The knowledge and practical ability to apply Data Analysis effectively in technology tasks and situations.',
  )
})

test('merges taxonomy aliases into catalog skills without duplicates', () => {
  const catalog = [{ id: 'javascript', name: 'JavaScript', aliases: ['JS'] }]
  const aliasRecords = [
    { skill_id: 'javascript', alias: 'ECMAScript' },
    { skill_id: 'javascript', alias: 'JS' },
    { skill_id: 'research', alias: 'Research methods' },
  ]
  const skills = addSkillAliases(catalog, aliasRecords)

  assert.deepEqual(skills, [{
    id: 'javascript',
    name: 'JavaScript',
    aliases: ['JS', 'ECMAScript'],
  }])
  assert.deepEqual(detectSkillsInText('Experience building with ECMAScript.', skills).map(({ id }) => id), ['javascript'])
})

test('detects profile and portfolio skills with the sources that support each suggestion', () => {
  const skills = [
    { id: 'javascript', name: 'JavaScript', aliases: ['JS'] },
    { id: 'research', name: 'Research' },
  ]

  assert.deepEqual(
    detectSkillsInSources([
      { label: 'Profile bio', text: 'I build web apps with JS.' },
      { label: 'Project: Student Portal', text: 'A JavaScript portal with research tools.' },
    ], skills),
    [
      { ...skills[0], evidence: ['Profile bio', 'Project: Student Portal'] },
      { ...skills[1], evidence: ['Project: Student Portal'] },
    ],
  )
})
