import { getAdminDashboardDateRange } from '../utils/adminDashboardMetrics.js'

async function countRecords(client, table, { filters = {}, dateField = 'created_at', dateRange } = {}) {
  let request = client.from(table).select('*', { count: 'exact', head: true })
  for (const [column, value] of Object.entries(filters)) request = request.eq(column, value)
  if (dateRange?.from) request = request.gte(dateField, dateRange.from)
  if (dateRange?.to) request = request.lte(dateField, dateRange.to)
  const { count: total, error } = await request
  if (error) throw new Error(`Unable to count ${table} for the selected date range.`)
  return total || 0
}

export async function getAdminDashboardData(client, range = 'all', now = new Date()) {
  const dateRange = getAdminDashboardDateRange(range, now)
  const count = (table, filters = {}, dateField = 'created_at') => countRecords(client, table, { filters, dateField, dateRange })
  const [
    users,
    studentProfiles,
    employerProfiles,
    demoEmployers,
    jobsTotal,
    demoJobs,
    publishedJobs,
    draftJobs,
    closedJobs,
    archivedJobs,
    applications,
    interviews,
    employment,
    activeEmployment,
    completedEmployment,
    terminatedEmployment,
    onLeaveEmployment,
    assessments,
    publishedAssessments,
    draftAssessments,
    archivedAssessments,
    resourcesTotal,
    demoResources,
    publishedResources,
    draftResources,
    archivedResources,
    skills,
    careers,
    alertsResult,
  ] = await Promise.all([
    count('profiles'),
    count('student_profiles'),
    count('employer_profiles'),
    count('employer_profiles', { is_demo: true }),
    count('jobs'),
    count('jobs', { is_demo: true }),
    count('jobs', { status: 'published', is_demo: false }, 'published_at'),
    count('jobs', { status: 'draft', is_demo: false }),
    count('jobs', { status: 'closed', is_demo: false }),
    count('jobs', { status: 'archived', is_demo: false }),
    count('applications', {}, 'applied_at'),
    count('interviews', {}, 'scheduled_at'),
    count('employment'),
    count('employment', { status: 'active' }),
    count('employment', { status: 'completed' }),
    count('employment', { status: 'terminated' }),
    count('employment', { status: 'on_leave' }),
    count('assessments'),
    count('assessments', { status: 'published' }),
    count('assessments', { status: 'draft' }),
    count('assessments', { status: 'archived' }),
    count('learning_resources'),
    count('learning_resources', { is_demo: true }),
    count('learning_resources', { status: 'published', is_demo: false }, 'published_at'),
    count('learning_resources', { status: 'draft', is_demo: false }),
    count('learning_resources', { status: 'archived', is_demo: false }),
    count('skills'),
    count('careers'),
    client.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(8),
  ])
  if (alertsResult.error) throw new Error('Unable to load recent admin activity.')

  return {
    dateRange,
    metrics: {
      users,
      studentProfiles,
      employers: Math.max(0, employerProfiles - demoEmployers),
      demoEmployers,
      jobs: publishedJobs,
      jobsTotal,
      platformJobs: Math.max(0, jobsTotal - demoJobs),
      demoJobs,
      draftJobs,
      closedJobs,
      archivedJobs,
      applications,
      interviews,
      employment,
      activeEmployment,
      completedEmployment,
      terminatedEmployment,
      onLeaveEmployment,
      assessments,
      publishedAssessments,
      draftAssessments,
      archivedAssessments,
      resources: publishedResources,
      resourcesTotal,
      demoResources,
      draftResources,
      archivedResources,
      skills,
      careers,
    },
    alerts: alertsResult.data || [],
  }
}
