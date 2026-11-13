import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { ADMIN_JOB_DETAIL_SELECT, groupJobSkills } from '../src/utils/adminJobDetails.js'

const adminServiceSource = await readFile(new URL('../src/services/adminService.js', import.meta.url), 'utf8')
const adminPageSource = await readFile(new URL('../src/pages/admin/AdminModulePage.jsx', import.meta.url), 'utf8')
const jobSchemaSource = await readFile(new URL('../supabase/migrations/20261001000005_jobs_and_applications.sql', import.meta.url), 'utf8')
const skillTaxonomySource = await readFile(new URL('../supabase/migrations/20261001000100_skill_taxonomy.sql', import.meta.url), 'utf8')

test('admin job detail embeds the skill through job_skills.skill_id explicitly', () => {
  assert.match(jobSchemaSource, /skill_id uuid not null references public\.skills\(id\)/i)
  assert.match(skillTaxonomySource, /canonical_skill_id uuid references public\.skills\(id\)/i)
  assert.match(ADMIN_JOB_DETAIL_SELECT, /job_skills\([^)]*skills!job_skills_skill_id_fkey\(name\)\)/)
  assert.match(ADMIN_JOB_DETAIL_SELECT, /applications\(id, status\)/)
  assert.match(ADMIN_JOB_DETAIL_SELECT, /\bis_required\b/)
  assert.match(adminServiceSource, /async getJob\(id\)[\s\S]*?\.select\(ADMIN_JOB_DETAIL_SELECT\)/)
})

test('admin job details separate required and preferred skills and handle missing skills', () => {
  const grouped = groupJobSkills([
    { id: 'required-1', is_required: true },
    { id: 'preferred-1', is_required: false },
    { id: 'legacy-1' },
  ])
  assert.deepEqual(grouped.required.map(({ id }) => id), ['required-1', 'legacy-1'])
  assert.deepEqual(grouped.preferred.map(({ id }) => id), ['preferred-1'])
  assert.deepEqual(groupJobSkills(null), { required: [], preferred: [] })
  assert.match(adminPageSource, /groupJobSkills\(job\.job_skills\)/)
  assert.match(adminPageSource, /No required skills are linked to this listing\./)
  assert.match(adminPageSource, /No preferred skills specified\./)
})

test('job-skill relation selects across services explicitly identify the skill foreign key', async () => {
  const files = [
    '../src/services/adminService.js',
    '../src/services/jobService.js',
    '../src/services/studentService.js',
    '../src/services/skillService.js',
    '../src/services/labourMarketService.js',
    '../src/services/internshipService.js',
    '../server/index.js',
  ]
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')))
  for (const source of sources) {
    for (const select of source.matchAll(/\.select\((['"`])([\s\S]*?)\1\)/g)) {
      if (select[2].includes('job_skills') && select[2].includes('skills')) {
        assert.match(select[2], /skills!job_skills_skill_id_fkey/, 'job skill embeds must name their foreign key')
      }
    }
  }
})
