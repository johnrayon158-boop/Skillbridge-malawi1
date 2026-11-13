import { supabase } from './supabase'
import { requireData } from './serviceUtils'

export const recruitmentService = {
  async listStages(employerId) {
    const { data, error } = await supabase.from('recruitment_stages').select('*, jobs(title), application_stage_progress(*)').eq('employer_id', employerId).order('sequence_order')
    return requireData(data, error, 'Unable to load recruitment stages.')
  },

  async saveStage(stage) {
    const { data, error } = await supabase.from('recruitment_stages').upsert(stage).select().single()
    return requireData(data, error, 'Unable to save the recruitment stage.')
  },

  async deleteStage(id) {
    const { error } = await supabase.from('recruitment_stages').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
}
