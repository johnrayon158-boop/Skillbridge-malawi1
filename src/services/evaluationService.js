import { supabase } from './supabase'
import { requireData } from './serviceUtils'

const QUESTION_FIELDS = [
  'ease_of_use',
  'navigation_clarity',
  'task_completion',
  'trust_in_recommendations',
  'overall_satisfaction',
]

export const EVALUATION_WORKFLOWS = [
  { value: 'general', label: 'General platform experience' },
  { value: 'career_recommendations', label: 'Career recommendations' },
  { value: 'job_matching', label: 'Jobs and matching' },
  { value: 'assessments', label: 'Assessments' },
  { value: 'learning', label: 'Learning' },
]

export const evaluationService = {
  async getMyEvaluation(userId, workflow = 'general') {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== userId) {
      throw new Error('You can only view your own evaluation response.')
    }
    const { data, error } = await supabase.from('platform_evaluations')
      .select('user_id, survey_version, workflow, ease_of_use, navigation_clarity, task_completion, trust_in_recommendations, overall_satisfaction, feedback, submitted_at')
      .eq('user_id', userId)
      .eq('survey_version', 'v1')
      .eq('workflow', workflow)
      .maybeSingle()
    if (error) throw new Error(error.message || 'Unable to load your evaluation response.')
    return data
  },

  async saveEvaluation(userId, answers, feedback = '', workflow = 'general') {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user || authData.user.id !== userId) {
      throw new Error('You can only submit an evaluation for your own account.')
    }
    if (!EVALUATION_WORKFLOWS.some((item) => item.value === workflow)) {
      throw new Error('Choose a valid page or workflow to evaluate.')
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new Error('Complete the evaluation questionnaire.')
    }
    for (const field of QUESTION_FIELDS) {
      if (!Number.isInteger(answers[field]) || answers[field] < 1 || answers[field] > 5) {
        throw new Error('Answer each questionnaire item with a rating from 1 to 5.')
      }
    }
    if (typeof feedback !== 'string' || feedback.length > 1000) {
      throw new Error('Feedback must be 1000 characters or fewer.')
    }
    const { data, error } = await supabase.rpc('submit_platform_evaluation', {
      p_answers: Object.fromEntries(QUESTION_FIELDS.map((field) => [field, answers[field]])),
      p_feedback: feedback.trim(),
      p_workflow: workflow,
    })
    return requireData(data, error, 'Unable to save your evaluation.')
  },
}
