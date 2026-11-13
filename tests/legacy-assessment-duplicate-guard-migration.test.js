import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../supabase/migrations/20261119000001_legacy_assessment_duplicate_guard.sql', import.meta.url),
  'utf8',
)

test('assessment generation compares legacy question content before inserting another copy', () => {
  assert.match(migration, /v_legacy_match_count > 1[\s\S]*?administrator review is required/i)
  assert.match(migration, /v_legacy_match_count = 1[\s\S]*?return v_existing_assessment_id/i)
  for (const column of ['question', 'question_type', 'options', 'correct_answer', 'points', 'difficulty', 'explanation']) {
    assert.match(migration, new RegExp(`stored_question\\.${column}`))
  }
  assert.match(migration, /and a\.job_id = selected_job\.id/)
  assert.match(migration, /and a\.status is distinct from 'archived'/)
})

test('legacy matching preserves records and only backfills a missing request fingerprint', () => {
  assert.match(migration, /set request_fingerprint = v_request_fingerprint[\s\S]*?and request_fingerprint is null/i)
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i)
  assert.doesNotMatch(migration, /\bdrop\s+(table|column)\b/i)
})

test('assessment generation does not return an archived fingerprint as a successful active assessment', () => {
  assert.match(migration, /if v_existing_assessment_status = 'published' then\s+return v_existing_assessment_id/i)
  assert.match(migration, /elsif v_existing_assessment_status = 'archived' then[\s\S]*?set request_fingerprint = null/i)
  assert.match(migration, /not published; administrator review is required/i)
})
