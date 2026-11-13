export const ALLOWED_ROLES = ['student', 'graduate', 'employer', 'institution', 'admin']
import { APPLICATION_STATUSES } from '../constants/database.js'

export const ALLOWED_APPLICATION_STATUSES = APPLICATION_STATUSES
export const ALLOWED_JOB_STATUSES = ['draft', 'published', 'closed', 'archived']

export function normalizeSkillName(value = '') {
  const raw = String(value || '').trim().replace(/\s+/g, ' ')
  if (!raw) return ''

  const normalized = raw
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, ' ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const aliases = {
    'java script': 'javascript',
    javascript: 'javascript',
    'js': 'javascript',
    'sql': 'sql',
    'microsoft excel': 'microsoft excel',
    'excel': 'microsoft excel',
    'python': 'python',
    'project management': 'project management',
    'machine learning': 'machine learning',
  }

  return aliases[normalized] || normalized.replace(/[^a-z0-9+\s-]/g, '').replace(/\s+/g, ' ').trim()
}

export function validateEmail(email) {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function validateRole(role) {
  if (typeof role !== 'string') return false
  return ALLOWED_ROLES.includes(role.trim().toLowerCase())
}

export function validateScore(score, max = 100) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return false
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return false
  return numeric >= 0 && numeric <= max
}

export function validatePercentage(value) {
  return validateScore(value, 100)
}

export function validateApplicationStatus(status) {
  if (typeof status !== 'string') return false
  return ALLOWED_APPLICATION_STATUSES.includes(status.trim().toLowerCase())
}

export function validateJobStatus(status) {
  if (typeof status !== 'string') return false
  return ALLOWED_JOB_STATUSES.includes(status.trim().toLowerCase())
}

export function validateRequiredFields(record, requiredFields = []) {
  if (!record || typeof record !== 'object') return false

  return requiredFields.every((field) => {
    const value = record[field]
    if (value === null || value === undefined) return false
    if (typeof value === 'string' && value.trim() === '') return false
    return true
  })
}

export function computeDataQualityScore(validCount, totalCount) {
  if (!totalCount) return 0
  return Math.round((validCount / totalCount) * 1000) / 10
}
