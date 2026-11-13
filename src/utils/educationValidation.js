const REQUIRED_EDUCATION_FIELDS = [
  ['institution', 'Enter the institution.'],
  ['programme', 'Enter the programme.'],
  ['qualification', 'Enter the qualification.'],
  ['education_level', 'Enter the education level.'],
]

function getYear(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const year = Number(value)
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : NaN
}

export function validateEducationRecord(record = {}) {
  record = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
  const errors = {}
  for (const [field, message] of REQUIRED_EDUCATION_FIELDS) {
    if (typeof record[field] !== 'string' || !record[field].trim()) errors[field] = message
  }

  for (const field of ['institution', 'programme', 'qualification', 'education_level']) {
    if (typeof record[field] === 'string' && record[field].trim().length > 160) {
      errors[field] = 'Use 160 characters or fewer.'
    }
  }
  if (typeof record.education_level === 'string' && record.education_level.trim().length > 100) {
    errors.education_level = 'Use 100 characters or fewer.'
  }
  if (typeof record.grade === 'string' && record.grade.trim().length > 40) {
    errors.grade = 'Use 40 characters or fewer.'
  }

  const startYear = getYear(record.start_year)
  const endYear = getYear(record.end_year)
  if (Number.isNaN(startYear)) errors.start_year = 'Enter a year from 1900 to 2200.'
  if (Number.isNaN(endYear)) errors.end_year = 'Enter a year from 1900 to 2200.'
  if (startYear !== null && endYear !== null && !Number.isNaN(startYear) && !Number.isNaN(endYear) && endYear < startYear) {
    errors.end_year = 'End year must be on or after the start year.'
  }
  return errors
}

export function normalizeEducationRecord(record) {
  const validationErrors = validateEducationRecord(record)
  const firstError = Object.values(validationErrors)[0]
  if (firstError) throw new Error(firstError)

  return {
    ...record,
    institution: record.institution.trim(),
    programme: record.programme.trim(),
    qualification: record.qualification.trim(),
    education_level: record.education_level.trim(),
    field_of_study: typeof record.field_of_study === 'string' ? record.field_of_study.trim() || null : record.field_of_study,
    start_year: record.start_year === '' || record.start_year == null ? null : Number(record.start_year),
    end_year: record.end_year === '' || record.end_year == null ? null : Number(record.end_year),
    grade: typeof record.grade === 'string' ? record.grade.trim() || null : record.grade,
  }
}

export function isValidEducationRecord(record) {
  return Object.keys(validateEducationRecord(record)).length === 0
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasInterest(value) {
  const interests = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : []
  return interests.some((interest) => typeof interest === 'string' && interest.trim().length > 0)
}

export function calculateStudentProfileCompletion({
  fullName,
  phone,
  bio,
  targetRole,
  interests,
  institution,
  programme,
  educationLevel,
  educationRecords = [],
} = {}) {
  const hasProfileEducation = hasText(institution) && hasText(programme) && hasText(educationLevel)
  const hasEducationRecord = Array.isArray(educationRecords) && educationRecords.some(isValidEducationRecord)
  const items = [
    { label: 'Full name', complete: hasText(fullName) },
    { label: 'Phone number', complete: hasText(phone) },
    { label: 'Bio', complete: hasText(bio) },
    { label: 'Target occupation', complete: hasText(targetRole) },
    { label: 'At least one career interest', complete: hasInterest(interests) },
    { label: 'Complete education details', complete: hasProfileEducation || hasEducationRecord },
  ]
  const percentage = Math.round(items.filter((item) => item.complete).length / items.length * 100)
  return { items, percentage, isComplete: percentage === 100 }
}
