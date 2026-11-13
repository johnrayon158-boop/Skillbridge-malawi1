const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const normalize = (value) => clamp(Math.round(Number(value) || 0), 0, 100)

const pickSkillNames = (jobRequirements = []) => {
  const names = []
  for (const requirement of jobRequirements || []) {
    const name = String(requirement?.skills?.name || requirement?.skill_name || requirement?.name || requirement?.skill || '').trim()
    if (name) names.push(name)
  }
  return [...new Set(names)]
}

export function generateInterviewPreparation({
  userId,
  jobId,
  applicationId,
  candidateSkills = [],
  assessmentResults = [],
  projects = [],
  jobRequirements = {},
  identifiedGaps = [],
} = {}) {
  const requiredSkills = pickSkillNames(Array.isArray(jobRequirements?.job_skills) ? jobRequirements.job_skills : (Array.isArray(jobRequirements?.required_skills) ? jobRequirements.required_skills.map((name) => ({ name })) : []))
  const skillNames = Array.isArray(candidateSkills) ? candidateSkills.map((skill) => String(skill?.skills?.name || skill?.name || skill?.skill_name || '').trim()).filter(Boolean) : []
  const matchedSkills = requiredSkills.filter((skill) => skillNames.some((candidate) => candidate.toLowerCase() === skill.toLowerCase()))
  const missingSkills = requiredSkills.filter((skill) => !skillNames.some((candidate) => candidate.toLowerCase() === skill.toLowerCase()))
  const highGapSkills = Array.isArray(identifiedGaps) ? identifiedGaps.map((item) => String(item?.skill || item?.name || item).trim()).filter(Boolean) : []

  const techQuestions = requiredSkills.length
    ? requiredSkills.map((skill, index) => ({
        id: `tech-${index}`,
        category: 'Technical Preparation',
        question: `Explain how you would demonstrate or apply ${skill} in a real workplace task relevant to this role.`,
        skill,
      }))
    : [{
        id: 'tech-unavailable',
        category: 'Technical Preparation',
        question: 'The job requirements are not available in the current system data, so technical preparation should be based on the posted role description and your profile evidence.',
        skill: 'Role description unavailable',
      }]

  const behaviouralQuestions = [
    'Describe a time you solved a difficult problem with a teammate or classmate.',
    'How do you communicate progress when a task is behind schedule?',
    'Tell us about a situation where you adapted quickly to a changing requirement.',
    'Describe how you handle feedback from a supervisor or client.',
    'Give an example of teamwork and leadership in a project context.',
  ].map((question, index) => ({ id: `behaviour-${index}`, category: 'Behavioural Preparation', question, skill: 'Communication and professionalism' }))

  const situationalQuestions = [
    'A deadline changes unexpectedly. How would you reorganize your work and communicate the impact?',
    'A team member is not contributing. What would you do to keep the project on track?',
    'You are asked to work on a task outside your comfort zone. How would you handle it?',
    'You spot a bug in production affecting users. Explain how you would respond and communicate the issue.',
    'You are asked to explain technical work to a non-technical stakeholder. How would you do it?',
  ].map((question, index) => ({ id: `situational-${index}`, category: 'Situational Preparation', question, skill: 'Problem solving' }))

  const projectQuestions = (projects && projects.length)
    ? projects.slice(0, 4).map((project, index) => ({
        id: `project-${index}`,
        category: 'Project-Based Questions',
        question: `Walk me through your ${project?.title || 'project'} and explain the technical decisions you made while building it.`,
        skill: project?.title || 'Portfolio project',
      }))
    : [{ id: 'project-unavailable', category: 'Project-Based Questions', question: 'No project evidence is currently available for this student profile. Document a relevant project or portfolio example before the interview.', skill: 'Project evidence unavailable' }]

  const gapQuestions = highGapSkills.length
    ? highGapSkills.slice(0, 4).map((skill, index) => ({
        id: `gap-${index}`,
        category: 'Skill-Gap Revision',
        question: `Explain the concepts, trade-offs and risks you would consider when improving your ${skill} skills for this role.`,
        skill,
      }))
    : [{ id: 'gap-default', category: 'Skill-Gap Revision', question: 'No priority gap has been identified from the current profile. Review the role requirements and your strongest evidence to identify the next learning target.', skill: 'Gap data unavailable' }]

  const readinessScore = normalize(
    (matchedSkills.length / Math.max(requiredSkills.length || 1, 1)) * 70 +
    (Array.isArray(assessmentResults) && assessmentResults.length ? assessmentResults.reduce((total, item) => total + normalize(item?.percentage || item?.score || 0), 0) / assessmentResults.length * 0.3 : 50 * 0.3)
  )

  const revisionTopics = [
    ...requiredSkills.slice(0, 3),
    ...highGapSkills.slice(0, 3),
  ].filter(Boolean)

  return {
    jobId: jobId || null,
    applicationId: applicationId || null,
    studentId: userId || null,
    readinessScore,
    preparationProgress: clamp(Math.round((matchedSkills.length / Math.max(requiredSkills.length || 1, 1)) * 100), 0, 100),
    jobTitle: jobRequirements?.title || jobRequirements?.job_title || 'Role details unavailable',
    company: jobRequirements?.company || jobRequirements?.employer || 'Company information unavailable',
    requiredSkills,
    matchedSkills,
    missingSkills,
    technicalQuestions: techQuestions,
    behaviouralQuestions,
    situationalQuestions,
    projectQuestions,
    skillGapQuestions: gapQuestions,
    revisionTopics: revisionTopics.length ? revisionTopics : ['Review the job description and your strongest evidence sources before the interview.'],
    summary: requiredSkills.length
      ? `Your current profile aligns with ${matchedSkills.length} of the role’s key skills. Focus your preparation on the remaining priorities: ${missingSkills.slice(0, 2).join(', ') || 'role-specific evidence and confidence building'}.`
      : 'The system does not currently have enough job-skill data to generate a tailored interview set. Use your profile, evidence and role description as the basis for preparation.',
    generatedBy: 'deterministic scoring + AI explanation',
    aiStatus: 'AI preparation is generated from current profile data and described as AI-generated guidance.',
  }
}

