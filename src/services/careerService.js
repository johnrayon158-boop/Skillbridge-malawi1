import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { filterSelectableSkillRows } from '../utils/skillCatalog'

export const careerService = {
  async listCareers() {
    const { data, error } = await supabase.from('careers')
      .select('id, title, sector, description, entry_level, growth_path, academic_programmes, required_qualifications, responsibilities, opportunity_areas, outlook_summary, outlook_source, outlook_source_url, outlook_verified_at, career_skills(id, skill_id, is_required, required_level, importance, skills(id, name, category, status, approval_status, is_internal))')
      .eq('status', 'published')
      .order('title')
    return requireData(data, error, 'Unable to load careers.')
  },

  async getRecommendations(studentId) {
    const { data, error } = await supabase.from('career_recommendations').select('*, careers(*)').eq('student_id', studentId).order('match_score', { ascending: false })
    return requireData(data, error, 'Unable to load career recommendations.')
  },

  async getFeedback(studentId) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== studentId) {
      throw new Error('You can only view your own recommendation feedback.')
    }
    const { data, error } = await supabase.from('career_feedback')
      .select('id, career_recommendation_id, is_useful, relevance_rating, suitability_rating, reason, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    return requireData(data, error, 'Unable to load your recommendation feedback.')
  },

  async getRoadmap(studentId) {
    const { data, error } = await supabase.from('career_roadmaps').select('*, careers(*)').eq('student_id', studentId).order('updated_at', { ascending: false })
    return requireData(data, error, 'Unable to load the career roadmap.')
  },

  async getCareer(careerId) {
    const { data, error } = await supabase.from('careers')
      .select('id, title, sector, description, entry_level, growth_path, academic_programmes, required_qualifications, responsibilities, opportunity_areas, outlook_summary, outlook_source, outlook_source_url, outlook_verified_at, career_skills(id, skill_id, is_required, required_level, importance, skills(id, name, category, status, approval_status, is_internal)), career_learning_resources(id, learning_resources(id, title, provider, resource_type, url))')
      .eq('id', careerId)
      .eq('status', 'published')
      .single()
    const career = requireData(data, error, 'Unable to load this career.')
    return {
      ...career,
      career_skills: filterSelectableSkillRows(career.career_skills || []),
    }
  },

  async saveFeedback(feedback) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== feedback?.student_id) {
      throw new Error('You can only rate recommendations on your own profile.')
    }
    for (const field of ['relevance_rating', 'suitability_rating']) {
      const value = feedback[field]
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error(`${field === 'relevance_rating' ? 'Relevance' : 'Suitability'} ratings must be from 1 to 5.`)
      }
    }
    if (!feedback.career_recommendation_id) throw new Error('Choose a saved career recommendation to rate.')
    const changes = {
      student_id: feedback.student_id,
      career_recommendation_id: feedback.career_recommendation_id,
      relevance_rating: feedback.relevance_rating,
      suitability_rating: feedback.suitability_rating,
      is_useful: feedback.suitability_rating >= 3,
      reason: String(feedback.reason || '').trim().slice(0, 1000) || null,
    }
    const { data: existing, error: existingError } = await supabase.from('career_feedback')
      .select('id')
      .eq('student_id', changes.student_id)
      .eq('career_recommendation_id', changes.career_recommendation_id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (existingError) throw new Error(existingError.message || 'Unable to check your previous rating.')
    const request = existing?.length
      ? supabase.from('career_feedback').update(changes).eq('id', existing[0].id)
      : supabase.from('career_feedback').insert(changes)
    const { data, error } = await request.select().single()
    return requireData(data, error, 'Unable to save your feedback.')
  },

  async setRecommendationInteraction(studentId, recommendationId, interactionStatus) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== studentId) {
      throw new Error('You can only update recommendations on your own profile.')
    }
    if (!recommendationId || !['accepted', 'dismissed', 'explored'].includes(interactionStatus)) {
      throw new Error('Choose a recommendation and a valid response.')
    }
    const { data, error } = await supabase.rpc('record_career_recommendation_interaction', {
      p_recommendation_id: recommendationId,
      p_interaction_status: interactionStatus,
    })
    return requireData(data, error, 'Unable to save your recommendation response.')
  },
}
