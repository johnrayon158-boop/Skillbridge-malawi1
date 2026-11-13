import { normalizeSkillName } from './dataValidation.js'

export function buildEmployerFeedbackSubmission(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Feedback submission must be an object.')
  }
  return {
    employer_id: payload.employer_id,
    candidate_id: payload.candidate_id,
    job_id: payload.job_id || null,
    application_id: payload.application_id || null,
    employment_id: payload.employment_id || null,
    feedback_type: payload.feedback_type || 'employment',
    review_date: payload.review_date || new Date().toISOString().slice(0, 10),
    reviewer_role: payload.reviewer_role || 'Supervisor',
    project_name: payload.project_name || null,
    organization: payload.organization || null,
    strengths: payload.strengths || '',
    improvement_areas: payload.improvement_areas || '',
    evidence: payload.evidence || '',
    development_plan: payload.development_plan || '',
    next_review_goals: payload.next_review_goals || '',
    overall_summary: payload.overall_summary || '',
    status: 'submitted',
    created_by: payload.employer_id,
  }
}

function latestBySkill(records) {
  const latest = new Map()
  for (const record of records) {
    const key = normalizeSkillName(record.skillName)
    const current = latest.get(key)
    const date = Date.parse(record.reviewDate || '')
    const currentDate = Date.parse(current?.reviewDate || '')
    if (!current || (Number.isFinite(date) && (!Number.isFinite(currentDate) || date >= currentDate))) {
      latest.set(key, record)
    }
  }
  return [...latest.values()]
}

export function getValidatedEmployerCompetencies(feedback = [], candidateId = '') {
  if (!candidateId) return []
  const records = []
  for (const item of Array.isArray(feedback) ? feedback : []) {
    if (item?.status !== 'validated') continue
    const candidateAck = (item.employer_feedback_acknowledgements || item.acknowledgements || [])
      .some((ack) => ack.status === 'acknowledged'
        && ack.student_id === candidateId)
    if (!candidateAck) continue

    for (const competency of item.employer_feedback_competencies || item.competencies || []) {
      const skillName = String(competency?.name || '').trim()
      const rawRating = competency?.rating
      if (rawRating === null || rawRating === undefined || rawRating === ''
        || !['number', 'string'].includes(typeof rawRating)) continue
      const rating = Number(rawRating)
      if (!skillName || competency?.not_observed || !Number.isFinite(rating) || rating < 0 || rating > 5) continue
      records.push({
        skillName,
        score: rating * 20,
        strength: rating * 20,
        type: 'employer',
        evidenceStatus: 'reviewed_by_employer',
        verificationStatus: 'candidate_acknowledged',
        title: item.jobs?.title || item.project_name || item.organization || 'Employer feedback',
        reviewDate: item.review_date || item.created_at || null,
        feedbackId: item.id,
      })
    }
  }
  return latestBySkill(records)
}
