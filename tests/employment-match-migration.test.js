import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20261115000001_recalculate_employment_matches.sql', import.meta.url)

test('employment match migration records calculation state and invalidates affected match rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /add column if not exists career_target_score numeric/)
  assert.match(sql, /add column if not exists calculation_status text not null default 'pending'/)
  assert.match(sql, /add column if not exists calculation_reason text/)
  assert.match(sql, /add column if not exists calculated_at timestamptz/)
  assert.match(sql, /check \(calculation_status in \('pending', 'completed', 'unavailable'\)\)/)
  assert.match(sql, /create or replace function public\.invalidate_employment_matches\(\)/)
  for (const table of [
    'student_profiles',
    'user_skills',
    'education',
    'projects',
    'project_skills',
    'certificates',
    'portfolios',
    'employment',
    'assessment_results',
    'job_skills',
    'jobs',
    'assessments',
    'employer_profiles',
    'skills',
  ]) {
    assert.match(sql, new RegExp(`on public\\.${table}[\\s\\S]*?execute function public\\.invalidate_employment_matches\\(\\)`))
  }
})
