import { supabase } from './supabase'
import { requireData } from './serviceUtils'

export const offerService = {
  async create(offer) {
    const { data, error } = await supabase.rpc('employer_create_offer', offer)
    if (error?.code === 'PGRST202') {
      throw new Error('The offer database function is missing from Supabase. Apply the latest migration, then try again.')
    }
    return requireData(data, error, 'Unable to create the offer.')
  },

  async respond(applicationId, response) {
    if (!['accepted', 'declined'].includes(response)) {
      throw new Error('Offer response must be accepted or declined.')
    }
    const { data, error } = await supabase.rpc('student_respond_to_offer', {
      p_application_id: applicationId,
      p_response: response,
    })
    if (error?.code === 'PGRST202') {
      throw new Error('The offer response function is missing from Supabase. Apply the latest migration, then try again.')
    }
    return requireData(data, error, 'Unable to respond to this offer.')
  },
}
