export const ADMIN_JOB_DETAIL_SELECT = 'id, title, department, description, location, employment_type, work_mode, salary_min, salary_max, currency, experience_required, education_required, application_deadline, status, published_at, created_at, updated_at, employer_profiles(company_name, email), applications(id, status), job_skills(id, skill_id, required_level, importance, is_required, skills!job_skills_skill_id_fkey(name))'

export function groupJobSkills(jobSkills) {
  const skills = Array.isArray(jobSkills) ? jobSkills : []
  return {
    required: skills.filter((skill) => skill?.is_required !== false),
    preferred: skills.filter((skill) => skill?.is_required === false),
  }
}
