import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { isSelectableSkill } from '../utils/skillCatalog'

export const learningService = {
  async getResources(studentId) {
    const [resources, progress] = await Promise.all([
      supabase.from('learning_resources')
        .select('id, title, description, resource_type, url, provider, skill_id, category, difficulty, duration_minutes, free, status, created_at, skills(id, name, category, status, approval_status, is_internal), learning_resource_skills(id, skill_id, skills(id, name, category, status, approval_status, is_internal)), learning_resource_careers(id, career_id, careers(id, title, status))')
        .eq('status', 'published')
        .order('created_at', { ascending: false }),
      supabase.from('learning_progress').select('*').eq('student_id', studentId),
    ])
    if (resources.error) throw new Error(resources.error.message)
    if (progress.error) throw new Error(progress.error.message)
    const progressByResource = new Map()
    for (const item of progress.data || []) {
      if (!item.resource_id) continue
      const current = progressByResource.get(item.resource_id)
      const timestamp = Date.parse(item.updated_at || item.completed_at || item.created_at || '')
      const currentTimestamp = Date.parse(current?.updated_at || current?.completed_at || current?.created_at || '')
      if (!current || (Number.isFinite(timestamp) && (!Number.isFinite(currentTimestamp) || timestamp >= currentTimestamp))) {
        progressByResource.set(item.resource_id, item)
      }
    }
    return (resources.data || []).map((resource) => {
      const relatedSkills = (resource.learning_resource_skills || [])
        .filter((item) => isSelectableSkill(item.skills))
        .map((item) => item.skills)
      const primarySkill = isSelectableSkill(resource.skills)
        ? resource.skills
        : relatedSkills.find((skill) => skill.id === resource.skill_id) || null
      return {
        ...resource,
        skills: primarySkill,
        relatedSkills,
        relatedCareers: (resource.learning_resource_careers || [])
          .filter((item) => item.careers?.status === 'published')
          .map((item) => item.careers),
        progress: progressByResource.get(resource.id) || null,
      }
    })
  },

  async getPath(studentId) {
    const { data, error } = await supabase.from('learning_paths').select('*, careers(*), learning_path_resources(*, learning_resources(*, skills(*), learning_resource_skills(id, skill_id, skills(id, name, category, status, approval_status, is_internal))))').eq('student_id', studentId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    const path = requireData(data, error, 'Unable to load your learning path.')
    if (!path) return path
    return {
      ...path,
      learning_path_resources: (path.learning_path_resources || []).filter(({ learning_resources: resource }) =>
        resource?.status === 'published',
      ),
    }
  },

  async updateProgress(progress) {
    const { data, error } = await supabase
      .from('learning_progress')
      .upsert(progress, { onConflict: 'student_id,resource_id' })
      .select()
      .single()
    return requireData(data, error, 'Unable to save learning progress.')
  },
}
