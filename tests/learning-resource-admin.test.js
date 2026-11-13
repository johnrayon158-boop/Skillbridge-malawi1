import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validateLearningResource } from '../src/utils/learningResourceValidation.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261119000003_learning_resources_admin.sql', import.meta.url),
  'utf8',
)
const learningService = await readFile(
  new URL('../src/services/learningService.js', import.meta.url),
  'utf8',
)
const adminService = await readFile(
  new URL('../src/services/adminService.js', import.meta.url),
  'utf8',
)
const server = await readFile(
  new URL('../server/index.js', import.meta.url),
  'utf8',
)

const validDraft = {
  title: 'Practical Data Analysis',
  description: 'Learn to organise and interpret data using real-world examples.',
  resource_type: 'tutorial',
  status: 'draft',
  skill_ids: [],
  career_ids: [],
}

test('resource drafts can be saved without inventing a provider or publishing link', () => {
  assert.equal(validateLearningResource(validDraft), '')
})

test('publishing requires a category and secure resource link', () => {
  assert.match(validateLearningResource({ ...validDraft, status: 'published' }), /category/i)
  assert.match(validateLearningResource({
    ...validDraft,
    status: 'published',
    category: 'Business and Management',
    url: 'http://example.test/tutorial',
  }), /HTTPS/i)
  assert.equal(validateLearningResource({
    ...validDraft,
    status: 'published',
    category: 'Business and Management',
    url: 'https://example.test/tutorial',
  }), '')
})

test('resource validation checks supported types, links, duration, and duplicate associations', () => {
  assert.equal(validateLearningResource({
    ...validDraft,
    resource_type: 'documentation',
  }), '')
  assert.match(validateLearningResource({ ...validDraft, url: 'javascript:alert(1)' }), /HTTP or HTTPS/i)
  assert.match(validateLearningResource({ ...validDraft, duration_minutes: 0 }), /positive whole number/i)
  assert.match(validateLearningResource({ ...validDraft, skill_ids: ['skill-1', 'skill-1'] }), /skill cannot be linked more than once/i)
})

test('resource migration defaults existing content to drafts and restricts student reads to published rows', () => {
  assert.match(migration, /add column status text not null default 'draft'/i)
  assert.match(migration, /create policy learning_resources_published_read[\s\S]*for select using \(status = 'published'\)/i)
  assert.match(migration, /create policy learning_resources_admin_all[\s\S]*public\.is_admin\(\)/i)
  assert.match(migration, /create policy learning_resource_skills_published_read/i)
  assert.match(migration, /create policy learning_resource_careers_published_read/i)
  assert.match(migration, /documentation/i)
  assert.match(migration, /create trigger learning_resource_opportunity_notification[\s\S]*status/i)
  assert.match(migration, /if new\.status is distinct from 'published' then\s+return new/i)
  assert.doesNotMatch(migration, /example\.com|SkillBridge Demo Library/i)
})

test('resource management RPCs enforce administrator access, publishing validation, and URL duplicate guards', () => {
  assert.match(migration, /create or replace function public\.save_learning_resource/i)
  assert.match(migration, /create or replace function public\.update_learning_resource_status/i)
  assert.match(migration, /auth\.uid\(\) is null or not public\.is_admin\(\)/i)
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*A learning resource with this URL already exists/i)
  assert.match(migration, /Add a valid HTTPS resource URL before publishing/i)
  assert.match(migration, /grant execute on function public\.save_learning_resource[\s\S]*to authenticated/i)
})

test('student and AI resource reads explicitly filter to published resources', () => {
  assert.match(learningService, /from\('learning_resources'\)[\s\S]*?\.eq\('status', 'published'\)/)
  assert.match(server, /from\('learning_resources'\)\.select\('\*, skills\(\*\)'\)\.eq\('status', 'published'\)/)
  assert.match(adminService, /rpc\('save_learning_resource'/)
  assert.match(adminService, /rpc\('update_learning_resource_status'/)
})
