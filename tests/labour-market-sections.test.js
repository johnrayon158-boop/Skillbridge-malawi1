import assert from 'node:assert/strict'
import test from 'node:test'
import { loadLabourMarketSectionData, LABOUR_MARKET_SECTION_INFO } from '../src/utils/labourMarketSections.js'

test('each labour-market route loads its own domain service method', async () => {
  const requested = []
  const service = Object.fromEntries([
    'getOverview',
    'getSkillDemand',
    'getCareerDemand',
    'getSectors',
    'getJobs',
    'getTrends',
    'getReport',
  ].map((method) => [method, async (filters) => {
    requested.push({ method, filters })
    return method
  }]))
  const filters = { sector: 'Agriculture' }

  for (const [section, method] of Object.entries({
    overview: 'getOverview',
    skills: 'getSkillDemand',
    careers: 'getCareerDemand',
    sectors: 'getSectors',
    jobs: 'getJobs',
    trends: 'getTrends',
    reports: 'getReport',
  })) {
    assert.equal(await loadLabourMarketSectionData(service, section, filters), method)
  }

  assert.deepEqual(requested.map(({ method }) => method), [
    'getOverview',
    'getSkillDemand',
    'getCareerDemand',
    'getSectors',
    'getJobs',
    'getTrends',
    'getReport',
  ])
  assert.ok(requested.every((request) => request.filters === filters))
  assert.ok(Object.hasOwn(LABOUR_MARKET_SECTION_INFO, 'reports'))
})

test('unknown labour-market routes fail explicitly', () => {
  assert.throws(
    () => loadLabourMarketSectionData({}, 'unknown'),
    /section "unknown" is not available/i,
  )
})
