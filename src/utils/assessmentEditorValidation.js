const ASSESSMENT_TYPES = new Set(['skill', 'career', 'job', 'practice'])

export function validateAssessmentDraft(assessment) {
  if (!String(assessment?.title || '').trim()) return 'Enter an assessment title.'
  if (String(assessment.title).trim().length > 200) return 'Assessment titles must be 200 characters or fewer.'
  if (!String(assessment?.description || '').trim()) return 'Enter an assessment description.'
  if (!ASSESSMENT_TYPES.has(assessment.assessment_type)) return 'Choose a valid assessment type.'

  if (assessment.duration_minutes !== '' && assessment.duration_minutes != null) {
    const duration = Number(assessment.duration_minutes)
    if (!Number.isInteger(duration) || duration < 1) return 'Duration must be a positive whole number of minutes.'
  }

  if (assessment.passing_score !== '' && assessment.passing_score != null) {
    const passingScore = Number(assessment.passing_score)
    if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
      return 'Passing score must be a whole number from 0 to 100.'
    }
  }

  if (assessment.questions == null) return ''
  if (!Array.isArray(assessment.questions)) return 'Assessment questions must be provided as a list.'

  for (const [index, question] of assessment.questions.entries()) {
    const number = index + 1
    if (!String(question?.question || '').trim()) return `Enter the text for question ${number}.`
    const options = Array.isArray(question.options)
      ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
      : []
    if (options.length < 2) return `Question ${number} needs at least two answer options.`
    if (new Set(options).size !== options.length) return `Question ${number} has duplicate answer options.`
    const correctAnswer = String(question.correct_answer || '').trim()
    if (!correctAnswer || !options.includes(correctAnswer)) {
      return `Choose a correct answer from the options for question ${number}.`
    }
    if (!Number.isInteger(Number(question.points)) || Number(question.points) < 1) {
      return `Question ${number} must be worth at least one point.`
    }
  }

  return ''
}
