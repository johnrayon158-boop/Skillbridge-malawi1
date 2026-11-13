import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../supabase/migrations/20261009050001_assessment_grading_score_contract.sql', import.meta.url),
  'utf8',
)

test('assessment grading migration validates ownership and answer payload before writing the associated result', () => {
  assert.match(migration, /security invoker/i)
  assert.match(migration, /auth\.uid\(\)\s*<>\s*p_student_id/)
  assert.match(migration, /jsonb_typeof\(p_answers\)\s*<>\s*'object'/)
  assert.match(migration, /p_answers\s*->\s*q\.id::text\)\s*=\s*q\.correct_answer/)
  assert.match(migration, /assessment_id,\s*student_id,\s*score,\s*percentage/)
  assert.match(migration, /values\s*\(\s*p_assessment_id,\s*p_student_id,\s*final_percentage,\s*final_percentage/s)
  assert.match(migration, /total_points\s*<=\s*0/)
})
