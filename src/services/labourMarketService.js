import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { calculateCareerDemand, calculateLocationAnalysis, calculateQualificationDemand, calculateSectorAnalysis, calculateSkillDemand, buildMarketAwareSkillsGap, buildStudentMarketInsights, getJobSector, isActiveJob } from '../../server/services/labourMarket/skillDemandService.js'
import { calculateTrendData } from '../../server/services/labourMarket/trendService.js'
import { filterSelectableSkillRows } from '../utils/skillCatalog'
import { getLabourMarketQueryFilters, summarizePostingDateCoverage } from '../utils/labourMarketReporting.js'

const toArray = (value) => Array.isArray(value) ? value : []
const JOBS_PAGE_SIZE = 500

function buildPublishedJobsQuery(filters = {}) {
  const queryFilters = getLabourMarketQueryFilters(filters)
  let query = supabase.from('jobs').select('*, employer_profiles(*), job_skills(*, skills!job_skills_skill_id_fkey(*))')
    .eq('status', 'published')
    .eq('is_demo', false)
    .order('published_at', { ascending: false })
    .order('id', { ascending: true })
  if (queryFilters.location) query = query.ilike('location', `%${queryFilters.location}%`)
  if (queryFilters.employmentType) query = query.eq('employment_type', queryFilters.employmentType)
  if (queryFilters.opportunityType === 'standard') query = query.is('opportunity_type', null)
  else if (queryFilters.opportunityType) query = query.eq('opportunity_type', queryFilters.opportunityType)
  if (queryFilters.academicProgramme) query = query.contains('eligible_programmes', [queryFilters.academicProgramme])
  if (queryFilters.career) query = query.ilike('title', `%${queryFilters.career}%`)
  if (queryFilters.postingDateRange.from) query = query.gte('published_at', queryFilters.postingDateRange.from).lte('published_at', queryFilters.postingDateRange.to)
  return query
}

async function fetchPublishedJobs(filters, errorMessage) {
  const jobs = []
  let offset = 0
  while (true) {
    const { data, error } = await buildPublishedJobsQuery(filters).range(offset, offset + JOBS_PAGE_SIZE - 1)
    const page = requireData(data, error, errorMessage)
    jobs.push(...page.map((job) => ({
      ...job,
      job_skills: filterSelectableSkillRows(job.job_skills || []),
    })))
    if (page.length < JOBS_PAGE_SIZE) {
      if (!filters.sector) return jobs
      const sectorFilter = filters.sector.trim().toLocaleLowerCase()
      return jobs.filter((job) => getJobSector(job).toLocaleLowerCase().includes(sectorFilter))
    }
    offset += JOBS_PAGE_SIZE
  }
}

export const labourMarketService = {
  async getOverview(filters = {}) {
    const jobs = await fetchPublishedJobs(filters, 'Unable to load labour-market overview.')
    const activeJobs = jobs.filter(isActiveJob)
    const postingCoverage = summarizePostingDateCoverage(activeJobs)

    const skillDemand = calculateSkillDemand(activeJobs)
    const careerDemand = calculateCareerDemand(activeJobs)
    const sectorAnalysis = calculateSectorAnalysis(activeJobs)
    const locationAnalysis = calculateLocationAnalysis(activeJobs)
    const qualificationDemand = calculateQualificationDemand(activeJobs)
    const trends = calculateTrendData(activeJobs)

    const employers = new Set(activeJobs.map((job) => job.employer_id || job.employer_profiles?.id || 'unknown'))
    const sectors = new Set(activeJobs.map(getJobSector))
    const skills = new Set(activeJobs.flatMap((job) => toArray(job.job_skills).map((entry) => entry?.skills?.name || entry?.skill_name || entry?.name || '').filter(Boolean)))

    const employmentTypeMap = activeJobs.reduce((acc, job) => {
      const key = job.employment_type || 'Not specified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    return {
      totalJobs: activeJobs.length,
      ...postingCoverage,
      totalEmployers: employers.size,
      totalSectors: sectors.size,
      totalUniqueSkills: skills.size,
      mostRequestedSkill: skillDemand.items[0] || null,
      mostRequestedCareer: careerDemand.items[0] || null,
      mostActiveSector: sectorAnalysis.items[0] || null,
      recentJobs: activeJobs.slice(0, 8),
      jobsByLocation: locationAnalysis.items || [],
      jobsByEmploymentType: Object.entries(employmentTypeMap).map(([label, count]) => ({ label, count })),
      skillDemand,
      careerDemand,
      sectors: sectorAnalysis,
      locations: locationAnalysis,
      qualifications: qualificationDemand,
      trends,
      hasData: activeJobs.length > 0,
    }
  },

  async getSkillDemand(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateSkillDemand(jobs, filters)
  },

  async getCareerDemand(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateCareerDemand(jobs)
  },

  async getSectors(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateSectorAnalysis(jobs)
  },

  async getLocations(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateLocationAnalysis(jobs)
  },

  async getQualifications(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateQualificationDemand(jobs)
  },

  async getTrends(filters = {}) {
    const jobs = await this.getRawJobs(filters)
    return calculateTrendData(jobs)
  },

  async getStudentInsights(studentId, targetCareer = '', skills = []) {
    const jobs = await this.getRawJobs({ career: targetCareer })
    return buildStudentMarketInsights({ studentSkills: skills, targetCareer, jobs })
  },

  async getMarketAwareGap(studentId, targetCareer = '', userSkills = [], marketSkills = []) {
    const jobs = await this.getRawJobs({ career: targetCareer })
    const currentSkills = toArray(userSkills)
    const requiredSkills = toArray(jobs.flatMap((job) => toArray(job.job_skills).map((entry) => ({ skill: entry?.skills?.name || entry?.skill_name || entry?.name || entry?.skill }))))
    return buildMarketAwareSkillsGap({ userSkills: currentSkills, targetCareer, requiredSkills, marketSkills })
  },

  async getRawJobs(filters = {}) {
    const jobs = await fetchPublishedJobs(filters, 'Unable to load labour-market records.')
    if (!filters.skill) return jobs
    const normalizedSkill = String(filters.skill).trim().toLocaleLowerCase()
    return jobs.filter((job) => toArray(job.job_skills).some((entry) => {
      const name = entry?.skills?.name || entry?.skill_name || entry?.name || entry?.skill || ''
      return String(name).toLocaleLowerCase().includes(normalizedSkill)
    }))
  },
}
