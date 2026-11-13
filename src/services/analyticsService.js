import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { buildEmployerAnalytics } from '../utils/employerAnalytics'

export const analyticsService = {
  async getEmployerAnalytics(employerId) {
    const [jobsResponse, employmentResponse] = await Promise.all([
      supabase.from('jobs').select('id, title, status, applications(id, status, applied_at)').eq('employer_id', employerId),
      supabase.from('employment').select('id, status').eq('employer_id', employerId),
    ])
    const jobs = requireData(jobsResponse.data, jobsResponse.error, 'Unable to load employer analytics.')
    const employment = requireData(employmentResponse.data, employmentResponse.error, 'Unable to load employer employee metrics.')
    return buildEmployerAnalytics(jobs, employment)
  },

  async getStudentAnalytics(userId) {
    const { data, error } = await supabase.from('career_progress').select('*').eq('student_id', userId).order('created_at', { ascending: false }).limit(10)
    return requireData(data, error, 'Unable to load student analytics.')
  },

  async getAdminAnalytics() {
    const [profiles, jobs, applications, interviews, offers, employment] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('applications').select('*').order('applied_at', { ascending: false }),
      supabase.from('interviews').select('*').order('scheduled_at', { ascending: false }),
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase.from('employment').select('*').order('created_at', { ascending: false }),
    ])

    return {
      profiles: profiles.data || [],
      jobs: jobs.data || [],
      applications: applications.data || [],
      interviews: interviews.data || [],
      offers: offers.data || [],
      employment: employment.data || [],
    }
  },

  async getReport(title, rows = [], filters = {}, type = 'platform') {
    return {
      title,
      rows,
      filters,
      type,
      csv: ['label,value', ...rows.map((row) => `${row.label},${row.value}`)].join('\n'),
      generatedAt: new Date().toISOString(),
    }
  },
}
