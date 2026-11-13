function average(values) {
  const valid = values.filter((value) => value !== null && value !== undefined && value !== '').map(Number).filter((value) => Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function percentage(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : null
}

function latestCareerFeedback(rows) {
  const latest = new Map()
  rows.forEach((row, index) => {
    const key = row.student_id && row.career_recommendation_id
      ? `${row.student_id}:${row.career_recommendation_id}`
      : row.id || `record:${index}`
    const previous = latest.get(key)
    if (!previous || String(row.created_at || '') >= String(previous.created_at || '')) latest.set(key, row)
  })
  return [...latest.values()]
}

function latestUsabilityResponses(rows) {
  const latest = new Map()
  rows.forEach((row, index) => {
    const key = row.user_id
      ? `${row.user_id}:${row.workflow || 'general'}`
      : row.id || `record:${index}`
    const previous = latest.get(key)
    if (!previous || String(row.submitted_at || '') >= String(previous.submitted_at || '')) latest.set(key, row)
  })
  return [...latest.values()]
}

const USABILITY_QUESTIONS = [
  ['Ease of use', 'ease_of_use'],
  ['Navigation clarity', 'navigation_clarity'],
  ['Task completion', 'task_completion'],
  ['Trust in recommendations', 'trust_in_recommendations'],
  ['Overall satisfaction', 'overall_satisfaction'],
]

const WORKFLOW_LABELS = {
  general: 'General platform experience',
  career_recommendations: 'Career recommendations',
  job_matching: 'Jobs and matching',
  assessments: 'Assessments',
  learning: 'Learning',
}

function buildUsabilityQuestions(responses) {
  return USABILITY_QUESTIONS.map(([label, field]) => {
    const ratings = responses.map((response) => response[field]).filter((value) => value !== null && value !== undefined && value !== '')
    return { label, sampleSize: ratings.length, average: average(ratings), scale: '1 to 5' }
  })
}

function countRespondents(responses) {
  const users = new Set(responses.map((response) => response.user_id).filter(Boolean))
  return users.size || responses.length
}

export function calculateEvaluationReport({
  careerFeedback = [],
  recommendationActions = {},
  assessmentResults = [],
  assessmentAttempts = [],
  matchReviews = [],
  jobMatches = [],
  usabilityResponses = [],
  openFeedbackCount,
} = {}) {
  const uniqueCareerFeedback = latestCareerFeedback(careerFeedback)
  const uniqueUsabilityResponses = latestUsabilityResponses(usabilityResponses)
  const relevanceRatings = uniqueCareerFeedback.map((row) => row.relevance_rating).filter((value) => value !== null && value !== undefined && value !== '')
  const suitabilityRatings = uniqueCareerFeedback.map((row) => row.suitability_rating).filter((value) => value !== null && value !== undefined && value !== '')
  const usefulVotes = uniqueCareerFeedback.filter((row) => typeof row.is_useful === 'boolean')
  const scoredAssessments = assessmentResults.filter((row) => row.score !== null && row.score !== undefined && row.score !== '' && Number.isFinite(Number(row.score)))
  const completedAssessmentResults = assessmentResults.filter((row) => row.completed_at)
  const completedAttempts = assessmentAttempts.filter((attempt) => attempt.completed_at)

  const scoresByPair = new Map()
  for (const match of jobMatches) {
    if (!match.student_id || !match.job_id) continue
    if (match.match_score === null || match.match_score === undefined || match.match_score === '') continue
    const score = Number(match.match_score)
    if (Number.isFinite(score)) scoresByPair.set(`${match.student_id}:${match.job_id}`, score)
  }
  const scoredReviews = matchReviews.flatMap((review) => {
    const score = scoresByPair.get(`${review.candidate_id}:${review.job_id}`)
    return Number.isFinite(score) && typeof review.expected_match === 'boolean'
      ? [{ expected: review.expected_match, predicted: score >= 60 }]
      : []
  })
  const truePositive = scoredReviews.filter((row) => row.expected && row.predicted).length
  const trueNegative = scoredReviews.filter((row) => !row.expected && !row.predicted).length
  const falsePositive = scoredReviews.filter((row) => !row.expected && row.predicted).length
  const falseNegative = scoredReviews.filter((row) => row.expected && !row.predicted).length
  const precisionSampleSize = truePositive + falsePositive
  const recallSampleSize = truePositive + falseNegative
  const precision = percentage(truePositive, precisionSampleSize)
  const recall = percentage(truePositive, recallSampleSize)
  const f1 = precision !== null && recall !== null && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : null

  const usabilityQuestions = buildUsabilityQuestions(uniqueUsabilityResponses)
  const satisfaction = usabilityQuestions.find((item) => item.label === 'Overall satisfaction')
  const workflowKeys = [...new Set([
    ...Object.keys(WORKFLOW_LABELS),
    ...uniqueUsabilityResponses.map((response) => response.workflow || 'general'),
  ])]
  const usabilityByWorkflow = workflowKeys.map((workflow) => {
    const responses = uniqueUsabilityResponses.filter((response) => (response.workflow || 'general') === workflow)
    const questions = buildUsabilityQuestions(responses)
    const overall = questions.find((item) => item.label === 'Overall satisfaction')
    return {
      workflow,
      label: WORKFLOW_LABELS[workflow] || workflow,
      respondentCount: countRespondents(responses),
      sampleSize: overall?.sampleSize || 0,
      average: overall?.average ?? null,
    }
  })

  const actionSampleSize = Number(recommendationActions.sample_size) || 0
  const acceptedRecommendations = Number(recommendationActions.accepted) || 0
  const dismissedRecommendations = Number(recommendationActions.dismissed) || 0
  const exploredRecommendations = Number(recommendationActions.explored) || 0
  const startedAttempts = assessmentAttempts.length

  return {
    generatedAt: new Date().toISOString(),
    recommendationRelevance: {
      relevance: { sampleSize: relevanceRatings.length, average: average(relevanceRatings), scale: '1 to 5' },
      suitability: { sampleSize: suitabilityRatings.length, average: average(suitabilityRatings), scale: '1 to 5' },
      legacyUsefulVotes: usefulVotes.length,
      legacyUsefulPercentage: percentage(usefulVotes.filter((row) => row.is_useful).length, usefulVotes.length),
    },
    recommendationEngagement: {
      sampleSize: actionSampleSize,
      accepted: acceptedRecommendations,
      dismissed: dismissedRecommendations,
      explored: exploredRecommendations,
      acceptanceRate: percentage(acceptedRecommendations, actionSampleSize),
      dismissalRate: percentage(dismissedRecommendations, actionSampleSize),
      explorationRate: percentage(exploredRecommendations, actionSampleSize),
      unavailableReason: actionSampleSize ? null : 'No student recommendation actions have been recorded.',
    },
    skillsGapIdentification: { status: 'Use predefined deterministic test cases; reported separately from live user outcomes.' },
    assessmentPerformance: {
      resultRows: assessmentResults.length,
      completedResults: completedAssessmentResults.length,
      scoredSampleSize: scoredAssessments.length,
      averageScore: average(scoredAssessments.map((row) => row.score)),
      passedCount: scoredAssessments.filter((row) => row.passed === true).length,
      passSampleSize: scoredAssessments.filter((row) => typeof row.passed === 'boolean').length,
      passRate: percentage(
        scoredAssessments.filter((row) => row.passed === true).length,
        scoredAssessments.filter((row) => typeof row.passed === 'boolean').length,
      ),
      startedAttempts,
      completedAttempts: completedAttempts.length,
      completionRate: percentage(completedAttempts.length, startedAttempts),
      completionRateUnavailableReason: startedAttempts
        ? null
        : 'No assessment starts have been collected yet; completion rate is unavailable, not zero.',
    },
    matchingAccuracy: {
      threshold: 60,
      sampleSize: scoredReviews.length,
      reviewedExamples: matchReviews.length,
      unscoredExamples: matchReviews.length - scoredReviews.length,
      accuracy: percentage(truePositive + trueNegative, scoredReviews.length),
      precisionSampleSize,
      recallSampleSize,
      precision,
      recall,
      f1,
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
      unavailableReason: scoredReviews.length ? null : 'No reviewed candidate-job examples with a current stored match score are available.',
    },
    usability: {
      respondentCount: countRespondents(uniqueUsabilityResponses),
      sampleSize: satisfaction?.sampleSize || 0,
      questions: usabilityQuestions,
      byWorkflow: usabilityByWorkflow,
      openFeedbackCount: openFeedbackCount ?? uniqueUsabilityResponses.filter((response) => String(response.feedback || '').trim()).length,
    },
    userSatisfaction: {
      sampleSize: satisfaction?.sampleSize || 0,
      average: satisfaction?.average ?? null,
      scale: '1 to 5',
      unavailableReason: satisfaction?.average === null ? 'No user satisfaction responses have been submitted.' : null,
    },
  }
}
