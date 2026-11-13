import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261112000002_student_target_role.sql', import.meta.url), 'utf8')
const profileForm = readFileSync(new URL('../src/pages/student/StudentModulePage.jsx', import.meta.url), 'utf8')
const marketPage = readFileSync(new URL('../src/pages/student/StudentMarketPage.jsx', import.meta.url), 'utf8')
const studentService = readFileSync(new URL('../src/services/studentService.js', import.meta.url), 'utf8')

test('target occupation migration preserves descriptions and only backfills exact known career titles', () => {
  assert.match(migration, /add column if not exists target_role text/i)
  assert.match(migration, /where sp\.target_role is null/i)
  assert.match(migration, /lower\(btrim\(sp\.career_goal\)\) = lower\(btrim\(careers\.title\)\)/i)
  assert.match(migration, /char_length\(btrim\(sp\.career_goal\)\) <= 120/i)
  assert.doesNotMatch(migration, /set\s+career_goal\s*=/i)
  assert.match(migration, /array\[v_profile\.target_role, v_profile\.career_goal/i)
})

test('profile editor saves a free-form occupation separately from the career-goal description', () => {
  assert.match(profileForm, /target_role: student\?\.target_role/)
  assert.match(profileForm, /target_role: targetRole, career_goal: form\.career_goal/)
  for (const role of ['Software Developer', 'Graphic Designer', 'Accountant', 'Teacher', 'Nurse', 'Agricultural Officer']) {
    assert.ok(profileForm.includes(`'${role}'`))
  }
})

test('Career Market and readiness target the structured role rather than the description', () => {
  assert.match(marketPage, /student\?\.target_role \|\| overviewResult\.value\.mostRequestedCareer/)
  assert.match(studentService, /student_profiles\(target_role, career_goal/)
  assert.match(studentService, /studentProfile\?\.target_role/)
})
