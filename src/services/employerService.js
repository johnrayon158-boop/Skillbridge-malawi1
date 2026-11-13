import { supabase } from './supabase'
import { requireData } from './serviceUtils'

export const employerService = {
  async getDashboard(employerId) {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const [company, jobs, applications, interviews, offers, employees] = await Promise.all([
      supabase.from('employer_profiles').select('*').eq('id', employerId).single(),
      supabase.from('jobs').select('*, applications(id, status, student_id)').eq('employer_id', employerId).order('created_at', { ascending: false }),
      supabase.from('applications').select('*, jobs!inner(id, title, employer_id), student_profiles(id, profiles(full_name, email, avatar_url))').eq('jobs.employer_id', employerId).order('applied_at', { ascending: false }),
      supabase.from('interviews').select('*, applications!inner(id, student_id, job_id, jobs!inner(title, employer_id))', { count: 'exact' }).eq('applications.jobs.employer_id', employerId).in('status', ['scheduled', 'rescheduled']).gte('scheduled_at', now).order('scheduled_at'),
      supabase.from('offers').select('*, applications!inner(id, student_id, job_id, jobs!inner(title, employer_id))').eq('applications.jobs.employer_id', employerId),
      supabase.from('employment').select('*, student_profiles(id, profiles(full_name, email, avatar_url)), jobs(id, title), employment_progress(*)').eq('employer_id', employerId).order('start_date', { ascending: false }),
    ])
    const responses = { company, jobs, applications, interviews, offers, employees }
    const failed = Object.values(responses).find((response) => response.error && response.error.code !== 'PGRST116')
    if (failed) throw new Error(failed.error.message)
    return {
      ...Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.data || []])),
      activeJobCount: (jobs.data || []).filter((job) =>
        job.status === 'published' && (!job.application_deadline || job.application_deadline >= today),
      ).length,
      interviewCount: interviews.count || 0,
    }
  },

  async getApplicationAlerts(employerId) {
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, applied_at, jobs!inner(id, title, employer_id), student_profiles(id, profiles(full_name))')
      .eq('jobs.employer_id', employerId)
      .in('status', ['applied'])
      .order('applied_at', { ascending: false })
      .limit(50)
    return requireData(data, error, 'Unable to load new application alerts.')
  },

  async getJobAssessments(employerId) {
    const { data, error } = await supabase
      .from('job_assessments')
      .select('id, job_id, assessment_id, required, jobs!inner(id, title, employer_id), assessments!inner(id, title, description, assessment_type, status, duration_minutes, difficulty, job_id, career_id, skill_id, assessment_questions(question, question_type, options, correct_answer, points, difficulty, explanation))')
      .eq('jobs.employer_id', employerId)
      .order('created_at', { ascending: false })
    const assignments = requireData(data, error, 'Unable to load assessments for your jobs.')
    const assessmentIds = [...new Set(assignments.map((assignment) => assignment.assessment_id))]
    if (!assessmentIds.length) return { assignments, results: [] }

    const [resultResponse, applicationResponse] = await Promise.all([
      supabase
        .from('assessment_results')
        .select('id, assessment_id, student_id, score, percentage, level, passed, completed_at, student_profiles(id, profiles(full_name, avatar_url)), assessments(title)')
        .in('assessment_id', assessmentIds)
        .order('completed_at', { ascending: false }),
      supabase
        .from('applications')
        .select('job_id, student_id, jobs!inner(employer_id)')
        .eq('jobs.employer_id', employerId),
    ])
    const results = requireData(resultResponse.data, resultResponse.error, 'Unable to load candidate assessment results.')
    const applications = requireData(applicationResponse.data, applicationResponse.error, 'Unable to associate results with your job applicants.')
    const applicationPairs = new Set(applications.map((application) => `${application.job_id}:${application.student_id}`))
    const associatedResults = results.flatMap((result) => {
      const jobTitles = assignments
        .filter((assignment) => (
          assignment.assessment_id === result.assessment_id
          && applicationPairs.has(`${assignment.job_id}:${result.student_id}`)
        ))
        .map((assignment) => assignment.jobs?.title)
        .filter(Boolean)
      return jobTitles.length ? [{ ...result, job_titles: [...new Set(jobTitles)] }] : []
    })
    return { assignments, results: associatedResults }
  },

  async generateJobAssessment(jobId, assessment) {
    const { data, error } = await supabase.rpc('employer_generate_job_assessment', {
      p_job_id: jobId,
      p_duration_minutes: assessment.durationMinutes,
      p_questions: assessment.questions,
    })
    return requireData(data, error, 'Unable to generate an assessment for this job.')
  },

  async updateApplication(applicationId, status, note) {
    const { data, error } = await supabase.rpc('employer_update_application', { p_application_id: applicationId, p_status: status, p_note: note || null })
    return requireData(data, error, 'Unable to update the application stage.')
  },
}
