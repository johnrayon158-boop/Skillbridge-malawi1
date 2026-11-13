const distractorTemplates = [
  (skill) => `Ignore the ${skill} requirement and submit the first result without checking it.`,
  (skill) => `Ask someone else to perform ${skill} without reviewing their work.`,
  () => `Use an unrelated approach and do not explain the result.`,
]

function createQuestion(job, skill, index) {
  const correctAnswer = `Apply ${skill} to complete the task, verify the result against the job requirements, and explain any important decisions.`
  const options = [
    correctAnswer,
    ...distractorTemplates.map((createDistractor) => createDistractor(skill)),
  ]
  const offset = index % options.length
  const shuffledOptions = [...options.slice(offset), ...options.slice(0, offset)]

  return {
    question: `For the ${job.title} role, which response best demonstrates ${skill}?`,
    question_type: 'multiple_choice',
    options: shuffledOptions,
    correct_answer: correctAnswer,
    points: 1,
    difficulty: 'intermediate',
    explanation: `A strong response demonstrates ${skill}, checks the work against the role requirements, and communicates the reasoning.`,
  }
}

export function buildJobAssessment(job) {
  const skillNames = [...new Set((job?.job_skills || [])
    .filter((requirement) => requirement.is_required !== false)
    .map((requirement) => requirement.skills?.name?.trim())
    .filter(Boolean))]
    .slice(0, 10)

  if (!job?.id || !job.title?.trim()) throw new Error('Select a valid job before generating an assessment.')
  if (!skillNames.length) {
    throw new Error('Add required skills to this job before generating its assessment.')
  }

  return {
    title: `${job.title.trim()} Skills Assessment`,
    description: `A job-specific assessment covering ${skillNames.join(', ')}.`,
    durationMinutes: Math.max(15, skillNames.length * 3),
    questions: skillNames.map((skill, index) => createQuestion(job, skill, index)),
  }
}
