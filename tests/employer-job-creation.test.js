import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  deduplicateJobSkills,
  hasRequiredJobSkill,
  validateEmployerJob,
} from '../src/utils/employerJobValidation.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261116000002_employer_job_creation_validation.sql', import.meta.url),
  'utf8',
)
const employerPage = await readFile(new URL('../src/pages/employer/EmployerModulePage.jsx', import.meta.url), 'utf8')
const studentPage = await readFile(new URL('../src/pages/student/StudentModulePage.jsx', import.meta.url), 'utf8')
const jobService = await readFile(new URL('../src/services/jobService.js', import.meta.url), 'utf8')

const validDraft = {
  employer_id: 'employer-1',
  title: 'Agricultural Extension Officer',
  description: 'Support farmers with practical crop and soil management.',
  employment_type: 'full_time',
  status: 'draft',
}

test('job validation requires employer, title, description, and a valid employment type', () => {
  assert.equal(validateEmployerJob(validDraft), '')
  assert.match(validateEmployerJob({ ...validDraft, title: '  ' }), /title/)
  assert.match(validateEmployerJob({ ...validDraft, description: '  ' }), /description/)
  assert.match(validateEmployerJob({ ...validDraft, employer_id: '' }), /employer account/)
  assert.match(validateEmployerJob({ ...validDraft, employment_type: 'unknown' }), /employment type/)
})

test('drafts may be saved without skills but publication requires an approved required skill', () => {
  assert.equal(validateEmployerJob({ ...validDraft, job_skills: [] }), '')
  assert.equal(validateEmployerJob({
    ...validDraft,
    status: 'published',
    job_skills: [{ skill_id: 'skill-1', is_required: true, is_selectable: true }],
  }), '')
  assert.equal(validateEmployerJob({ ...validDraft, status: 'closed', job_skills: [] }), '')
  assert.match(validateEmployerJob({
    ...validDraft,
    status: 'published',
    job_skills: [{ skill_id: 'skill-1', is_required: false }],
  }), /at least one approved required skill/)
  assert.match(validateEmployerJob({
    ...validDraft,
    status: 'published',
    job_skills: [{ skill_id: 'skill-1', is_required: true, is_selectable: false }],
  }), /at least one approved required skill/)
  assert.equal(hasRequiredJobSkill([{ skill_id: 'skill-1', is_required: true }]), true)
})

test('validation rejects duplicate requirements and invalid salary or placement ranges', () => {
  assert.match(validateEmployerJob({
    ...validDraft,
    job_skills: [
      { skill_id: 'skill-1', is_required: true },
      { skill_id: 'skill-1', is_required: false },
    ],
  }), /duplicate skill/)
  assert.equal(deduplicateJobSkills([
    { skill_id: 'skill-1', is_required: true },
    { skill_id: 'skill-1', is_required: false },
    { skill_id: 'skill-2', is_required: true },
  ]).length, 2)
  assert.match(validateEmployerJob({ ...validDraft, salary_min: 100, salary_max: 50 }), /salary maximum/i)
  assert.match(validateEmployerJob({ ...validDraft, placement_start_date: '2026-12-01', placement_end_date: '2026-11-01' }), /placement end date/i)
})

test('the editor uses categorized catalog skills and separates removable required and preferred selections', () => {
  assert.match(employerPage, /filterSkillCatalog\(skillCatalog/)
  assert.match(employerPage, /SKILL_CATEGORIES\.map/)
  assert.match(employerPage, /Required skills \(\{requiredSkills\.length\}\)/)
  assert.match(employerPage, /Preferred skills \(\{preferredSkills\.length\}\)/)
  assert.match(employerPage, /toggleSkill\(\{ id: skill\.skill_id \}\)/)
  assert.match(employerPage, /validateEmployerJob\(jobForValidation/)
  assert.match(studentPage, /title="Required and preferred skills"/)
  assert.doesNotMatch(employerPage, /<EmptyState to="\/employer\/jobs\/create"/)
})

test('service and database enforce valid publishing and preserve required skills on published jobs', () => {
  assert.match(jobService, /validateEmployerJob\(job/)
  assert.match(jobService, /isSelectableSkill\(requirement\.skills\)/)
  assert.match(jobService, /deduplicateJobSkills\(requirements\)/)
  assert.match(migration, /jobs_title_nonempty[\s\S]*?check \(title ~ '\[\^\[:space:\]\]'\) not valid/i)
  assert.match(migration, /jobs_description_nonempty[\s\S]*?check \(description ~ '\[\^\[:space:\]\]'\) not valid/i)
  assert.match(migration, /new\.status = 'published'[\s\S]*?and js\.is_required[\s\S]*?s\.approval_status = 'approved'[\s\S]*?not s\.is_internal/i)
  assert.match(migration, /before delete or update of job_id, skill_id, is_required on public\.job_skills/i)
  assert.match(migration, /for update/i)
})
