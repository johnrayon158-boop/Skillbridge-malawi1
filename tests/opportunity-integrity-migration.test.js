import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../supabase/migrations/20261112000001_opportunity_integrity_idempotency.sql', import.meta.url),
  'utf8',
)
const report = await readFile(
  new URL('../scripts/audit-opportunity-duplicates.sql', import.meta.url),
  'utf8',
)
const studentService = await readFile(
  new URL('../src/services/studentService.js', import.meta.url),
  'utf8',
)

test('job assessment generation is idempotent for the same job and generated content', () => {
  assert.match(migration, /job_assessments_job_request_fingerprint[\s\S]*?on public\.job_assessments\(job_id, request_fingerprint\)/i)
  assert.match(migration, /v_request_fingerprint := md5\(jsonb_build_object/i)
  assert.match(migration, /where job_id = p_job_id\s+and request_fingerprint = v_request_fingerprint/i)
  assert.match(migration, /if found then\s+return v_existing_assessment_id/i)
})

test('assessment result retries reuse one result without preventing later attempts', () => {
  assert.match(migration, /assessment_results_submission_key[\s\S]*?on public\.assessment_results\(submission_key\)/i)
  assert.match(migration, /p_assessment_id::text \|\| ':' \|\| p_student_id::text \|\| ':' \|\| extract\(epoch from p_started_at\)::text/i)
  assert.match(migration, /on conflict \(submission_key\) where submission_key is not null do nothing/i)
  assert.match(migration, /p_started_at timestamptz/i)
})

test('education validation protects new writes and leaves legacy records untouched', () => {
  assert.match(migration, /check\s*\([\s\S]*?length\(btrim\(institution\)\) > 0[\s\S]*?length\(btrim\(education_level\)\) > 0[\s\S]*?\)\s*not valid/i)
  assert.match(studentService, /normalizeEducationRecord\(record\)/)
  assert.match(studentService, /normalizeEducationRecord\(changes\)/)
})

test('duplicate report groups published jobs and exposes relationships for manual review only', () => {
  assert.match(report, /where j\.status = 'published'/i)
  assert.match(report, /group by employer_id, normalized_title, normalized_location, employment_type, opportunity_type/i)
  assert.match(report, /required_skill_count/i)
  assert.match(report, /application_count/i)
  assert.match(report, /assessment_result_count/i)
  assert.match(report, /notification_count/i)
  assert.doesNotMatch(report, /\b(delete|update|insert)\s+into\b/i)
})
