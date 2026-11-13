import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseCareerList, validateCareerDefinition } from '../src/utils/careerDefinitionValidation.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261119000002_career_definitions_admin.sql', import.meta.url),
  'utf8',
)
const careerService = await readFile(
  new URL('../src/services/careerService.js', import.meta.url),
  'utf8',
)
const server = await readFile(
  new URL('../server/index.js', import.meta.url),
  'utf8',
)

const completeCareer = {
  title: 'Agricultural Extension Officer',
  sector: 'Agriculture',
  description: 'Supports farmers with practical guidance and sustainable production methods.',
  status: 'draft',
  skill_requirements: [],
}

test('career lists trim entries and remove case-insensitive duplicates', () => {
  assert.deepEqual(parseCareerList('Crop planning\n crop planning \nFarmer training\n'), [
    'Crop planning',
    'Farmer training',
  ])
})

test('career definitions validate publication requirements without blocking useful drafts', () => {
  assert.equal(validateCareerDefinition(completeCareer), '')
  assert.match(validateCareerDefinition({
    ...completeCareer,
    status: 'published',
    skill_requirements: [{ skill_id: 'skill-1', is_required: false }],
  }), /at least one required catalog skill/i)
  assert.equal(validateCareerDefinition({
    ...completeCareer,
    status: 'published',
    skill_requirements: [{ skill_id: 'skill-1', is_required: true }],
  }), '')
})

test('source-reviewed outlook requires a citation and secure source links', () => {
  assert.match(validateCareerDefinition({
    ...completeCareer,
    outlook_reviewed: true,
    outlook_summary: 'A source-backed description.',
  }), /summary and source/i)
  assert.match(validateCareerDefinition({
    ...completeCareer,
    outlook_source_url: 'http://example.test/report',
  }), /HTTPS/i)
})

test('career migration defaults existing definitions to drafts and only exposes published definitions', () => {
  assert.match(migration, /add column status text not null default 'draft'/i)
  assert.match(migration, /create policy careers_published_read on public\.careers\s+for select using \(status = 'published'\)/i)
  assert.match(migration, /create policy careers_admin_all on public\.careers\s+for all using \(public\.is_admin\(\)\)/i)
  assert.match(migration, /create table public\.career_learning_resources/i)
  assert.match(migration, /add column is_required boolean not null default true/i)
})

test('career administration RPCs validate published skills and preserve referenced history', () => {
  assert.match(migration, /create or replace function public\.save_career_definition/i)
  assert.match(migration, /create or replace function public\.update_career_definition_status/i)
  assert.match(migration, /s\.approval_status is distinct from 'approved'/i)
  assert.match(migration, /create or replace function public\.delete_career_definition/i)
  assert.match(migration, /archive it instead of deleting it/i)
  assert.match(migration, /grant execute on function public\.save_career_definition[\s\S]*to authenticated/i)
})

test('student career reads and AI recommendation inputs are limited to published definitions', () => {
  assert.match(careerService, /\.eq\('status', 'published'\)/)
  assert.match(server, /async function loadCareerRecommendationData[\s\S]*?from\('careers'\)[\s\S]*?\.eq\('status', 'published'\)/)
  assert.match(server, /async function loadCareerForAi[\s\S]*?from\('careers'\)[\s\S]*?\.eq\('status', 'published'\)/)
})
