import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateCareerDemand, calculateSectorAnalysis, calculateSkillDemand, buildStudentMarketInsights } from '../server/services/labourMarket/skillDemandService.js'
import { calculateTrendData } from '../server/services/labourMarket/trendService.js'
import { getLabourMarketQueryFilters, getPostingDateRange, summarizePostingDateCoverage } from '../src/utils/labourMarketReporting.js'

const sampleJobs = [
  {
    status: 'published',
    title: 'Frontend Developer',
    sector: 'Technology',
    location: 'Lilongwe',
    published_at: '2025-01-15T00:00:00.000Z',
    employer_id: 'emp-1',
    job_skills: [
      { skills: { name: 'React' } },
      { skills: { name: 'JavaScript' } },
      { skills: { name: 'Tailwind CSS' } },
    ],
  },
  {
    status: 'published',
    title: 'Frontend Developer',
    sector: 'Technology',
    location: 'Blantyre',
    published_at: '2025-02-15T00:00:00.000Z',
    employer_id: 'emp-2',
    job_skills: [
      { skills: { name: 'React' } },
      { skills: { name: 'TypeScript' } },
    ],
  },
  {
    status: 'published',
    title: 'Data Analyst',
    sector: 'Finance',
    location: 'Lilongwe',
    published_at: '2025-03-15T00:00:00.000Z',
    employer_id: 'emp-3',
    job_skills: [
      { skills: { name: 'Excel' } },
      { skills: { name: 'SQL' } },
      { skills: { name: 'Power BI' } },
    ],
  },
]

test('skill demand returns real demand rankings from job data', () => {
  const result = calculateSkillDemand(sampleJobs)
  assert.equal(result.hasData, true)
  assert.ok(result.items.length >= 5)
  assert.equal(result.items[0].skill, 'React')
})

test('career demand and trend data reflect observed postings', () => {
  const careerDemand = calculateCareerDemand(sampleJobs)
  assert.equal(careerDemand.hasData, true)
  assert.equal(careerDemand.items[0].career, 'Frontend Developer')

  const trend = calculateTrendData(sampleJobs)
  assert.equal(trend.hasData, true)
  assert.ok(Array.isArray(trend.series))
})

test('sector analysis uses employer industry when jobs have no sector column', () => {
  const result = calculateSectorAnalysis([
    { status: 'published', title: 'Farmer', employer_profiles: { id: 'emp-1', industry: 'Agriculture' } },
  ])

  assert.equal(result.items[0].sector, 'Agriculture')
})

test('skill trend comparisons require adjacent posting months', () => {
  const result = calculateTrendData([
    { status: 'published', published_at: '2025-01-15T00:00:00.000Z', job_skills: [{ skills: { name: 'React' } }] },
    { status: 'published', published_at: '2025-03-15T00:00:00.000Z', job_skills: [{ skills: { name: 'React' } }] },
  ])

  assert.equal(result.trendItems[0].trend, 'Insufficient data')
  assert.equal(result.trendItems[0].change, null)
})

test('student insights gracefully handle missing market data', () => {
  const result = buildStudentMarketInsights({ studentSkills: ['React'], targetCareer: 'Frontend Developer', jobs: [] })
  assert.equal(result.summary.includes('Insufficient data'), true)
})

test('labour-market signal ranges use explicit dates and safely reject unknown ranges', () => {
  const now = new Date('2026-11-13T04:34:46.553Z')
  assert.deepEqual(getPostingDateRange('year', now), {
    range: 'year',
    from: '2026-01-01T00:00:00.000Z',
    to: now.toISOString(),
  })
  assert.equal(getPostingDateRange('unknown', now).from, null)
})

test('labour-market query filters retain supported sector, programme, and opportunity selections', () => {
  const filters = getLabourMarketQueryFilters({
    sector: ' Agriculture ',
    location: ' Lilongwe ',
    career: ' Farmer ',
    employmentType: 'internship',
    opportunityType: 'industrial_attachment',
    academicProgramme: ' Agriculture ',
    postedWithin: '30d',
  }, new Date('2026-11-13T04:34:46.553Z'))

  assert.equal(filters.sector, 'Agriculture')
  assert.equal(filters.location, 'Lilongwe')
  assert.equal(filters.career, 'Farmer')
  assert.equal(filters.employmentType, 'internship')
  assert.equal(filters.opportunityType, 'industrial_attachment')
  assert.equal(filters.academicProgramme, 'Agriculture')
  assert.equal(filters.postingDateRange.from, '2026-10-14T04:34:46.553Z')
})

test('labour-market reports expose sample size and observed posting-date coverage', () => {
  const summary = summarizePostingDateCoverage([
    { published_at: '2026-09-10T00:00:00.000Z' },
    { published_at: '2026-10-25T00:00:00.000Z' },
    { published_at: null, created_at: 'invalid' },
  ])
  assert.equal(summary.sampleSize, 3)
  assert.deepEqual(summary.dateCoverage, {
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-10-25T00:00:00.000Z',
  })
  assert.deepEqual(summarizePostingDateCoverage([]), { sampleSize: 0, dateCoverage: null })
})
