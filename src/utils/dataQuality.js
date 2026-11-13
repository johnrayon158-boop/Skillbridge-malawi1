import {
  ALLOWED_APPLICATION_STATUSES,
  ALLOWED_JOB_STATUSES,
  validateEmail,
  validatePercentage,
  validateRole,
} from './dataValidation.js'

const RESOURCE_TYPES = ['course', 'video', 'article', 'book', 'tutorial', 'project', 'practice', 'certificate']
const ASSESSMENT_TYPES = ['skill', 'career', 'job', 'practice']

export function getDataQualityProblems(entity, record) {
  switch (entity) {
    case 'Users':
      return [
        ...(!validateRole(record.role) ? ['Invalid or missing user role'] : []),
        ...(!validateEmail(record.email) ? ['Invalid or missing email address'] : []),
      ]
    case 'Jobs':
      return [
        ...(!record.employer_id ? ['Missing employer reference'] : []),
        ...(!String(record.title || '').trim() ? ['Missing job title'] : []),
        ...(!String(record.description || '').trim() ? ['Missing job description'] : []),
        ...(!ALLOWED_JOB_STATUSES.includes(String(record.status || '').trim().toLowerCase()) ? ['Invalid or missing job status'] : []),
      ]
    case 'Applications':
      return [
        ...(!record.student_id ? ['Missing student reference'] : []),
        ...(!record.job_id ? ['Missing job reference'] : []),
        ...(!ALLOWED_APPLICATION_STATUSES.includes(String(record.status || '').trim().toLowerCase()) ? ['Invalid or missing application status'] : []),
      ]
    case 'Assessments':
      return [
        ...(!String(record.title || '').trim() ? ['Missing assessment title'] : []),
        ...(!String(record.description || '').trim() ? ['Missing assessment description'] : []),
        ...(!ASSESSMENT_TYPES.includes(record.assessment_type) ? ['Invalid or missing assessment type'] : []),
        ...(record.passing_score != null && !validatePercentage(record.passing_score) ? ['Passing score must be between 0 and 100'] : []),
      ]
    case 'Skills':
      return !String(record.name || '').trim() || String(record.name).trim().length < 2 ? ['Missing or too-short skill name'] : []
    case 'Learning Resources':
      return [
        ...(!String(record.title || '').trim() ? ['Missing resource title'] : []),
        ...(!String(record.description || '').trim() ? ['Missing resource description'] : []),
        ...(!RESOURCE_TYPES.includes(record.resource_type) ? ['Invalid or missing resource type'] : []),
      ]
    case 'Employers':
      return [
        ...(!String(record.company_name || '').trim() ? ['Missing company name'] : []),
        ...(!String(record.industry || '').trim() ? ['Missing industry'] : []),
        ...(!String(record.description || '').trim() ? ['Missing company description'] : []),
        ...(!validateEmail(record.email) ? ['Invalid or missing company email'] : []),
      ]
    default:
      return [`No data quality checks are defined for ${entity}`]
  }
}
