import { calculateCareerRecommendations } from './aiScoringService.js'
import { normalizeCareerRecommendations } from './responseSchemas.js'

export function createCareerRecommendationHandler({
  authenticate,
  loadData,
  saveRecommendations,
  sendJson,
  errorResponse,
  scoreRecommendations = calculateCareerRecommendations,
}) {
  return async function handleCareerRecommendations(req, res) {
    const user = await authenticate(req)
    if (!user) {
      sendJson(res, 401, errorResponse('Please sign in again to load career recommendations.', 401))
      return
    }

    try {
      const data = await loadData(user.id)
      if (!data?.profile) {
        sendJson(res, 404, errorResponse('Your student profile was not found.', 404))
        return
      }
      if (!['student', 'graduate'].includes(data.profile.role)) {
        sendJson(res, 403, errorResponse('Career recommendations are available to student and graduate accounts.', 403))
        return
      }
      const input = {
        profile: data.profile,
        skills: data.skills || [],
        careers: data.careers || [],
        assessments: data.assessments || [],
        education: data.education || [],
        interests: data.interests || [],
        employerFeedback: data.employerFeedback || [],
      }
      let recommendations = null
      try {
        recommendations = normalizeCareerRecommendations(scoreRecommendations(input))
      } catch {
        // Fall back to the built-in deterministic scorer below.
      }
      if (!recommendations) {
        console.warn('[ai] career recommendations were invalid; using deterministic fallback.')
        recommendations = normalizeCareerRecommendations(calculateCareerRecommendations(input))
      }
      if (!recommendations) throw new Error('Unable to calculate valid career recommendations.')
      await saveRecommendations(user.id, recommendations.recommendations)
      sendJson(res, 200, { ok: true, data: recommendations })
    } catch (error) {
      console.error('[ai] Unable to generate career recommendations.', {
        errorName: error?.name || 'Error',
      })
      sendJson(res, 503, errorResponse('Unable to load or save career recommendations right now.', 503))
    }
  }
}
