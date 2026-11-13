import { supabase } from './supabase'
import { requireData } from './serviceUtils'

export const employmentService = {
  async list(studentId) {
    const { data, error } = await supabase.from('employment').select('*, employer_profiles(*), employment_progress(*)').eq('student_id', studentId).order('start_date', { ascending: false })
    return requireData(data, error, 'Unable to load employment history.')
  },
}
