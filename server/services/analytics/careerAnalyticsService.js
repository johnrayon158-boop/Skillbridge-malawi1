import { describeInsufficientData } from './analyticsService.js'

export function buildCareerJourneyAnalytics({ recommendations = [], assessments = [], learning = [], applications = [], employment = [] } = {}) {
  const journey = {
    recommendations: recommendations.length,
    assessments: assessments.length,
    learning: learning.length,
    applications: applications.length,
    employment: employment.length,
  }

  const commonStop = Object.entries(journey).sort((a, b) => b[1] - a[1])[0]

  return {
    journey,
    commonStop: commonStop ? { stage: commonStop[0], count: commonStop[1] } : null,
    notes: recommendations.length || assessments.length || learning.length ? ['Career progression is derived from recorded recommendation, assessment, learning, application, and employment records.'] : [describeInsufficientData('career journey analytics').message],
  }
}
