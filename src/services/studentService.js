import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { calculateCareerReadiness } from '../algorithms/careerReadiness.js'
import { buildStudentProfileChanges } from '../utils/careerInterests.js'
import { normalizeEducationRecord } from '../utils/educationValidation.js'
import { portfolioService } from './portfolioService'
import { learningService } from './learningService'
import {
  filterAssessmentResultSkillRows,
  filterRecommendationSkillNames,
  filterSelectableSkillRows,
} from '../utils/skillCatalog'

function filterPortfolioSkills(evidence) {
  return {
    ...evidence,
    portfolio: evidence.portfolio
      ? { ...evidence.portfolio, portfolio_skills: filterSelectableSkillRows(evidence.portfolio.portfolio_skills || []) }
      : null,
    projects: (evidence.projects || []).map((project) => ({
      ...project,
      project_skills: filterSelectableSkillRows(project.project_skills || []),
    })),
    certificates: (evidence.certificates || []).map((certificate) => ({
      ...certificate,
      certificate_skills: filterSelectableSkillRows(certificate.certificate_skills || []),
    })),
  }
}

export const studentService = {
  async getDashboard(studentId, cachedProfile = null, candidateTypeOverride = null) {
    let profileData = cachedProfile
    if (!profileData) {
      const profile = await supabase.from('profiles').select('*, student_profiles(*)').eq('id', studentId).single()
      profileData = requireData(profile.data, profile.error, 'Unable to load your profile.')
    }
    const studentProfile = Array.isArray(profileData.student_profiles) ? profileData.student_profiles[0] : profileData.student_profiles
    const candidateType = candidateTypeOverride || studentProfile?.candidate_type
    const employmentTypes = candidateType === 'graduate'
      ? ['full_time', 'part_time', 'contract', 'internship', 'graduate', 'temporary', 'volunteer']
      : ['internship']

    const now = new Date().toISOString()
    const learningResourcesPromise = learningService.getResources(studentId)
    const readinessDataPromise = learningResourcesPromise.then((resources) =>
      this.getCareerReadinessData(studentId, resources.map((resource) => resource.progress).filter(Boolean)),
    )
    const [portfolioEvidence, skills, recommendations, learningResources, jobs, applications, interviews, assessments, reminders, employment, education, readinessData, visibleSkills] = await Promise.all([
      portfolioService.getEvidence(studentId),
      supabase.from('user_skills').select('*, skills(*)').eq('user_id', studentId).order('created_at'),
      supabase.from('career_recommendations').select('*, careers(*)').eq('student_id', studentId).order('match_score', { ascending: false }).limit(3),
      learningResourcesPromise,
      supabase.from('jobs').select('*, employer_profiles(*), job_skills(*, skills!job_skills_skill_id_fkey(*))').eq('status', 'published').in('employment_type', employmentTypes).order('published_at', { ascending: false }).limit(4),
      supabase.from('applications').select('*, jobs(*, employer_profiles(*))').eq('student_id', studentId).order('updated_at', { ascending: false }),
      supabase.from('interviews').select('*, applications!inner(id, student_id, jobs(title))', { count: 'exact' }).eq('applications.student_id', studentId).in('status', ['scheduled', 'rescheduled']).gte('scheduled_at', now).order('scheduled_at').limit(4),
      supabase.from('assessment_results')
        .select('*, assessments(*, skills(id, name, category, status, approval_status, is_internal))')
        .eq('student_id', studentId).order('created_at', { ascending: false }).limit(4),
      supabase.from('reminders').select('*').eq('user_id', studentId).eq('completed', false).gte('reminder_date', now.slice(0, 10)).order('reminder_date').limit(4),
      supabase.from('employment').select('*, employer_profiles(*), employment_progress(*)').eq('student_id', studentId).order('start_date', { ascending: false }).limit(1),
      supabase.from('education').select('id, institution, programme, qualification, education_level, start_year, end_year, grade').eq('student_id', studentId),
      readinessDataPromise,
      supabase.from('skills')
        .select('name, aliases, status, approval_status, is_internal')
        .eq('status', 'active').eq('approval_status', 'approved').eq('is_internal', false),
    ])

    const responses = { skills, recommendations, jobs, applications, interviews, assessments, reminders, employment, education, visibleSkills }
    const failed = Object.values(responses).find((response) => response.error && response.error.code !== 'PGRST116')
    if (failed) throw new Error(failed.error.message)

    const responseData = Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.data]))
    responseData.resources = learningResources
    responseData.learningProgress = learningResources.map((resource) => resource.progress).filter(Boolean)
    responseData.skills = filterSelectableSkillRows(responseData.skills || [])
    responseData.recommendations = (responseData.recommendations || []).map((recommendation) =>
      filterRecommendationSkillNames(recommendation, responseData.visibleSkills || []),
    )
    delete responseData.visibleSkills
    responseData.jobs = (responseData.jobs || []).map((job) => ({
      ...job,
      job_skills: filterSelectableSkillRows(job.job_skills || []),
    }))
    responseData.assessments = filterAssessmentResultSkillRows(responseData.assessments || [])
    responseData.resources = responseData.resources || []
    const visiblePortfolioEvidence = filterPortfolioSkills(portfolioEvidence)

    return {
      profile: profileData,
      interviewCount: interviews.count || 0,
      careerProgress: readinessData.readiness ? [readinessData.readiness] : [],
      readiness: readinessData.readiness,
      readinessWarnings: readinessData.warnings || [],
      ...responseData,
      portfolio: visiblePortfolioEvidence.portfolio,
      projects: visiblePortfolioEvidence.projects,
      certificates: visiblePortfolioEvidence.certificates,
      resources: responseData.resources.slice(0, 4),
    }
  },

  async getProfile(studentId) {
    const { data, error } = await supabase.from('profiles').select('*, student_profiles(*)').eq('id', studentId).single()
    return requireData(data, error, 'Unable to load your profile.')
  },

  async getCareerReadinessData(studentId, availableLearningProgress = null) {
    const queries = [
      supabase.from('profiles').select('full_name, student_profiles(target_role, career_goal, interests, education_level, programme, institution, bio)').eq('id', studentId).single(),
      supabase.from('user_skills')
        .select('*, skills(id, name, category, status, approval_status, is_internal)')
        .eq('user_id', studentId).order('created_at'),
      supabase.from('education').select('id, institution, programme, qualification, education_level').eq('student_id', studentId).order('end_year', { ascending: false }),
      supabase.from('assessment_results')
        .select('id, assessment_id, score, percentage, level, passed, completed_at, created_at, assessments(skill_id, skills(id, name, category, status, approval_status, is_internal))')
        .eq('student_id', studentId).order('created_at', { ascending: false }),
      portfolioService.getEvidence(studentId),
      availableLearningProgress === null
        ? learningService.getResources(studentId).then((resources) => resources.map((resource) => resource.progress).filter(Boolean))
        : Promise.resolve(availableLearningProgress),
      supabase.from('employment').select('id, position, status, start_date, end_date').eq('student_id', studentId).order('start_date', { ascending: false }),
      supabase.from('careers').select('id, title, career_skills(required_level, skills(id, name, category, status, approval_status, is_internal))').eq('status', 'published').order('title'),
    ]
    const results = await Promise.allSettled(queries)
    const warnings = []
    const defaults = [null, [], [], [], { portfolio: null, projects: [], certificates: [] }, [], [], []]
    const values = results.map((result, index) => {
      if (result.status === 'rejected') {
        warnings.push(result.reason?.message || 'Some readiness information could not be loaded.')
        return defaults[index]
      }
      if (result.value.error) {
        warnings.push(result.value.error.message || 'Some readiness information could not be loaded.')
        return defaults[index]
      }
      return ([4, 5].includes(index) ? result.value : result.value.data) ?? defaults[index]
    })

    const profile = values[0]
    const studentProfile = Array.isArray(profile?.student_profiles)
      ? profile.student_profiles[0]
      : profile?.student_profiles
    const targetCareerName = String(studentProfile?.target_role || '').trim().toLowerCase()
    const skills = filterSelectableSkillRows(values[1] || [])
    const assessments = filterAssessmentResultSkillRows(values[3] || [])
    const portfolioEvidence = filterPortfolioSkills(values[4])
    const careers = (values[7] || []).map((career) => ({
      ...career,
      career_skills: filterSelectableSkillRows(career.career_skills || []),
    }))
    const targetCareer = targetCareerName
      ? careers.find((career) => career.title?.trim().toLowerCase() === targetCareerName) || null
      : null

    return {
      profile,
      skills,
      education: values[2],
      assessments,
      projects: portfolioEvidence.projects,
      certificates: portfolioEvidence.certificates,
      portfolio: portfolioEvidence.portfolio,
      learningProgress: values[5],
      employment: values[6],
      targetCareer,
      readiness: warnings.length ? null : calculateCareerReadiness({
        skills,
        assessments,
        projects: portfolioEvidence.projects,
        certificates: portfolioEvidence.certificates,
        portfolio: portfolioEvidence.portfolio,
        learningProgress: values[5],
        employment: values[6],
        targetCareer,
      }),
      careerProgress: null,
      warnings: [...new Set(warnings)],
    }
  },

  async getCareerProgressData(studentId) {
    const results = await Promise.allSettled([
      supabase.from('profiles').select('full_name, student_profiles(target_role, career_goal, interests)').eq('id', studentId).single(),
      supabase.from('user_skills')
        .select('id, level, skills(id, name, category, status, approval_status, is_internal)')
        .eq('user_id', studentId),
      supabase.from('education').select('id, institution, qualification').eq('student_id', studentId),
      supabase.from('assessment_results')
        .select('id, assessment_id, percentage, score, completed_at, created_at, assessments(skill_id, skills(id, name, category, status, approval_status, is_internal))')
        .eq('student_id', studentId),
      learningService.getResources(studentId).then((resources) => resources.map((resource) => resource.progress).filter(Boolean)),
      portfolioService.getEvidence(studentId),
      supabase.from('applications').select('id, status, applied_at, updated_at, jobs(title), interviews(id, status, scheduled_at)').eq('student_id', studentId).order('updated_at', { ascending: false }),
      supabase.from('employment').select('id, position, status, start_date, end_date').eq('student_id', studentId).order('start_date', { ascending: false }),
      supabase.from('careers').select('id, title, career_skills(required_level, skills(id, name, category, status, approval_status, is_internal))').eq('status', 'published').order('title'),
    ])
    const names = ['profile', 'skills', 'education', 'assessments', 'learningProgress', 'portfolioEvidence', 'applications', 'employment', 'careers']
    const defaults = [null, [], [], [], [], { portfolio: null, projects: [], certificates: [] }, [], [], []]
    const data = {}
    const warnings = []

    results.forEach((result, index) => {
      const name = names[index]
      if (result.status === 'rejected' || result.value.error) {
        const error = result.status === 'rejected' ? result.reason : result.value.error
        if (name === 'profile') throw new Error(error?.message || 'Unable to load your profile for career progress.')
        warnings.push(error?.message || `Unable to load ${name} for career progress.`)
        data[name] = defaults[index]
        return
      }
      const value = [4, 5].includes(index) ? result.value : result.value.data
      data[name] = value ?? defaults[index]
    })

    const portfolioEvidence = data.portfolioEvidence
    delete data.portfolioEvidence
    const visiblePortfolioEvidence = filterPortfolioSkills(portfolioEvidence)
    data.skills = filterSelectableSkillRows(data.skills || [])
    data.assessments = filterAssessmentResultSkillRows(data.assessments || [])
    data.careers = (data.careers || []).map((career) => ({
      ...career,
      career_skills: filterSelectableSkillRows(career.career_skills || []),
    }))
    data.projects = visiblePortfolioEvidence.projects
    data.certificates = visiblePortfolioEvidence.certificates
    data.portfolio = visiblePortfolioEvidence.portfolio
    data.interviews = data.applications.flatMap((application) => application.interviews || [])
    data.warnings = [...new Set(warnings)]
    const studentProfile = Array.isArray(data.profile?.student_profiles)
      ? data.profile.student_profiles[0]
      : data.profile?.student_profiles
    const targetCareerName = String(studentProfile?.target_role || '').trim().toLowerCase()
    data.targetCareer = targetCareerName
      ? data.careers.find((career) => career.title?.trim().toLowerCase() === targetCareerName) || null
      : null
    data.readiness = warnings.length ? null : calculateCareerReadiness({ ...data, targetCareer: data.targetCareer })
    data.careerProgress = data.readiness
    return data
  },

  async listEducation(studentId) {
    const { data, error } = await supabase.from('education').select('*').eq('student_id', studentId).order('end_year', { ascending: false })
    return requireData(data, error, 'Unable to load education records.')
  },

  async saveEducation(record) {
    const { data, error } = await supabase.from('education').upsert(normalizeEducationRecord(record)).select().single()
    return requireData(data, error, 'Unable to save education record.')
  },

  async updateEducation(recordId, studentId, changes) {
    const { data, error } = await supabase.from('education').update(normalizeEducationRecord(changes)).eq('id', recordId).eq('student_id', studentId).select().single()
    return requireData(data, error, 'Unable to update education record.')
  },

  async deleteEducation(recordId, studentId) {
    const { error } = await supabase.from('education').delete().eq('id', recordId).eq('student_id', studentId)
    if (error) throw new Error(error.message || 'Unable to delete education record.')
  },

  async saveStudentProfile(studentId, changes) {
    const { data, error } = await supabase.from('student_profiles').update(buildStudentProfileChanges(changes)).eq('id', studentId).select().single()
    return requireData(data, error, 'Unable to save your student profile.')
  },
}
