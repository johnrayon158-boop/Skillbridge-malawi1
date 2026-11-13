import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { aiService } from './aiService'

export const matchingService = {
  async getMatches(studentId) {
    const { data, error } = await supabase.from('job_matches').select('*, jobs!inner(*, employer_profiles(*))').eq('student_id', studentId).eq('jobs.status', 'published').order('match_score', { ascending: false })
    const matches = requireData(data, error, 'Unable to load job matches.')
    const today = new Date().toISOString().slice(0, 10)
    return matches.filter((item) => !item.jobs?.application_deadline || item.jobs.application_deadline >= today)
  },

  async refreshMatches(studentId) {
    const result = await aiService.getJobMatches(studentId)
    if (!Array.isArray(result?.matches)) throw new Error('Match analysis returned an incomplete response.')
    return result.matches
  },

  async refreshEmployerApplicationMatches(applicationIds) {
    if (!Array.isArray(applicationIds) || !applicationIds.length) return []
    const result = await aiService.refreshEmployerApplicationMatches(applicationIds)
    if (!Array.isArray(result?.matches)) throw new Error('Match analysis returned an incomplete response.')
    return result.matches
  },

  async getReadiness(studentId, careerId) {
    const { data, error } = await supabase.from('career_progress').select('*').eq('student_id', studentId).eq('career_id', careerId).maybeSingle()
    return requireData(data, error, 'Unable to load readiness.')
  },
}
