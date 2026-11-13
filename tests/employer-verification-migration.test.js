import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20261116000003_employer_verification_workflow.sql', import.meta.url),
  'utf8',
)

test('employer verification migration requires a reviewed approval record and preserves legacy profiles', () => {
  assert.match(migration, /verification_status in \('unverified', 'pending', 'verified', 'rejected'\)/)
  assert.match(migration, /update public\.employer_profiles ep\s+set verification_status = case when exists/)
  assert.match(migration, /s\.status = 'verified'[\s\S]*s\.reviewed_by is not null[\s\S]*s\.reviewed_at is not null/)
  assert.match(migration, /employer_verification_submissions[\s\S]*legal_business_name[\s\S]*document_path/)
  assert.match(migration, /employer_verification_one_pending_per_employer/)
  assert.match(migration, /status = 'verified'[\s\S]*reviewed_by is not null[\s\S]*reviewed_at is not null/)
})

test('employer verification evidence and decisions are private, owner-scoped, admin-reviewed, and audited', () => {
  assert.match(migration, /public = false[\s\S]*employer-verification-documents/)
  assert.match(migration, /employer_verification_submissions_owner_read[\s\S]*employer_id = auth\.uid\(\) or public\.is_admin\(\)/)
  assert.match(migration, /employer_verification_documents_owner_insert[\s\S]*storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
  assert.match(migration, /review_employer_verification_submission[\s\S]*not public\.is_admin\(\)/)
  assert.match(migration, /employer_verification_submission_audit_insert/)
  assert.match(migration, /employer_verification_submission_audit_update/)
  assert.match(migration, /grant update \([\s\S]*company_name, industry, description/)
})
