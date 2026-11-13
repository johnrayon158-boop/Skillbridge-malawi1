import { canonicalizeSkillName, normalizeSkillValue } from './skillNormalizationService.js'

export function compareSkills(sourceSkill = {}, targetSkill = {}) {
  const sourceName = String(sourceSkill?.name || sourceSkill?.title || '').trim()
  const targetName = String(targetSkill?.name || targetSkill?.title || '').trim()
  if (!sourceName || !targetName) {
    return { sourceSkill, targetSkill, relationshipType: 'no-match', similarityScore: 0, confidence: 0, explanation: 'No valid skill names were supplied.' }
  }

  const sourceCanonical = canonicalizeSkillName(sourceName)
  const targetCanonical = canonicalizeSkillName(targetName)
  const directIdMatch = sourceSkill?.id && targetSkill?.id && sourceSkill.id === targetSkill.id
  const sameCanonicalMatch = sourceCanonical && targetCanonical && sourceCanonical === targetCanonical
  const sourceParentMatch = sourceSkill?.parent_skill_id && sourceSkill.parent_skill_id === targetSkill?.id
  const targetParentMatch = targetSkill?.parent_skill_id && targetSkill.parent_skill_id === sourceSkill?.id

  if (directIdMatch || sameCanonicalMatch) {
    return {
      sourceSkill: sourceName,
      targetSkill: targetName,
      relationshipType: 'exact',
      similarityScore: 1,
      confidence: 1,
      explanation: `${sourceName} and ${targetName} resolve to the same canonical skill.`,
    }
  }

  if (sourceParentMatch || targetParentMatch) {
    return {
      sourceSkill: sourceName,
      targetSkill: targetName,
      relationshipType: sourceParentMatch ? 'parent' : 'child',
      similarityScore: 0.74,
      confidence: 0.8,
      explanation: `${sourceName} is related to ${targetName} through a hierarchical skill relationship.`,
    }
  }

  const sourceTokens = new Set(normalizeSkillValue(sourceName).split(' '))
  const targetTokens = new Set(normalizeSkillValue(targetName).split(' '))
  const overlap = [...sourceTokens].filter((token) => targetTokens.has(token)).length
  const coverage = overlap / Math.max(sourceTokens.size, targetTokens.size, 1)

  if (coverage > 0.5 || sourceCanonical.includes(targetCanonical) || targetCanonical.includes(sourceCanonical)) {
    return {
      sourceSkill: sourceName,
      targetSkill: targetName,
      relationshipType: 'related',
      similarityScore: Number((0.62 + coverage * 0.2).toFixed(2)),
      confidence: 0.7,
      explanation: `${sourceName} and ${targetName} share enough vocabulary to be treated as related skills, not as a duplicate.`,
    }
  }

  return {
    sourceSkill: sourceName,
    targetSkill: targetName,
    relationshipType: 'different',
    similarityScore: 0,
    confidence: 0.2,
    explanation: `${sourceName} and ${targetName} do not map to the same canonical skill or hierarchy.`,
  }
}
