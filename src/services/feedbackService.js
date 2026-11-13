import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { buildEmployerFeedbackSubmission } from '../utils/employerFeedbackRules.js'

const normalizeRating = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (!['number', 'string'].includes(typeof value)) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 5 ? numeric : null
}

export const feedbackService = {
  async listEligibleCandidates(employerId) {
    const [applicationsResult, employmentResult] = await Promise.all([
      supabase
        .from('applications')
        .select('id, student_id, status, applied_at, job_id, jobs!inner(id, title, employer_id), student_profiles!inner(id, profiles(full_name, avatar_url))')
        .eq('jobs.employer_id', employerId)
        .order('applied_at', { ascending: false }),
      supabase
        .from('employment')
        .select('id, student_id, employer_id, position, start_date, status, job_id, employer_profiles(company_name), student_profiles!inner(id, profiles(full_name, avatar_url))')
        .eq('employer_id', employerId)
        .order('start_date', { ascending: false }),
    ])

    const applicationRecords = requireData(applicationsResult.data, applicationsResult.error, 'Unable to load eligible candidates.') || []
    const employmentRecords = requireData(employmentResult.data, employmentResult.error, 'Unable to load employment records.') || []

    const grouped = new Map()

    for (const record of [...applicationRecords, ...employmentRecords]) {
      const studentId = record.student_id
      const profiles = record.student_profiles?.profiles || record.student_profiles?.[0]?.profiles || {}
      const existing = grouped.get(studentId) || {
        candidate_id: studentId,
        full_name: profiles.full_name || 'Candidate',
        avatar_url: profiles.avatar_url || null,
        relationships: [],
      }

      if (record.jobs) {
        existing.relationships.push({
          type: 'application',
          id: record.id,
          application_id: record.id,
          job_id: record.job_id,
          title: record.jobs.title || 'Application',
          status: record.status || 'submitted',
          context: record.applied_at || record.created_at || null,
        })
      }

      if (record.position) {
        existing.relationships.push({
          type: 'employment',
          id: record.id,
          employment_id: record.id,
          job_id: record.job_id || null,
          title: record.position,
          status: record.status || 'active',
          context: record.start_date || null,
        })
      }

      grouped.set(studentId, existing)
    }

    return [...grouped.values()].sort((left, right) => left.full_name.localeCompare(right.full_name))
  },

  async listForEmployer(employerId) {
    const { data, error } = await supabase
      .from('employer_feedback')
      .select('*, employer_profiles(company_name), jobs(id, title), applications(id, status), student_profiles(id, profiles(full_name, avatar_url)), employer_feedback_competencies(*), employer_feedback_acknowledgements(*)')
      .eq('employer_id', employerId)
      .order('review_date', { ascending: false })

    return requireData(data, error, 'Unable to load employer feedback.') || []
  },

  async listForStudent(studentId) {
    const { data, error } = await supabase
      .from('employer_feedback')
      .select('*, employer_profiles(company_name), jobs(id, title), applications(id, status), employer_feedback_competencies(*), employer_feedback_acknowledgements(*)')
      .eq('candidate_id', studentId)
      .in('status', ['submitted', 'validated', 'disputed'])
      .order('review_date', { ascending: false })

    return requireData(data, error, 'Unable to load your feedback.') || []
  },

  async submitFeedback(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Feedback submission must be an object.')
    }
    const inputCompetencies = payload.competencies || []
    if (!Array.isArray(inputCompetencies)) throw new Error('Competencies must be a list.')
    const competencyRows = inputCompetencies.map((item) => {
      const name = typeof item?.name === 'string' ? item.name.trim() : ''
      const notObserved = item?.not_observed === true || item?.rating === 'not_observed'
      const rating = notObserved ? null : normalizeRating(item?.rating)
      if (!name || name.length > 120) throw new Error('Each competency needs a name of 1 to 120 characters.')
      if (!notObserved && rating === null) throw new Error(`Provide a valid 0 to 5 rating for ${name}, or mark it as not observed.`)
      return {
        name,
        rating,
        rating_label: notObserved ? 'Not observed' : (item.rating_label || String(item.rating)),
        evidence: item.evidence || '',
        comment: item.comment || '',
        not_observed: notObserved,
      }
    })

    const feedbackPayload = buildEmployerFeedbackSubmission(payload)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== feedbackPayload.employer_id) {
      throw new Error('You can only submit feedback as the signed-in employer.')
    }

    const { data, error } = await supabase.rpc('submit_employer_feedback', {
      p_feedback: feedbackPayload,
      p_competencies: competencyRows,
    })
    return requireData(data, error, 'Unable to submit feedback.')
  },

  async acknowledgeFeedback(feedbackId, studentId, status = 'acknowledged', notes = '') {
    if (!['acknowledged', 'disputed'].includes(status)) {
      throw new Error('Choose whether to acknowledge or dispute this feedback.')
    }
    if (status === 'disputed' && String(notes).trim().length < 5) {
      throw new Error('Please explain your dispute in at least 5 characters.')
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== studentId) {
      throw new Error('You can only respond to feedback on your own profile.')
    }

    const { data, error } = await supabase.rpc('respond_to_employer_feedback', {
      p_feedback_id: feedbackId,
      p_status: status,
      p_notes: String(notes).trim(),
    })

    return requireData(data, error, 'Unable to update feedback acknowledgement.')
  },
}
