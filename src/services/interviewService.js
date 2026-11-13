import { supabase } from './supabase'
import { requireData } from './serviceUtils'

export const interviewService = {
  async list(employerId) {
    const { data, error } = await supabase
      .from('interviews')
      .select('*, applications!inner(id, student_id, status, jobs!inner(title, employer_id), student_profiles(profiles(full_name, avatar_url)))')
      .eq('applications.jobs.employer_id', employerId)
      .order('scheduled_at', { ascending: true })
    return requireData(data, error, 'Unable to load interviews.')
  },

  async listForStudent(studentId) {
    const { data, error } = await supabase
      .from('interviews')
      .select('*, applications!inner(id, student_id, jobs(title, employer_profiles(company_name)))')
      .eq('applications.student_id', studentId)
      .order('scheduled_at', { ascending: true })
    return requireData(data, error, 'Unable to load your interviews.')
  },

  async listPolicyReportsForStudent(studentId) {
    const { data, error } = await supabase
      .from('interview_policy_reports')
      .select('id, interview_id, category, status, created_at')
      .eq('reporter_id', studentId)
    return requireData(data, error, 'Unable to load your interview reports.')
  },

  async schedule(interview) {
    const { data, error } = await supabase.rpc('employer_schedule_interview', interview)
    return requireData(data, error, 'Unable to schedule the interview.')
  },

  async update(interview) {
    const { data, error } = await supabase.rpc('employer_update_interview', interview)
    return requireData(data, error, 'Unable to update the interview.')
  },

  async submitPolicyReport(interviewId, category, details = '') {
    const { data, error } = await supabase.rpc('submit_interview_policy_report', {
      p_interview_id: interviewId,
      p_category: category,
      p_details: String(details).trim() || null,
    })
    return requireData(data, error, 'Unable to submit your interview report.')
  },
}
