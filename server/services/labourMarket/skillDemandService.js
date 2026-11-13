export const SKILL_DEMAND_WEIGHTS = {
  frequency: 0.45,
  employerShare: 0.2,
  sectorCoverage: 0.2,
  recency: 0.15,
}

const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

export function normalizeSkillName(value = '') {
  return String(value || '').trim()
}

export function getJobSector(job = {}) {
  return String(job.sector || job.category || job.industry || job.employer_profiles?.industry || 'Uncategorized').trim() || 'Uncategorized'
}

export function isActiveJob(job = {}) {
  if (!job || typeof job !== 'object') return false
  const status = String(job.status || '').toLowerCase()
  if (status && status !== 'published') return false
  const deadline = job.application_deadline || job.deadline || job.expires_at || job.expiry_date
  if (deadline) {
    const expiry = new Date(deadline)
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) return false
  }
  return true
}

export function calculateSkillDemand(jobs = [], options = {}) {
  const totalJobs = (Array.isArray(jobs) ? jobs.filter(isActiveJob) : []).length
  if (!totalJobs) {
    return { totalJobs: 0, items: [], hasData: false, summary: 'Insufficient data' }
  }

  const map = new Map()
  for (const job of jobs) {
    if (!isActiveJob(job)) continue

    const employerKey = job.employer_id || job.employer_profiles?.id || job.company_name || job.employer || 'unknown'
    const sector = getJobSector(job)
    const skillEntries = Array.isArray(job.job_skills) ? job.job_skills : []

    if (!skillEntries.length) continue

    for (const entry of skillEntries) {
      const skillName = normalizeSkillName(entry?.skills?.name || entry?.name || entry?.skill_name || entry?.skill)
      if (!skillName) continue

      const record = map.get(skillName) || {
        skill: skillName,
        jobCount: 0,
        employerCount: new Set(),
        sectorCount: new Set(),
        recentCount: 0,
      }

      record.jobCount += 1
      record.employerCount.add(String(employerKey))
      record.sectorCount.add(String(sector))

      const postedAt = job.published_at || job.created_at || job.posted_at
      if (postedAt) {
        const time = new Date(postedAt).getTime()
        if (!Number.isNaN(time)) {
          const ageInDays = (Date.now() - time) / 86400000
          if (ageInDays <= 90) record.recentCount += 1
        }
      }

      map.set(skillName, record)
    }
  }

  const items = [...map.values()].map((record) => {
    const jobCount = record.jobCount
    const employerCount = record.employerCount.size
    const sectorCount = record.sectorCount.size
    const recentCount = record.recentCount
    const shareOfJobs = (jobCount / totalJobs) * 100
    const demandScore = (
      (jobCount * SKILL_DEMAND_WEIGHTS.frequency) +
      (shareOfJobs * SKILL_DEMAND_WEIGHTS.employerShare) +
      (sectorCount * 3 * SKILL_DEMAND_WEIGHTS.sectorCoverage) +
      (recentCount * 0.5 * SKILL_DEMAND_WEIGHTS.recency)
    )

    return {
      skill: record.skill,
      jobCount,
      shareOfJobs: Number(shareOfJobs.toFixed(1)),
      employerCount,
      sectorCount,
      recentCount,
      demandScore: Number(demandScore.toFixed(2)),
    }
  }).sort((a, b) => b.jobCount - a.jobCount || b.demandScore - a.demandScore)

  return {
    totalJobs,
    items,
    hasData: items.length > 0,
    summary: items.length ? 'Skill demand calculated from active job requirements.' : 'Insufficient data',
    filters: options || {},
  }
}

export function calculateCareerDemand(jobs = []) {
  const activeJobs = Array.isArray(jobs) ? jobs.filter(isActiveJob) : []
  if (!activeJobs.length) {
    return { totalJobs: 0, items: [], hasData: false, summary: 'Insufficient data' }
  }

  const map = new Map()
  for (const job of activeJobs) {
    const careerLabel = normalizeSkillName(job.career_name || job.careers?.title || job.title || job.role || 'Uncategorized') || 'Uncategorized'
    const record = map.get(careerLabel) || { career: careerLabel, jobCount: 0, employerCount: new Set(), sectors: new Set() }
    record.jobCount += 1
    record.employerCount.add(String(job.employer_id || job.employer_profiles?.id || 'unknown'))
    record.sectors.add(getJobSector(job))
    map.set(careerLabel, record)
  }

  const items = [...map.values()].map((entry) => ({
    career: entry.career,
    jobCount: entry.jobCount,
    employerCount: entry.employerCount.size,
    sectorCount: entry.sectors.size,
    shareOfJobs: Number(((entry.jobCount / activeJobs.length) * 100).toFixed(1)),
  })).sort((a, b) => b.jobCount - a.jobCount)

  return { totalJobs: activeJobs.length, items, hasData: items.length > 0, summary: items.length ? 'Career demand calculated from active job postings.' : 'Insufficient data' }
}

