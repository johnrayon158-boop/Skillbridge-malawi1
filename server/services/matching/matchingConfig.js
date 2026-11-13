export const MATCHING_CONFIG = {
  EXACT_MATCH_WEIGHT: 0.42,
  PROFICIENCY_WEIGHT: 0.24,
  EVIDENCE_WEIGHT: 0.15,
  RELATED_SKILL_WEIGHT: 0.08,
  PARENT_SKILL_WEIGHT: 0.06,
  CHILD_SKILL_WEIGHT: 0.06,
  MANDATORY_SKILL_PENALTY: 18,
  OPTIONAL_SKILL_PENALTY: 6,
  MAX_MATCH_SCORE: 100,
  MIN_MATCH_SCORE: 0,
  ALIAS_CONFIDENCE: 0.75,
}

export const PROFICIENCY_LEVELS = [
  { label: 'Beginner', value: 1 },
  { label: 'Basic', value: 2 },
  { label: 'Intermediate', value: 3 },
  { label: 'Advanced', value: 4 },
  { label: 'Expert', value: 5 },
]
