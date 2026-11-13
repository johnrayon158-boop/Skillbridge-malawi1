export const ROLES = Object.freeze({
  STUDENT: 'student',
  EMPLOYER: 'employer',
  ADMIN: 'admin',
})

export const SKILL_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced', 'expert'])

export const APPLICATION_STATUSES = Object.freeze([
  'applied', 'under_review', 'shortlisted', 'assessment', 'interview',
  'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined',
  'expired', 'position_closed',
])

export const APPLICATION_STATUS_LABELS = Object.freeze({
  applied: 'Applied',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  offer_declined: 'Offer declined',
  expired: 'Expired',
  position_closed: 'Position closed',
})

export const APPLICATION_LIFECYCLE = APPLICATION_STATUSES

export const EMPLOYMENT_TYPES = Object.freeze([
  'full_time', 'part_time', 'contract', 'internship', 'graduate', 'temporary', 'volunteer',
])

export const WORK_MODES = Object.freeze(['onsite', 'remote', 'hybrid'])

export const ASSESSMENT_TYPES = Object.freeze(['skill', 'career', 'job', 'practice'])

export const VERIFICATION_STATUSES = Object.freeze(['pending', 'verified', 'rejected'])

export const NOTIFICATION_TYPES = Object.freeze([
  'application_update',
  'interview_reminder',
  'skill_gap_update',
  'learning_recommendation',
  'new_job_match',
  'career_recommendation',
  'employer_message',
])