export function calculateSectorAnalysis(jobs = []) {
  const activeJobs = Array.isArray(jobs) ? jobs.filter(isActiveJob) : []
  if (!activeJobs.length) return { totalJobs: 0, items: [], hasData: false, summary: 'Insufficient data' }

  const map = new Map()
  for (const job of activeJobs) {
    const sector = getJobSector(job)
    const record = map.get(sector) || { sector, jobCount: 0, employerCount: new Set(), skills: new Map(), roles: new Map(), qualifications: new Map() }
    record.jobCount += 1
    record.employerCount.add(String(job.employer_id || job.employer_profiles?.id || 'unknown'))

    const requiredSkills = Array.isArray(job.job_skills) ? job.job_skills : []
    for (const entry of requiredSkills) {
      const skillName = normalizeSkillName(entry?.skills?.name || entry?.name || entry?.skill_name || entry?.skill)
      if (!skillName) continue
      record.skills.set(skillName, (record.skills.get(skillName) || 0) + 1)
    }

    const roleName = normalizeSkillName(job.title || job.role || 'Unspecified role') || 'Unspecified role'
    record.roles.set(roleName, (record.roles.get(roleName) || 0) + 1)

    const qualification = normalizeSkillName(job.education_required || job.qualification || job.minimum_qualification || 'Not specified') || 'Not specified'
    record.qualifications.set(qualification, (record.qualifications.get(qualification) || 0) + 1)

    map.set(sector, record)
  }

  const items = [...map.entries()].map(([sector, record]) => ({
    sector,
    jobCount: record.jobCount,
    employerCount: record.employerCount.size,
    mostRequestedSkills: [...record.skills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([skill, count]) => ({ skill, count })),
    mostCommonRoles: [...record.roles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([role, count]) => ({ role, count })),
    mostRequestedQualifications: [...record.qualifications.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([qualification, count]) => ({ qualification, count })),
  })).sort((a, b) => b.jobCount - a.jobCount)

  return { totalJobs: activeJobs.length, items, hasData: items.length > 0, summary: items.length ? 'Sector demand calculated from current role postings.' : 'Insufficient data' }
}

export function calculateLocationAnalysis(jobs = []) {
  const activeJobs = Array.isArray(jobs) ? jobs.filter(isActiveJob) : []
  if (!activeJobs.length) return { totalJobs: 0, items: [], hasData: false, summary: 'Insufficient data' }

  const map = new Map()
  for (const job of activeJobs) {
    const location = normalizeSkillName(job.location || 'Not specified') || 'Not specified'
    const mode = String(job.work_mode || job.mode || 'On-site').toLowerCase()
    const record = map.get(location) || { location, jobs: 0, remote: 0, hybrid: 0, onsite: 0 }
    record.jobs += 1
    if (mode.includes('remote')) record.remote += 1
    else if (mode.includes('hybrid')) record.hybrid += 1
    else record.onsite += 1
    map.set(location, record)
  }

  return {
    totalJobs: activeJobs.length,
    items: [...map.values()].sort((a, b) => b.jobs - a.jobs),
    remoteJobs: activeJobs.filter((job) => String(job.work_mode || '').toLowerCase().includes('remote')).length,
    hybridJobs: activeJobs.filter((job) => String(job.work_mode || '').toLowerCase().includes('hybrid')).length,
    onsiteJobs: activeJobs.filter((job) => !String(job.work_mode || '').toLowerCase().includes('remote') && !String(job.work_mode || '').toLowerCase().includes('hybrid')).length,
    hasData: true,
  }
}