export function generateInterviewFeedback({ question = '', answer = '', skill = '', rubric = {} } = {}) {
  const text = String(answer || '').trim()
  const keywords = String(skill || '').toLowerCase()
  const hasAnswer = text.length > 20
  const relevanceScore = hasAnswer ? 80 : 30
  const technicalScore = text.toLowerCase().includes(keywords) ? 82 : 64
  const completenessScore = text.split(/\s+/).length > 30 ? 78 : 58
  const clarityScore = text.includes('because') || text.includes('for example') || text.includes('first') ? 80 : 64
  const structureScore = text.includes('first') || text.includes('then') || text.includes('finally') ? 82 : 66
  const confidence = hasAnswer ? 'Moderate to strong' : 'Low confidence'

  const overall = Math.round(
    (relevanceScore + technicalScore + completenessScore + clarityScore + structureScore) / 5
  )

  return {
    label: 'AI Practice Feedback',
    question: question || 'Interview practice question',
    summary: 'This feedback is for self-improvement only and is not an official employer evaluation.',
    rubric: rubric || {},
    scores: {
      relevance: relevanceScore,
      technicalCorrectness: technicalScore,
      completeness: completenessScore,
      clarity: clarityScore,
      structure: structureScore,
      confidence,
      overall,
    },
    missingConcepts: keywords
      ? [`Strengthen evidence and examples related to ${skill || 'the main skill area'}.`]
      : ['Add a clearer example, concrete steps, and a conclusion to strengthen the answer.'],
    suggestedImprovement: hasAnswer
      ? 'Use a clearer structure: explain the problem, your approach, what you changed, and the result. Include one concrete example when possible.'
      : 'Add a concrete example and explain the technical process in a structured way.',
    recommendedRevisionTopic: skill || 'Review the job-specific concepts and examples most relevant to this role.',
    isOfficialEmployerEvaluation: false,
  }
}
