import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { getAdminDashboardData } from '../src/services/adminDashboardData.js'
import { getAdminDashboardDateRange } from '../src/utils/adminDashboardMetrics.js'

const now = new Date('2026-11-13T04:34:46.553Z')
const recent = '2026-10-25T10:00:00.000Z'
const old = '2026-09-10T10:00:00.000Z'

const records = {
  profiles: [{ created_at: recent }, { created_at: old }],
  student_profiles: [{ created_at: recent }, { created_at: old }],
  employer_profiles: [{ created_at: recent, is_demo: false }, { created_at: recent, is_demo: true }],
  jobs: [
    { status: 'published', is_demo: false, created_at: recent, published_at: recent },
    { status: 'published', is_demo: false, created_at: recent, published_at: old },
    { status: 'published', is_demo: true, created_at: recent, published_at: recent },
    { status: 'draft', is_demo: false, created_at: recent },
    { status: 'closed', is_demo: false, created_at: recent },
    { status: 'archived', is_demo: false, created_at: recent },
  ],
  applications: [{ applied_at: recent }, { applied_at: old }],
  interviews: [{ scheduled_at: recent }, { scheduled_at: old }],
  employment: [
    { status: 'active', created_at: recent },
    { status: 'completed', created_at: recent },
    { status: 'terminated', created_at: recent },
    { status: 'on_leave', created_at: recent },
  ],
  assessments: [
    { status: 'published', created_at: recent },
    { status: 'draft', created_at: recent },
    { status: 'archived', created_at: old },
  ],
  learning_resources: [
    { status: 'published', is_demo: false, created_at: recent, published_at: recent },
    { status: 'published', is_demo: true, created_at: recent, published_at: recent },
    { status: 'draft', is_demo: false, created_at: recent },
    { status: 'archived', is_demo: false, created_at: old },
  ],
  skills: [{ created_at: recent }],
  careers: [{ created_at: recent }],
  admin_logs: [{ id: 'log-1', created_at: recent }],
}

function createDatabase(rowsByTable) {
  return {
    from(table) {
      const state = { filters: [], order: null, limit: null, head: false }
      const builder = {
        select(_columns, options = {}) {
          state.head = Boolean(options.head)
          return builder
        },
        eq(column, value) {
          state.filters.push((row) => row[column] === value)
          return builder
        },
        gte(column, value) {
          state.filters.push((row) => row[column] && new Date(row[column]) >= new Date(value))
          return builder
        },
        lte(column, value) {
          state.filters.push((row) => row[column] && new Date(row[column]) <= new Date(value))
          return builder
        },
        order(column, options = {}) {
          state.order = { column, ascending: options.ascending !== false }
          return builder
        },
        limit(value) {
          state.limit = value
          return builder
        },
        then(resolve, reject) {
          try {
            let rows = (rowsByTable[table] || []).filter((row) => state.filters.every((filter) => filter(row)))
            if (state.order) {
              const { column, ascending } = state.order
              rows = [...rows].sort((left, right) => String(left[column]).localeCompare(String(right[column])) * (ascending ? 1 : -1))
            }
            if (state.limit !== null) rows = rows.slice(0, state.limit)
            resolve(state.head ? { count: rows.length, error: null } : { data: rows, error: null })
          } catch (error) {
            reject(error)
          }
        },
      }
      return builder
    },
  }
}

test('dashboard date ranges have explicit UTC boundaries and fall back safely', () => {
  assert.deepEqual(getAdminDashboardDateRange('year', now), {
    range: 'year',
    label: 'Year to date',
    from: '2026-01-01T00:00:00.000Z',
    to: now.toISOString(),
  })
  assert.equal(getAdminDashboardDateRange('unsupported', now).range, 'all')
  assert.equal(getAdminDashboardDateRange('all', now).from, null)
})

test('dashboard counts match date-filtered database rows and separate statuses and tagged demo data', async () => {
  const result = await getAdminDashboardData(createDatabase(records), '30d', now)

  assert.equal(result.dateRange.label, 'Last 30 days')
  assert.deepEqual(result.metrics, {
    users: 1,
    studentProfiles: 1,
    employers: 1,
    demoEmployers: 1,
    jobs: 1,
    jobsTotal: 6,
    platformJobs: 5,
    demoJobs: 1,
    draftJobs: 1,
    closedJobs: 1,
    archivedJobs: 1,
    applications: 1,
    interviews: 1,
    employment: 4,
    activeEmployment: 1,
    completedEmployment: 1,
    terminatedEmployment: 1,
    onLeaveEmployment: 1,
    assessments: 2,
    publishedAssessments: 1,
    draftAssessments: 1,
    archivedAssessments: 0,
    resources: 1,
    resourcesTotal: 3,
    demoResources: 1,
    draftResources: 1,
    archivedResources: 0,
    skills: 1,
    careers: 1,
  })
  assert.deepEqual(result.alerts, records.admin_logs)
})

test('all-time dashboard includes archived and unpublished records', async () => {
  const result = await getAdminDashboardData(createDatabase(records), 'all', now)

  assert.equal(result.metrics.jobs, 2)
  assert.equal(result.metrics.archivedJobs, 1)
  assert.equal(result.metrics.assessments, 3)
  assert.equal(result.metrics.archivedAssessments, 1)
  assert.equal(result.metrics.resourcesTotal, 4)
  assert.equal(result.metrics.archivedResources, 1)
})

test('empty database tables return explicit zero counts and an empty alert list', async () => {
  const result = await getAdminDashboardData(createDatabase({}), 'all', now)

  assert.ok(Object.values(result.metrics).every((value) => value === 0))
  assert.deepEqual(result.alerts, [])
})

test('demo data migration marks only explicitly seeded demo content without deleting records', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261121000003_admin_dashboard_data_quality.sql', import.meta.url), 'utf8')
  const seed = await readFile(new URL('../supabase/migrations/20261001000008_seed_data.sql', import.meta.url), 'utf8')

  assert.match(migration, /add column if not exists is_demo boolean not null default false/i)
  assert.match(migration, /company_name = 'SkillBridge Demo Employer'/)
  assert.match(migration, /Demo Graduate Project Assistant/)
  assert.match(migration, /provider = 'SkillBridge Demo Library'/)
  assert.match(seed, /Demo Graduate Project Assistant/)
  assert.match(seed, /Demo: Workplace Communication Basics/)
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i)
})