export function calculateQualificationDemand(jobs = []) {
  const activeJobs = Array.isArray(jobs) ? jobs.filter(isActiveJob) : []
  if (!activeJobs.length) return { totalJobs: 0, items: [], hasData: false, summary: 'Insufficient data' }

  const map = new Map()
  for (const job of activeJobs) {
    const qualification = normalizeSkillName(job.education_required || job.minimum_qualification || job.qualification || 'Not specified') || 'Not specified'
    const record = map.get(qualification) || { qualification, count: 0, sectors: new Set(), careers: new Set() }
    record.count += 1
    record.sectors.add(getJobSector(job))
    record.careers.add(normalizeSkillName(job.title || job.role || 'Uncategorized'))
    map.set(qualification, record)
  }

  return {
    totalJobs: activeJobs.length,
    items: [...map.values()].map((entry) => ({
      qualification: entry.qualification,
      jobCount: entry.count,
      sectorCount: entry.sectors.size,
      careerCount: entry.careers.size,
    })).sort((a, b) => b.jobCount - a.jobCount),
    hasData: true,
  }
}

export function buildStudentMarketInsights({ studentSkills = [], targetCareer = '', jobs = [] } = {}) {
  const activeJobs = Array.isArray(jobs) ? jobs.filter(isActiveJob) : []
  const studentSkillSet = new Set(studentSkills.map((skill) => normalizeSkillName(skill).toLowerCase()))

  if (!activeJobs.length) {
    return { targetCareer: targetCareer || 'Insufficient data', summary: 'Insufficient data', skills: [], missingSkills: [], marketPriority: 'Insufficient data' }
  }

  const relevantJobs = targetCareer
    ? activeJobs.filter((job) => String(job.title || job.role || job.career_name || '').toLowerCase().includes(String(targetCareer).toLowerCase()) || String(job.careers?.title || '').toLowerCase().includes(String(targetCareer).toLowerCase()))
    : activeJobs

  const marketSkillMap = new Map()
  for (const job of relevantJobs) {
    const requiredSkills = Array.isArray(job.job_skills) ? job.job_skills : []
    for (const entry of requiredSkills) {
      const skillName = normalizeSkillName(entry?.skills?.name || entry?.name || entry?.skill_name || entry?.skill)
      if (!skillName) continue
      marketSkillMap.set(skillName, (marketSkillMap.get(skillName) || 0) + 1)
    }
  }

  const sortedSkills = [...marketSkillMap.entries()].map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count)
  const missingSkills = sortedSkills.filter((item) => !studentSkillSet.has(item.skill.toLowerCase()))

  return {
    targetCareer: targetCareer || (relevantJobs[0]?.title || 'Career demand'),
    summary: sortedSkills.length ? `Based on ${relevantJobs.length} matching job postings in SkillBridge, ${sortedSkills[0]?.skill || 'core skills'} appears most frequently in the current market.` : 'Insufficient data for a reliable student market summary.',
    skills: sortedSkills.slice(0, 6),
    missingSkills: missingSkills.slice(0, 6),
    marketPriority: missingSkills.length ? 'Market-based priority' : 'Insufficient data',
    jobCount: relevantJobs.length,
  }
}

export function buildMarketAwareSkillsGap({ userSkills = [], targetCareer = '', requiredSkills = [], marketSkills = [] } = {}) {
  const studentSet = new Set(userSkills.map((skill) => normalizeSkillName(skill).toLowerCase()))
  const marketDemand = new Map()
  for (const item of marketSkills) {
    const name = normalizeSkillName(item?.skill || item?.name || item)
    if (!name) continue
    marketDemand.set(name.toLowerCase(), safeNumber(item?.count || item?.jobCount || item?.demandScore || 0))
  }

  const gaps = requiredSkills.map((item) => {
    const skillName = normalizeSkillName(item?.skill || item?.name || item)
    if (!skillName) return null
    const missing = !studentSet.has(skillName.toLowerCase())
    const demand = marketDemand.get(skillName.toLowerCase()) || 0
    let priority = 'Low'
    if (missing && demand >= 8) priority = 'High'
    else if (missing && demand >= 4) priority = 'Medium'
    else if (missing && demand >= 1) priority = 'Low'
    return {
      skill: skillName,
      missing,
      demand,
      priority,
      label: missing ? `Market-based priority: ${priority}` : 'Already present',
    }
  }).filter(Boolean)

  return { targetCareer: targetCareer || 'career profile', gaps, hasData: gaps.length > 0 }
}
