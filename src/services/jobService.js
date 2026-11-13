import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { clearCacheByPrefix, getCachedValue, setCachedValue } from '../utils/performanceCache'
import { getEmploymentListingTypes, getVisibleEmploymentTypes } from '../utils/candidateType'
import { filterSelectableSkillRows, isSelectableSkill } from '../utils/skillCatalog'
import { deduplicateJobSkills, validateEmployerJob } from '../utils/employerJobValidation'
import { findPotentialJobDuplicates } from '../utils/duplicateDetection'

export const jobService = {
  async getJobs(filters = {}) {
    const { location = '', employmentType = '', search = '', limit = 12, offset = 0, candidateType = 'student', listingScope = 'employment' } = filters
    const cacheKey = `jobs:${JSON.stringify({ location, employmentType, search, limit, offset, candidateType, listingScope })}`
    const cached = getCachedValue(cacheKey)
    if (cached) return cached

    const visibleTypes = listingScope === 'all'
      ? getVisibleEmploymentTypes(candidateType)
      : getEmploymentListingTypes(candidateType)
    const employmentTypes = employmentType
      ? visibleTypes.filter((type) => type === employmentType)
      : visibleTypes
    if (!employmentTypes.length) return []

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let query = supabase.from('jobs').select('id, title, description, status, location, employment_type, opportunity_type, work_mode, salary_min, salary_max, currency, experience_required, education_required, application_deadline, published_at, employer_id, employer_profiles(id, company_name, logo_url)').eq('status', 'published').or(`application_deadline.is.null,application_deadline.gte.${today}`).order('published_at', { ascending: false }).range(offset, offset + limit - 1)
    if (location) query = query.ilike('location', `%${location}%`)
    query = query.in('employment_type', employmentTypes)
    if (listingScope !== 'all') query = query.is('opportunity_type', null)
    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

    const { data, error } = await query
    const result = requireData(data, error, 'Unable to load jobs.')
    setCachedValue(cacheKey, result)
    return result
  },

  async getSavedJobs(studentId) {
    const { data, error } = await supabase.from('saved_jobs').select('*, jobs(*, employer_profiles(*))').eq('student_id', studentId).order('created_at', { ascending: false })
    return requireData(data, error, 'Unable to load saved jobs.')
  },

  async saveJob(studentId, jobId) {
    const { data, error } = await supabase.from('saved_jobs').insert({ student_id: studentId, job_id: jobId }).select().single()
    return requireData(data, error, 'Unable to save this job.')
  },

  async getJob(jobId, candidateType = 'student') {
    const { data, error } = await supabase.from('jobs').select('*, employer_profiles(*), job_skills(*, skills!job_skills_skill_id_fkey(*))').eq('id', jobId).eq('status', 'published').in('employment_type', getVisibleEmploymentTypes(candidateType)).maybeSingle()
    if (!error && !data) throw new Error('This job is no longer published or is not available to your candidate type.')
    const job = requireData(data, error, 'Unable to load this job.')
    return {
      ...job,
      job_skills: filterSelectableSkillRows(job.job_skills || []),
    }
  },

  async apply(application) {
    const { data, error } = await supabase.from('applications').insert(application).select().single()
    return requireData(data, error, 'Unable to submit your application.')
  },

  async applyToJob(studentId, jobId, applicationData = {}) {
    if (!studentId || !jobId) throw new Error('A valid student and job are required to apply.')

    const { data: existingApplication, error: existingError } = await supabase
      .from('applications')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('job_id', jobId)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message || 'Unable to check your existing application.')
    if (existingApplication) throw new Error(`You already have an application for this job (${existingApplication.status}).`)

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, employer_id, title, status, employment_type, opportunity_type, application_deadline')
      .eq('id', jobId)
      .single()

    if (jobError) throw new Error(jobError.message || 'Unable to load this job.')
    if (job.status !== 'published' || (job.application_deadline && job.application_deadline < new Date().toISOString().slice(0, 10))) {
      throw new Error('This job is closed or past its application deadline.')
    }
    if (job.opportunity_type || ['internship', 'graduate', 'temporary', 'part_time', 'volunteer'].includes(job.employment_type)) {
      const { data, error } = await supabase.rpc('submit_internship_application', {
        p_job_id: jobId,
        p_cover_letter: applicationData.cover_letter || null,
        p_documents: [],
      })
      if (error) throw new Error(error.message || 'Unable to submit your placement application.')
      return data
    }

    const payload = {
      student_id: studentId,
      job_id: jobId,
      status: 'applied',
      cover_letter: applicationData.cover_letter || null,
      cv_url: applicationData.cv_url || null,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('applications')
      .insert(payload)
      .select('*, jobs(*, employer_profiles(*)), application_events(*)')
      .single()

    if (error) throw new Error(error.message || 'Unable to submit your application.')

    const applicationEventPayload = {
      application_id: data.id,
      event_type: 'applied',
      title: 'Application submitted',
      description: `Your application for ${job.title} has been submitted and is now waiting for employer review.`,
      event_date: new Date().toISOString(),
      created_by: studentId,
    }

    const { error: eventError } = await supabase.from('application_events').insert(applicationEventPayload)
    if (eventError) throw new Error(eventError.message || 'Unable to record the application event.')

    const reminderDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: reminderError } = await supabase.from('reminders').insert({
      user_id: job.employer_id,
      title: `Review application for ${job.title}`,
      description: 'A new application is awaiting your action. Please review the candidate and update the application status.',
      reminder_type: 'application_follow_up',
      reminder_date: reminderDate,
      completed: false,
    })

    if (reminderError) throw new Error(reminderError.message || 'Unable to create the follow-up reminder.')

    return data
  },

  async getEmployerJobs(employerId) {
    const { data, error } = await supabase.from('jobs').select('*, applications(id, status), job_skills(*, skills!job_skills_skill_id_fkey(*))').eq('employer_id', employerId).order('created_at', { ascending: false })
    return requireData(data, error, 'Unable to load your jobs.')
  },

  async findPotentialDuplicates(job) {
    const { data, error } = await supabase.from('jobs')
      .select('id, employer_id, title, description, location, employment_type, application_deadline, status, published_at, created_at, employer_profiles(company_name, city)')
      .eq('employer_id', job.employer_id)
      .neq('status', 'archived')
    const existingJobs = requireData(data, error, 'Unable to check for similar job listings.')
    return findPotentialJobDuplicates(job, existingJobs)
  },

  async saveEmployerJob(job) {
    const validationError = validateEmployerJob(job, { publishing: job?.status === 'published' })
    if (validationError) throw new Error(validationError)
    const jobRecord = { ...job }
    delete jobRecord.job_skills
    const { data, error } = await supabase.from('jobs').upsert(jobRecord).select().single()
    const result = requireData(data, error, 'Unable to save the job.')
    clearCacheByPrefix('jobs:')
    return result
  },

  async publishJob(jobId, employerId) {
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, employer_id, title, description, employment_type, application_deadline, job_skills(skill_id, is_required, skills!job_skills_skill_id_fkey(id, status, approval_status, is_internal))')
      .eq('id', jobId)
      .eq('employer_id', employerId)
      .maybeSingle()
    if (jobError) throw new Error(jobError.message || 'Unable to verify this job before publishing.')
    if (!job) throw new Error('Job not found or not owned by this employer.')
    const requirements = (job.job_skills || []).map((requirement) => ({
      ...requirement,
      is_selectable: isSelectableSkill(requirement.skills),
    }))
    const validationError = validateEmployerJob({ ...job, job_skills: requirements }, { publishing: true })
    if (validationError) throw new Error(validationError)
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (job.application_deadline && job.application_deadline < today) {
      throw new Error('Update the application deadline before publishing this opportunity.')
    }

    const { data, error } = await supabase.from('jobs').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', jobId).eq('employer_id', employerId).select().single()
    const result = requireData(data, error, 'Unable to publish the job.')
    clearCacheByPrefix('jobs:')
    return result
  },

  async closeJob(jobId, employerId) {
    const { data, error } = await supabase.from('jobs').update({ status: 'closed' }).eq('id', jobId).eq('employer_id', employerId).select().single()
    const result = requireData(data, error, 'Unable to close the job.')
    clearCacheByPrefix('jobs:')
    return result
  },

  async addJobSkill(requirement) {
    const { data, error } = await supabase.from('job_skills').upsert(requirement, { onConflict: 'job_id,skill_id' }).select('*, skills!job_skills_skill_id_fkey(*)').single()
    return requireData(data, error, 'Unable to save the skill requirement.')
  },

  async removeJobSkill(id) {
    const { error } = await supabase.from('job_skills').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  async syncJobSkills(jobId, requirements) {
    if (!Array.isArray(requirements)) throw new Error('Job skills must be provided as a list.')
    if (requirements.some((item) => typeof item?.skill_id !== 'string' || !item.skill_id.trim())) {
      throw new Error('Each selected skill must be a valid catalog entry.')
    }
    const uniqueRequirements = deduplicateJobSkills(requirements)
    const selectedSkillIds = new Set(uniqueRequirements.map((item) => item.skill_id))
    const { data, error } = await supabase
      .from('job_skills')
      .select('id, skill_id')
      .eq('job_id', jobId)
    const existingRequirements = requireData(data, error, 'Unable to load existing job skill requirements.')
    const additions = uniqueRequirements.map((item) => ({
      job_id: jobId,
      skill_id: item.skill_id,
      required_level: item.required_level || 'intermediate',
      importance: item.importance || 50,
      is_required: item.is_required !== false,
    }))

    for (const requirement of additions) {
      await this.addJobSkill(requirement)
    }

    const removed = existingRequirements.filter((item) => !selectedSkillIds.has(item.skill_id))
    for (const requirement of removed) {
      await this.removeJobSkill(requirement.id)
    }
  },
}
