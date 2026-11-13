import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { filterAssessmentsBySkillVisibility } from '../utils/skillCatalog'
import { matchingService } from './matchingService'

export const assessmentService = {
  async getLibrary(studentId) {
    const { data: applications, error: applicationsError } = await supabase
      .from('applications')
      .select('job_id')
      .eq('student_id', studentId)
    const candidateApplications = requireData(applications, applicationsError, 'Unable to load your job assessment access.')
    const jobIds = [...new Set(candidateApplications.map((application) => application.job_id).filter(Boolean))]
    const requests = [
      supabase.from('assessments')
        .select('*, skills(*), careers(*)')
        .eq('status', 'published')
        .is('job_id', null)
        .order('created_at', { ascending: false }),
    ]
    if (jobIds.length) {
      requests.push(supabase.from('job_assessments')
        .select('required, assessments!inner(*, skills(*), careers(*))')
        .in('job_id', jobIds)
        .eq('assessments.status', 'published'))
    }
    const [libraryResult, assignedResult] = await Promise.all(requests)
    const library = requireData(libraryResult.data, libraryResult.error, 'Unable to load assessments.')
    const assigned = assignedResult
      ? requireData(assignedResult.data, assignedResult.error, 'Unable to load assessments assigned to your applications.')
        .map((assignment) => ({ ...assignment.assessments, assignment_required: assignment.required }))
      : []
    return filterAssessmentsBySkillVisibility([...library, ...assigned]).sort((left, right) =>
      (right.created_at || '').localeCompare(left.created_at || ''),
    )
  },

  async getAssessment(id) {
    const { data, error } = await supabase.from('assessments').select('*, skills(*), assessment_questions(id, assessment_id, question, question_type, options, points, difficulty, explanation, created_at)').eq('id', id).single()
    const assessment = requireData(data, error, 'Unable to load this assessment.')
    if (assessment.skill_id && !filterAssessmentsBySkillVisibility([assessment]).length) {
      throw new Error('This assessment is not available for a skill that is still under review.')
    }
    return assessment
  },

  async getResults(studentId) {
    const { data, error } = await supabase.from('assessment_results').select('*, assessments(*, skills(*))').eq('student_id', studentId).order('created_at', { ascending: false })
    return requireData(data, error, 'Unable to load assessment results.')
  },

  async getResult(resultId, studentId) {
    const { data, error } = await supabase
      .from('assessment_results')
      .select('*, assessments(*, skills(*))')
      .eq('id', resultId)
      .eq('student_id', studentId)
      .single()
    return requireData(data, error, 'Unable to load this assessment result.')
  },

  async startAssessmentAttempt(assessmentId, clientRequestId) {
    if (!assessmentId || !clientRequestId) throw new Error('Assessment start information is missing.')
    const { data, error } = await supabase.rpc('start_assessment_attempt', {
      p_assessment_id: assessmentId,
      p_client_request_id: clientRequestId,
    })
    return requireData(data, error, 'Unable to record this assessment start.')
  },

  async submitAssessment(attemptId, answers, studentId) {
    if (!attemptId || !studentId) throw new Error('Assessment attempt information is missing.')
    const { data, error } = await supabase.rpc('submit_assessment_attempt', {
      p_attempt_id: attemptId,
      p_answers: answers,
    })
    const savedResult = requireData(data, error, 'Unable to save assessment results.')
    void matchingService.refreshMatches(studentId).catch((refreshError) => {
      console.warn(`Assessment saved; employment match recalculation was deferred: ${refreshError.message}`)
    })
    return savedResult
  },
}
