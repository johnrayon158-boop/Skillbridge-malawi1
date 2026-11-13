import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { portfolioService } from './portfolioService'
import { getCachedValue, setCachedValue } from '../utils/performanceCache'
import { addSkillAliases, detectSkillsInSources } from '../utils/skillDetection'
import { filterSelectableSkillRows } from '../utils/skillCatalog'

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_URL || 'http://localhost:4000'

async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unable to complete the request.' }))
    throw new Error(error.error || 'Unable to complete the request.')
  }

  return response.json()
}

export const skillService = {
  async listSkills(filters = {}) {
    const cacheKey = `skills:${JSON.stringify(filters)}`
    const cached = getCachedValue(cacheKey)
    if (cached) return cached

    let query = supabase.from('skills')
      .select('id, name, category, subcategory, description, aliases, status, approval_status, is_internal')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .eq('is_internal', false)
      .order('name')
    if (filters.category) query = query.eq('category', filters.category)
    const { data, error } = await query
    const result = requireData(data, error, 'Unable to load skills.')
    setCachedValue(cacheKey, result)
    return result
  },

  async listSkillsWithAliases() {
    const [skillsResult, aliasesResult] = await Promise.allSettled([
      this.listSkills(),
      supabase.from('skill_aliases').select('skill_id, alias'),
    ])
    if (skillsResult.status === 'rejected') throw skillsResult.reason
    const skills = skillsResult.value
    if (aliasesResult.status === 'rejected' || aliasesResult.value.error) {
      return {
        skills,
        warning: 'Some alternate skill names could not be loaded. Detection will use catalog skill names and built-in aliases.',
      }
    }
    return { skills: addSkillAliases(skills, aliasesResult.value.data || []), warning: '' }
  },

  async getJobDemandSkills() {
    const { data, error } = await supabase
      .from('job_skills')
      .select('skill_id, skills!job_skills_skill_id_fkey(id, name, category, status, approval_status, is_internal), jobs!inner(status)')
      .eq('jobs.status', 'published')
      .eq('skills.status', 'active')
      .eq('skills.approval_status', 'approved')
      .eq('skills.is_internal', false)
    const requirements = requireData(data, error, 'Unable to load skills requested by published jobs.')
    const demandBySkill = new Map()

    for (const requirement of requirements) {
      if (!requirement.skills) continue
      const current = demandBySkill.get(requirement.skill_id)
      if (current) current.job_count += 1
      else demandBySkill.set(requirement.skill_id, { ...requirement.skills, job_count: 1 })
    }

    return [...demandBySkill.values()].sort((left, right) =>
      right.job_count - left.job_count || left.name.localeCompare(right.name),
    )
  },

  async getSkillById(skillId) {
    const { data, error } = await supabase.from('skills')
      .select('*')
      .eq('id', skillId)
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .eq('is_internal', false)
      .maybeSingle()
    return requireData(data, error, 'Unable to load the skill.')
  },

  async searchSkills(searchTerm = '') {
    const { data, error } = await supabase.from('skills')
      .select('*')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .eq('is_internal', false)
      .or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
      .order('name')
    return requireData(data, error, 'Unable to search skills.')
  },

  async getSkillAliases(skillId) {
    const { data, error } = await supabase.from('skill_aliases').select('*').eq('skill_id', skillId).order('alias')
    return requireData(data, error, 'Unable to load skill aliases.')
  },

  async getSkillRelated(skillId) {
    const { data, error } = await supabase.from('skill_relationships').select('*').or(`source_skill_id.eq.${skillId},target_skill_id.eq.${skillId}`).order('strength', { ascending: false })
    return requireData(data, error, 'Unable to load related skills.')
  },

  async normalizeSkillName(skillName, skills = [], aliases = []) {
    const response = await apiRequest('/api/skills/normalize', {
      method: 'POST',
      body: JSON.stringify({ skillName, skills, aliases }),
    })
    return response.data || response
  },

  async checkDuplicateSkill(skillName, skills = [], aliases = []) {
    const response = await apiRequest('/api/skills/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ skillName, skills, aliases }),
    })
    return response.data || response
  },

  async compareSkills(sourceSkill, targetSkill) {
    const response = await apiRequest('/api/skills/compare', {
      method: 'POST',
      body: JSON.stringify({ sourceSkill, targetSkill }),
    })
    return response.data || response
  },

  async matchStudentSkills(studentSkills = [], jobSkills = [], aliases = [], relationships = []) {
    const response = await apiRequest('/api/matching/skills', {
      method: 'POST',
      body: JSON.stringify({ studentSkills, jobSkills, aliases, relationships }),
    })
    return response.data || response
  },

  async getSkillProfile(userId) {
    const { data, error } = await supabase.from('user_skills').select('*, skills(*)').eq('user_id', userId).order('created_at')
    return filterSelectableSkillRows(requireData(data, error, 'Unable to load the skill profile.'))
  },

  async detectProfileSkills(userId) {
    const [profileResult, educationResult, portfolioEvidence, catalogResult] = await Promise.all([
      supabase.from('profiles').select('full_name, student_profiles(bio, target_role, career_goal, interests, programme, institution, education_level)').eq('id', userId).single(),
      supabase.from('education').select('institution, programme, qualification, education_level, field_of_study').eq('student_id', userId),
      portfolioService.getEvidence(userId),
      this.listSkillsWithAliases(),
    ])
    const profile = requireData(profileResult.data, profileResult.error, 'Unable to scan your profile for skills.')
    const education = requireData(educationResult.data, educationResult.error, 'Unable to scan your education history for skills.')
    const { portfolio, projects, certificates } = portfolioEvidence
    const studentProfile = Array.isArray(profile.student_profiles)
      ? profile.student_profiles[0]
      : profile.student_profiles
    const sources = []
    const addSource = (label, values) => {
      const text = values.filter((value) => typeof value === 'string' && value.trim()).join(' ')
      if (text) sources.push({ label, text })
    }

    addSource('Profile bio', [studentProfile?.bio])
    addSource('Target occupation', [studentProfile?.target_role])
    addSource('Career goal', [studentProfile?.career_goal])
    addSource('Career interests', studentProfile?.interests || [])
    addSource('Education profile', [studentProfile?.programme, studentProfile?.institution, studentProfile?.education_level])
    for (const record of education) {
      addSource(`Education: ${record.qualification || record.programme || record.field_of_study || record.institution}`, [
        record.programme,
        record.qualification,
        record.field_of_study,
      ])
    }
    addSource('Portfolio', [portfolio?.title, portfolio?.description])
    for (const project of projects) {
      addSource(`Project: ${project.title}`, [
        project.title,
        project.description,
        project.project_type,
        ...(project.project_skills || []).map((entry) => entry.skills?.name),
      ])
    }
    for (const certificate of certificates) {
      addSource(`Certificate: ${certificate.title}`, [certificate.title, certificate.issuer])
    }

    return {
      skills: detectSkillsInSources(sources, catalogResult.skills),
      warning: catalogResult.warning,
    }
  },

  async getSkillGaps(studentId, careerId) {
    const { data, error } = await supabase.from('career_recommendations').select('missing_skills, developing_skills, strong_skills').eq('student_id', studentId).eq('career_id', careerId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return requireData(data, error, 'Unable to load skill gaps.')
  },

  async upsertUserSkill(skill) {
    const { data, error } = await supabase.from('user_skills').upsert(skill, { onConflict: 'user_id,skill_id' }).select().single()
    return requireData(data, error, 'Unable to save the skill.')
  },

  async updateUserSkillLevel(userSkillId, userId, level) {
    const { data, error } = await supabase
      .from('user_skills')
      .update({ level })
      .eq('id', userSkillId)
      .eq('user_id', userId)
      .select()
      .single()
    return requireData(data, error, 'Unable to update the skill level.')
  },

  async deleteUserSkill(userSkillId) {
    const { error } = await supabase.from('user_skills').delete().eq('id', userSkillId)
    if (error) throw new Error(error.message || 'Unable to remove the skill.')
  },
}
