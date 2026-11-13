export const EMPLOYER_JOB_TYPES = Object.freeze([
  'full_time',
  'part_time',
  'contract',
  'internship',
  'graduate',
  'temporary',
  'volunteer',
])

export function hasRequiredJobSkill(requirements = []) {
  return Array.isArray(requirements) && requirements.some((requirement) =>
    Boolean(requirement?.skill_id)
    && requirement.is_required !== false
    && requirement.is_selectable !== false,
  )
}

export function deduplicateJobSkills(requirements = []) {
  const unique = new Map()
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    if (requirement?.skill_id) unique.set(requirement.skill_id, requirement)
  }
  return [...unique.values()]
}

export function validateEmployerJob(job, { publishing = job?.status === 'published' } = {}) {
  if (!job || typeof job !== 'object') return 'Enter the job details before saving.'
  if (typeof job.employer_id !== 'string' || !job.employer_id.trim()) return 'A valid employer account is required.'
  if (typeof job.title !== 'string' || !job.title.trim()) return 'Enter an opportunity title.'
  if (typeof job.description !== 'string' || !job.description.trim()) return 'Enter an opportunity description.'
  if (!EMPLOYER_JOB_TYPES.includes(job.employment_type)) return 'Choose a valid employment type.'

  const salaryMin = job.salary_min === '' || job.salary_min == null ? null : Number(job.salary_min)
  const salaryMax = job.salary_max === '' || job.salary_max == null ? null : Number(job.salary_max)
  if (salaryMin !== null && (!Number.isFinite(salaryMin) || salaryMin < 0)) return 'Enter a valid minimum salary.'
  if (salaryMax !== null && (!Number.isFinite(salaryMax) || salaryMax < 0)) return 'Enter a valid maximum salary.'
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
    return 'Salary maximum must be greater than or equal to salary minimum.'
  }

  if (
    job.placement_start_date
    && job.placement_end_date
    && job.placement_end_date < job.placement_start_date
  ) return 'Placement end date must be on or after its start date.'

  const requirements = Array.isArray(job.job_skills) ? job.job_skills : []
  if (job.job_skills != null && !Array.isArray(job.job_skills)) return 'Job skills must be provided as a list.'
  if (requirements.some((requirement) =>
    typeof requirement?.skill_id !== 'string' || !requirement.skill_id.trim(),
  )) return 'Each selected skill must be a valid catalog entry.'
  const skillIds = requirements.map((requirement) => requirement?.skill_id).filter(Boolean)
  if (new Set(skillIds).size !== skillIds.length) return 'Remove duplicate skill selections.'
  if (publishing && !hasRequiredJobSkill(requirements)) {
    return 'Add at least one approved required skill before publishing this opportunity.'
  }
  return ''
}
