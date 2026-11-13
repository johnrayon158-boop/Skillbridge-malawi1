const getSkillName = (value) => {
  if (typeof value === 'string') return value.trim()
  return String(value?.skills?.name || value?.name || value?.skill_name || value?.skill || value?.title || '').trim()
}

const normalize = (value) => String(value || '').trim().toLowerCase()

export function recommendLearning(skillsGap = [], learningResources = []) {
  const gaps = Array.isArray(skillsGap) ? skillsGap : []
  const resources = Array.isArray(learningResources) ? learningResources : []

  return gaps.map((gap) => {
    const name = getSkillName(gap) || 'Continue learning'
    const severity = typeof gap === 'string'
      ? 'medium'
      : String(gap?.severity || gap?.priority || (gap?.gap === 'missing' ? 'high' : 'medium')).toLowerCase()
    const priority = ['high', 'medium', 'low'].includes(severity) ? severity : 'medium'
    const normalizedName = normalize(name)
    const matched = resources.find((resource) => {
      const resourceSkill = normalize(getSkillName(resource))
      if (!resourceSkill || !normalizedName) return false
      const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      return new RegExp(`(^|\\s)${escapedName}(?=\\s|$)`).test(resourceSkill)
    })

    return {
      title: name,
      skill: name,
      priority,
      currentLevel: gap?.currentLevel || gap?.current_level || '',
      requiredLevel: gap?.requiredLevel || gap?.required_level || '',
      gap: Number(gap?.gapSize ?? gap?.gap) || 0,
      reason: priority === 'high'
        ? `Build confidence in ${name} with a focused, practical learning plan.`
        : `Keep progressing in ${name} through guided practice and review.`,
      resourceId: matched?.id || null,
      resourceTitle: matched?.title || '',
      resourceUrl: matched?.url || '',
      resourceType: matched?.resource_type || '',
    }
  })
}
