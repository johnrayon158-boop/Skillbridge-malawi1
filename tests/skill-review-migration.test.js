import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const catalogMigration = await readFile(
  new URL('../supabase/migrations/20261113000001_curated_skill_catalog.sql', import.meta.url),
  'utf8',
)
const reviewMigration = await readFile(
  new URL('../supabase/migrations/20261118000002_skill_catalog_review_audit.sql', import.meta.url),
  'utf8',
)

test('catalog cleanup snapshots existing skills and duplicate job requirements before updating catalog data', () => {
  const backupInsert = catalogMigration.indexOf('insert into public.skill_catalog_migration_backup')
  const firstCatalogChange = catalogMigration.indexOf('alter table public.skills')

  assert.ok(backupInsert >= 0)
  assert.ok(firstCatalogChange > backupInsert)
  assert.match(catalogMigration, /'skills',\s+skill\.id::text,\s+to_jsonb\(skill\)/)
  assert.match(catalogMigration, /'job_skills',\s+requirement\.id::text,\s+to_jsonb\(requirement\)/)
  assert.match(catalogMigration, /revoke all on public\.skill_catalog_migration_backup from public, anon, authenticated/)
  assert.doesNotMatch(catalogMigration, /delete\s+from\s+public\.skills/i)
})

test('catalog review migration audits submissions and decisions and restricts history to administrators', () => {
  assert.match(reviewMigration, /create table if not exists public\.skill_catalog_review_events/)
  assert.match(reviewMigration, /action text not null check \(action in \([\s\S]*'approved'[\s\S]*'rejected'[\s\S]*'archived'/)
  assert.match(reviewMigration, /after insert or update on public\.skills/)
  assert.match(reviewMigration, /public\.is_admin\(\)/)
  assert.match(reviewMigration, /grant select on public\.skill_catalog_review_events to authenticated/)
})

test('database import validation enforces categories, token limits, and substantive PDF descriptions', () => {
  assert.match(reviewMigration, /cardinality\(regexp_split_to_array\(new\.name, '\\s\+'\)\) > 8/)
  assert.match(reviewMigration, /new\.category = any \(allowed_categories\)/)
  assert.match(reviewMigration, /new\.source_type = 'pdf_import'/)
  assert.match(reviewMigration, /char_length\(trim\(coalesce\(new\.description, ''\)\)\) < 25/)
})

test('catalog migration quarantines known document fragments without deleting preserved records', () => {
  assert.match(catalogMigration, /name ~\* '\^examples\?'/)
  assert.match(catalogMigration, /name ~\* '\^and\(\[\[:space:\]\]\|\$\)'/)
  assert.match(catalogMigration, /benepass\|installed\[\[:space:\]\]\*editable/)
  assert.doesNotMatch(catalogMigration, /delete\s+from\s+public\.skills/i)
})
