import { analyzeSkillGaps } from '../algorithms/skillGapAnalysis.js'

export const SKILLS_GAP_EVALUATION_CASES = [
  {
    id: 'missing-required-skill',
    description: 'A target requirement absent from a profile is marked missing and high severity.',
    skills: [],
    requirements: [{ name: 'SQL', required_level: 'intermediate' }],
    expected: [{ name: 'SQL', gap: 'missing', currentScore: 0, requiredScore: 60, gapSize: 60, severity: 'high' }],
  },
  {
    id: 'large-proficiency-gap',
    description: 'A beginner skill against an advanced requirement is insufficient and high severity.',
    skills: [{ name: 'Python', level: 'beginner' }],
    requirements: [{ name: 'Python', required_level: 'advanced' }],
    expected: [{ name: 'Python', gap: 'insufficient', currentScore: 25, requiredScore: 80, gapSize: 55, severity: 'high' }],
  },
  {
    id: 'medium-proficiency-gap',
    description: 'An intermediate skill against an advanced requirement has a medium gap.',
    skills: [{ name: 'Statistics', level: 'intermediate' }],
    requirements: [{ name: 'Statistics', required_level: 'advanced' }],
    expected: [{ name: 'Statistics', gap: 'insufficient', currentScore: 60, requiredScore: 80, gapSize: 20, severity: 'medium' }],
  },
  {
    id: 'no-gap-for-met-requirement',
    description: 'A proficiency meeting the requirement produces no gap.',
    skills: [{ name: 'Communication', level: 'advanced' }],
    requirements: [{ name: 'Communication', required_level: 'intermediate' }],
    expected: [],
  },
]

export function evaluateSkillsGapCases(cases = SKILLS_GAP_EVALUATION_CASES) {
  return cases.map((testCase) => {
    const actual = analyzeSkillGaps(testCase.skills, testCase.requirements).map((gap) => ({
      name: gap.name,
      gap: gap.gap,
      currentScore: gap.currentScore,
      requiredScore: gap.requiredScore,
      gapSize: gap.gapSize,
      severity: gap.severity,
    }))
    return {
      id: testCase.id,
      description: testCase.description,
      passed: JSON.stringify(actual) === JSON.stringify(testCase.expected),
      actual,
      expected: testCase.expected,
    }
  })
}
