import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { portfolioService } from './portfolioService'
import {
  filterAssessmentResultSkillRows,
  filterSelectableSkillRows,
} from '../utils/skillCatalog'

export const INTERNSHIP_TYPES = [
  ['industrial_attachment', 'Industrial attachment'],
  ['internship', 'Internship'],
  ['graduate_internship', 'Graduate internship'],
  ['work_experience', 'Work experience'],
  ['apprenticeship', 'Apprenticeship'],
  ['traineeship', 'Traineeship'],
  ['other', 'Other practical placement'],
]

const OPEN_EMPLOYMENT_TYPES = ['internship', 'graduate', 'temporary', 'part_time', 'volunteer']
const PUBLIC_SEARCH_API = import.meta.env.VITE_AI_API_URL || 'http://localhost:4000'

export const internshipService = {
  async searchPublicOpportunities() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.')
    }

    const response = await fetch(`${PUBLIC_SEARCH_API}/api/placements/public-search`, {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      signal: AbortSignal.timeout(20000),
    })
    const result = await response.json().catch(() => ({ ok: false, error: 'Unable to read public placement search results.' }))
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Unable to search public placements right now.')
    }
    return result.data
  },

  async getStudentOpportunities(studentId, profile, { offset = 0, limit = 100, opportunityId } = {}) {
    let opportunityQuery = supabase.from('jobs')
      .select('*, employer_profiles(id, company_name, industry, description, website, logo_url), job_skills(*, skills!job_skills_skill_id_fkey(*))')
      .eq('status', 'published')
      .or(`opportunity_type.not.is.null,employment_type.in.(${OPEN_EMPLOYMENT_TYPES.join(',')})`)
      .order('published_at', { ascending: false })
    if (opportunityId) opportunityQuery = opportunityQuery.eq('id', opportunityId)

    const [
      jobsResult, skillsResult, educationResult, portfolioEvidence,
      assessmentsResult, savedResult, applicationsResult,
    ] = await Promise.all([
      opportunityQuery.range(offset, offset + limit - 1),
      supabase.from('user_skills').select('*, skills(*)').eq('user_id', studentId),
      supabase.from('education').select('*').eq('student_id', studentId).order('end_year', { ascending: false }),
      portfolioService.getEvidence(studentId),
      supabase.from('assessment_results')
        .select('id, assessment_id, score, percentage, completed_at, created_at, assessments(title, assessment_type, job_id, skill_id, skills(id, name, category, status, approval_status, is_internal))')
        .eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
      supabase.from('saved_jobs').select('job_id').eq('student_id', studentId),
      supabase.from('applications').select('*, jobs(id, title, opportunity_type, employment_type, employer_profiles(company_name)), application_events(*)').eq('student_id', studentId).order('updated_at', { ascending: false }),
    ])

    const jobs = requireData(jobsResult.data, jobsResult.error, 'Unable to load published placements.')
      .map((job) => ({ ...job, job_skills: filterSelectableSkillRows(job.job_skills || []) }))
    const userSkills = filterSelectableSkillRows(requireData(skillsResult.data, skillsResult.error, 'Unable to load your skills.'))
    const education = requireData(educationResult.data, educationResult.error, 'Unable to load your education.')
    const assessmentResults = filterAssessmentResultSkillRows(requireData(assessmentsResult.data, assessmentsResult.error, 'Unable to load your assessment evidence.'))
    const projects = (portfolioEvidence.projects || []).map((project) => ({
      ...project,
      project_skills: filterSelectableSkillRows(project.project_skills || []),
    }))
    const certificates = (portfolioEvidence.certificates || []).map((certificate) => ({
      ...certificate,
      certificate_skills: filterSelectableSkillRows(certificate.certificate_skills || []),
    }))
    const saved = requireData(savedResult.data, savedResult.error, 'Unable to load saved placements.')
    const applications = requireData(applicationsResult.data, applicationsResult.error, 'Unable to load your applications.')

    const currentProfile = Array.isArray(profile?.student_profiles)
      ? profile.student_profiles[0]
      : profile?.student_profiles || {}

    return {
      opportunities: (jobs || []).filter((job) => (
        job.opportunity_type || OPEN_EMPLOYMENT_TYPES.includes(job.employment_type)
      )).filter((job) => (
        job.application_deadline == null || job.application_deadline >= new Date().toISOString().slice(0, 10)
      )).filter((job) => !job.placement_end_date || job.placement_end_date >= new Date().toISOString().slice(0, 10)),
      hasMore: !opportunityId && (jobs || []).length === limit,
      nextOffset: offset + (jobs || []).length,
      student: {
        ...currentProfile,
        programme: currentProfile.programme || education?.[0]?.programme,
        education_level: currentProfile.education_level || education?.[0]?.education_level,
        user_skills: userSkills || [],
        projects: projects || [],
        assessment_results: assessmentResults || [],
        certificates: certificates || [],
      },
      savedJobIds: new Set((saved || []).map((item) => item.job_id)),
      applications: applications || [],
    }
  },

  async saveOpportunity(studentId, jobId) {
    const { data, error } = await supabase.from('saved_jobs')
      .upsert({ student_id: studentId, job_id: jobId }, { onConflict: 'student_id,job_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()
    if (error) throw new Error(error.message || 'Unable to save this placement.')
    return data
  },

  async removeSavedOpportunity(studentId, jobId) {
    const { error } = await supabase.from('saved_jobs').delete().eq('student_id', studentId).eq('job_id', jobId)
    if (error) throw new Error(error.message || 'Unable to remove this saved placement.')
  },

  async submitApplication(jobId, coverLetter, documents) {
    const { data, error } = await supabase.rpc('submit_internship_application', {
      p_job_id: jobId,
      p_cover_letter: coverLetter || null,
      p_documents: documents,
    })
    if (error) throw new Error(error.message || 'Unable to submit your application.')
    return data
  },
}
