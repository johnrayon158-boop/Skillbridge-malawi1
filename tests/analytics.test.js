import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDateRange } from '../server/services/analytics/analyticsService.js'
import { buildStudentAnalytics } from '../server/services/analytics/studentAnalyticsService.js'
import { buildApplicationAnalytics } from '../server/services/analytics/applicationAnalyticsService.js'
import { buildEmployerAnalytics } from '../server/services/analytics/employerAnalyticsService.js'
import { buildSkillGapAnalytics } from '../server/services/analytics/skillAnalyticsService.js'
import { buildAdminAnalytics } from '../server/services/analytics/adminAnalyticsService.js'
import { buildReport } from '../server/services/analytics/reportService.js'

test('date ranges produce real start and end boundaries for a 30 day window', () => {
  const range = buildDateRange({ range: '30d', now: new Date('2026-10-04T12:00:00Z') })

  assert.equal(range.range, '30d')
  assert.equal(range.start instanceof Date, true)
  assert.equal(range.end instanceof Date, true)
  assert.ok(range.start.getTime() < range.end.getTime())
})

test('student analytics summarize readiness, learning, and applications from real data', () => {
  const analytics = buildStudentAnalytics({
    profile: {
      full_name: 'Amina',
      student_profiles: [{ target_role: 'Data Analyst', career_goal: 'I want to guide policy with data.' }],
    },
    careerProgress: [{ readiness_score: 78, previous_readiness_score: 70 }],
    applications: [{ status: 'submitted' }, { status: 'shortlisted' }, { status: 'interview' }],
    interviews: [{ id: 'i-1' }],
    learning: [{ status: 'active', completion_rate: 75 }, { status: 'completed', completion_rate: 100 }],
    userSkills: [{ skill_name: 'SQL', level: 'advanced' }, { skill_name: 'Excel', level: 'intermediate' }],
    projects: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }],
    certificates: [{ id: 'c-1' }],
  })

  assert.equal(analytics.overallReadiness.current, 78)
  assert.equal(analytics.applicationSummary.total, 3)
  assert.equal(analytics.applicationSummary.applied, 1)
  assert.equal(analytics.applicationSummary.outstandingOffers, 0)
  assert.equal(analytics.applicationSummary.scheduledInterviews, 1)
  assert.equal(analytics.learningSummary.activePaths, 1)
  assert.equal(analytics.portfolioSummary.totalProjects, 3)
  assert.equal(analytics.profileSummary.targetRole, 'Data Analyst')
  assert.equal(analytics.profileSummary.careerGoal, 'I want to guide policy with data.')
})

test('application analytics separate current status counts from historical status events', () => {
  const analytics = buildApplicationAnalytics({
    applications: [
      { status: 'applied' },
      { status: 'applied' },
      { status: 'under_review' },
      { status: 'shortlisted' },
      { status: 'interview' },
      { status: 'offer' },
    ],
    applicationEvents: [
      { event_type: 'application_submitted', created_at: '2026-09-01T00:00:00Z' },
      { event_type: 'interview_scheduled', created_at: '2026-09-06T00:00:00Z' },
      { application_id: 'app-1', event_type: 'interview', created_at: '2026-09-06T00:00:00Z' },
      { application_id: 'app-1', event_type: 'interview', created_at: '2026-09-07T00:00:00Z' },
    ],
  })

  assert.equal(analytics.currentStatusCounts.applied, 2)
  assert.equal(analytics.currentStatusCounts.under_review, 1)
  assert.equal(analytics.currentStatusCounts.interview, 1)
  assert.equal(analytics.interviewStageRate.value, 16.67)
  assert.equal(analytics.outstandingOfferRate.value, 33.33)
  assert.equal(analytics.statusHistory.interview, 1)
})

test('employer analytics show role-aware hiring pipeline and job totals', () => {
  const analytics = buildEmployerAnalytics({
    jobs: [
      { status: 'published', applications: [{ status: 'applied' }, { status: 'shortlisted' }, { status: 'interview' }] },
      { status: 'published', applications: [{ status: 'applied' }, { status: 'offer' }] },
      { status: 'closed', applications: [{ status: 'rejected' }] },
    ],
    employerId: 'emp-1',
  })

  assert.equal(analytics.jobSummary.activeJobs, 2)
  assert.equal(analytics.currentStatusCounts.applied, 2)
  assert.equal(analytics.currentStatusCounts.shortlisted, 1)
})

test('skill gap analytics distinguish active gaps from closed gaps using real evidence', () => {
  const analytics = buildSkillGapAnalytics({
    currentSkills: ['SQL', 'Excel'],
    requiredSkills: ['SQL', 'Power BI', 'Python'],
    progress: [{ skill_name: 'Power BI', status: 'completed' }, { skill_name: 'Python', status: 'in_progress' }],
  })

  assert.equal(analytics.activeGaps.length, 2)
  assert.ok(analytics.gapStatus.includes('Power BI'))
  assert.ok(analytics.summary.message.includes('Power BI'))
})

test('platform admin analytics expose consistent aggregate metrics and real data notes', () => {
  const analytics = buildAdminAnalytics({
    users: [{ role: 'student' }, { role: 'student' }, { role: 'employer' }],
    jobs: [{ status: 'published' }, { status: 'draft' }],
    applications: [{ status: 'applied' }, { status: 'interview' }],
    interviews: [{ id: 'x' }],
    offers: [{ id: 'o' }],
    employment: [{ status: 'active' }],
    skills: [{ id: 's1' }, { id: 's2' }],
    careers: [{ id: 'c1' }],
    recommendations: [{ id: 'r1' }, { id: 'r2' }],
  })

  assert.equal(analytics.metrics.totalUsers, 3)
  assert.equal(analytics.metrics.totalJobs, 2)
  assert.equal(analytics.metrics.totalApplications, 2)
  assert.equal(analytics.metrics.totalOffers, 0)
  assert.equal(analytics.summary.offers, 0)
  assert.ok(analytics.notes.some((entry) => entry.includes('actual platform data')))
})

test('reports can be generated with filters and CSV export data', () => {
  const report = buildReport({
    title: 'Student Career Progress Report',
    rows: [{ label: 'Readiness', value: 78 }, { label: 'Applications', value: 7 }],
    filters: { range: '30d', career: 'Data Analyst' },
    type: 'student',
  })

  assert.equal(report.title, 'Student Career Progress Report')
  assert.equal(report.filters.range, '30d')
  assert.ok(report.csv.includes('Readiness'))
  assert.ok(report.csv.includes('Data Analyst'))
})
