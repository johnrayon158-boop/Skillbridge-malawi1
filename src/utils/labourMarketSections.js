export const LABOUR_MARKET_SECTION_INFO = {
  overview: {
    title: 'Early Platform Signals',
    description: 'Demand indicators are calculated from published, unexpired SkillBridge job postings—not national labour-market estimates.',
  },
  skills: {
    title: 'Skill demand',
    description: 'Ranked skill requirements from published, unexpired SkillBridge job postings.',
  },
  careers: {
    title: 'Career demand',
    description: 'Career and job-title demand observed in published SkillBridge opportunities.',
  },
  sectors: {
    title: 'Sector analysis',
    description: 'Sector representation and requested skills from active SkillBridge postings.',
  },
  jobs: {
    title: 'Published opportunities',
    description: 'Published, unexpired opportunities included in the platform labour-market sample.',
  },
  trends: {
    title: 'Demand trends',
    description: 'Month-over-month posting and skill-demand signals; sparse data is identified as insufficient.',
  },
  reports: {
    title: 'Labour-market report',
    description: 'A generated summary of the current SkillBridge posting sample and its observed demand signals.',
  },
}

const SECTION_METHODS = {
  overview: 'getOverview',
  skills: 'getSkillDemand',
  careers: 'getCareerDemand',
  sectors: 'getSectors',
  jobs: 'getJobs',
  trends: 'getTrends',
  reports: 'getReport',
}

export function loadLabourMarketSectionData(service, section, filters = {}) {
  const method = SECTION_METHODS[section]
  if (!method || typeof service?.[method] !== 'function') {
    throw new Error(`Labour-market section "${section}" is not available.`)
  }
  return service[method](filters)
}
