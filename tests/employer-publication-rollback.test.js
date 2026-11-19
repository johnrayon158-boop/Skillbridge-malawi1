import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rollback = await readFile(
  new URL('../supabase/migrations/20261122000003_revert_job_publication_application_policy_changes.sql', import.meta.url),
  'utf8',
)

test('rollback removes the publication guards and application eligibility trigger without deleting records', () => {
  assert.match(rollback, /drop trigger if exists jobs_guard_employer_publication/)
  assert.match(rollback, /drop function if exists public\.employer_publish_job\(uuid\)/)
  assert.match(rollback, /drop trigger if exists applications_validate_candidate_eligibility/)
  assert.match(rollback, /drop function if exists public\.validate_application_candidate_eligibility\(\)/)
  assert.doesNotMatch(rollback, /\bdelete\s+from\s+public\.(jobs|applications)\b/i)
})

test('rollback restores the prior non-recursive application policies', () => {
  assert.match(rollback, /create policy applications_student_select[\s\S]*public\.owns_student\(student_id\)/)
  assert.match(rollback, /create policy applications_student_insert[\s\S]*public\.owns_student\(student_id\)[\s\S]*status = 'applied'/)
  assert.match(rollback, /create policy applications_employer_read[\s\S]*public\.owns_employer\(j\.employer_id\)/)
  assert.doesNotMatch(rollback, /create policy applications_student_select[\s\S]*public\.profiles/i)
})
