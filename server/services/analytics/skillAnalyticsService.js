import { describeInsufficientData } from './analyticsService.js'

export function buildSkillGapAnalytics({ currentSkills = [], requiredSkills = [], progress = [] } = {}) {
  const required = requiredSkills.map((skill) => String(skill.skill_name || skill.name || skill).trim()).filter(Boolean)
  const current = currentSkills.map((skill) => String(skill.skill_name || skill.name || skill).trim()).filter(Boolean)
  const missed = required.filter((skill) => !current.includes(skill))
  const closed = (progress || []).filter((item) => String(item.status || '').toLowerCase() === 'completed').map((item) => item.skill_name || item.name || 'Skill')

  const activeGaps = missed.map((skill) => ({
    skill,
    status: 'open',
    priority: required.includes(skill) ? 'high' : 'medium',
  }))

  const summary = {
    total: required.length,
    active: activeGaps.length,
    closed: closed.length,
    message: missed.length ? `Key skill gaps remain in ${missed.slice(0, 3).join(', ')}.` : 'No current skill gaps were detected from the available data.',
  }

  return {
    currentSkills: current,
    requiredSkills: required,
    activeGaps,
    closedGaps: closed,
    gapStatus: [...new Set([...closed, ...missed])],
    summary,
    notes: required.length ? ['Gap analytics are based on the current skill taxonomy and recorded portfolio evidence.'] : [describeInsufficientData('skill gap analytics').message],
  }
}
