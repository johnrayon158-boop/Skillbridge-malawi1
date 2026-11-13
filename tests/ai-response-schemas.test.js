import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeterministicCvAnalysis,
  extractGeminiResponse,
  normalizeCareerRecommendations,
  normalizeConversationDetail,
  normalizeConversationList,
  normalizeCvAnalysis,
  normalizeCvHistory,
  normalizeJobMatches,
  normalizeLearningRecommendations,
  normalizeSkillGaps,
  parseGeminiJson,
} from '../server/services/ai/responseSchemas.js'
import { requestGeminiJson } from '../server/services/ai/geminiJson.js'
import { createAiRouteHandlers } from '../server/services/ai/aiRouteHandlers.js'
import {
  calculateSkillGaps,
} from '../server/services/ai/aiScoringService.js'
import { createCareerRecommendationHandler } from '../server/services/ai/careerRecommendationHandler.js'

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => payload,
})

const candidateResponse = (text) => ({
  responseId: 'response-123',
  modelVersion: 'gemini-test',
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
})

test('parses Gemini generateContent JSON and Interactions text with citations', () => {
  const generated = extractGeminiResponse(candidateResponse('```json\n{"message":"Hello","actions":[],"sources":[]}\n```'))
  assert.equal(parseGeminiJson(generated.text).message, 'Hello')
  assert.equal(generated.responseId, 'response-123')
  assert.equal(generated.model, 'gemini-test')

  const interaction = extractGeminiResponse({
    id: 'interaction-1',
    steps: [{
      type: 'model_output',
      content: [{
        type: 'text',
        text: '{"message":"Found a listing","actions":[],"sources":[]}',
        annotations: [{ type: 'url_citation', title: 'Source', url: 'https://example.com/job' }],
      }],
    }],
  })
  assert.equal(parseGeminiJson(interaction.text).message, 'Found a listing')
  assert.deepEqual(interaction.sources, [{ title: 'Source', url: 'https://example.com/job' }])
})

test('retries one malformed response with a correction prompt and validates the corrected schema', async () => {
  const prompts = []
  const result = await requestGeminiJson({
    prompt: 'Return a chat response.',
    validate: (value) => typeof value.message === 'string' ? { message: value.message } : null,
    send: async (prompt) => {
      prompts.push(prompt)
      return jsonResponse(candidateResponse(prompts.length === 1 ? 'not JSON' : '{"message":"Corrected"}'))
    },
  })

  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /Correction:/)
  assert.deepEqual(result.value, { message: 'Corrected' })
  assert.equal(result.status, 'ok')
})

test('returns a safe invalid/unavailable status without exposing provider bodies', async () => {
  let calls = 0
  const invalid = await requestGeminiJson({
    prompt: 'Return JSON.',
    validate: () => null,
    send: async () => {
      calls += 1
      return jsonResponse(candidateResponse('invalid'))
    },
  })
  assert.equal(calls, 2)
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.reason, 'invalid_json')

  calls = 0
  const unavailable = await requestGeminiJson({
    prompt: 'Return JSON.',
    validate: () => null,
    send: async () => {
      calls += 1
      return jsonResponse({ error: { message: 'private provider detail' } }, 503)
    },
  })
  assert.equal(calls, 1)
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.reason, 'provider_error')
  assert.equal(Object.hasOwn(unavailable, 'error'), false)
})

test('normalizes deterministic AI feature schemas and rejects malformed results', () => {
  assert.ok(normalizeCareerRecommendations({
    recommendations: [{ career_id: 'career-1', title: 'Analyst', overall_score: 72 }],
  }))
  assert.equal(normalizeCareerRecommendations({ recommendations: [{ career_id: 'career-1', title: 'Analyst', overall_score: 'high' }] }), null)

  assert.ok(normalizeLearningRecommendations({ recommendations: [{ skill: 'SQL', reason: 'Practice' }] }))
  assert.equal(normalizeLearningRecommendations({ recommendations: [{ skill: 'SQL' }] }), null)

  assert.ok(normalizeJobMatches({ matches: [{ job_id: 'job-1', match_score: 80 }] }))
  assert.equal(normalizeJobMatches({ matches: [{ job_id: 'job-1', match_score: 120 }] }), null)

  assert.ok(normalizeSkillGaps({ gaps: [{ name: 'SQL' }] }))
  assert.equal(normalizeSkillGaps({ gaps: [{ skill: 'SQL' }] }), null)
})

test('My Career, learning, and jobs recompute deterministic results when injected scorers return malformed data', async () => {
  const responses = []
  const requiredCareer = {
    id: 'career-1',
    title: 'Data Analyst',
    career_skills: [{ skills: { name: 'SQL' }, required_level: 'advanced' }],
  }
  const studentData = {
    profile: { role: 'student', student_profiles: [] },
    skills: [{ name: 'SQL', level: 'intermediate' }],
    resources: [],
    assessments: [],
    projects: [],
    certificates: [],
    employment: [],
    education: [],
  }
  const handlers = createAiRouteHandlers({
    authenticate: async () => ({ id: 'student-1' }),
    getProfile: async () => ({ id: 'student-1', role: 'student' }),
    loadStudentData: async () => studentData,
    loadCareer: async () => requiredCareer,
    loadJob: async () => null,
    loadJobs: async () => [{
      id: 'job-1',
      title: 'Analyst',
      status: 'published',
      job_skills: [{ skills: { name: 'SQL' }, required_level: 'advanced' }],
    }],
    saveJobMatches: async () => {},
    loadOwnedApplication: async () => null,
    saveRecommendationFeedback: async () => ({}),
    getJsonBody: async (req) => req.body,
    sendJson: (_res, status, payload) => responses.push({ status, payload }),
    errorResponse: (error, statusCode) => ({ ok: false, error, statusCode }),
    scoring: {
      calculateSkillGaps,
      calculateLearningRecommendations: () => ({ recommendations: [{ broken: true }] }),
      calculateJobMatches: () => ({ matches: [{ job_id: 'job-1', match_score: 'invalid' }] }),
    },
  })

  await handlers['POST /api/ai/learning-recommendations']({ body: { targetCareerId: 'career-1' } }, {})
  const learning = responses.pop()
  assert.equal(learning.status, 200)
  assert.equal(learning.payload.data.recommendations[0].skill, 'SQL')

  await handlers['POST /api/ai/job-match']({ body: {} }, {})
  const jobs = responses.pop()
  assert.equal(jobs.status, 200)
  assert.equal(jobs.payload.data.matches[0].job_id, 'job-1')

  let careerResponse
  const careerHandler = createCareerRecommendationHandler({
    authenticate: async () => ({ id: 'student-1' }),
    loadData: async () => ({ profile: { role: 'student' }, careers: [] }),
    saveRecommendations: async () => {},
    sendJson: (_res, status, payload) => { careerResponse = { status, payload } },
    errorResponse: (error, statusCode) => ({ ok: false, error, statusCode }),
    scoreRecommendations: () => ({ recommendations: [{ malformed: true }] }),
  })
  await careerHandler({}, {})
  assert.equal(careerResponse.status, 200)
  assert.deepEqual(careerResponse.payload.data.recommendations, [])
})

test('builds deterministic CV guidance and safely repairs malformed history', () => {
  const deterministic = {
    score: 60,
    basis: {
      missingSkills: ['SQL'],
      matchedSkills: ['Excel'],
      sections: { skills: true, education: true, experience: false },
    },
  }
  const fallback = buildDeterministicCvAnalysis(deterministic)
  assert.match(fallback.summary, /60% deterministic/)
  assert.deepEqual(fallback.missingSkills, ['SQL'])
  assert.ok(normalizeCvAnalysis(fallback))

  assert.deepEqual(normalizeConversationList([null, {}, { id: 'conversation-1' }]).map((item) => item.id), ['conversation-1'])
  const detail = normalizeConversationDetail({
    conversation: { id: 'conversation-1' },
    messages: [
      { id: 'message-1', sender: 'assistant', message: 'Hello', metadata: { actions: [{ label: 'Go', to: 'https://bad.example' }] } },
      { id: 'broken', sender: 'system', message: 'Ignore me' },
    ],
  })
  assert.equal(detail.messages.length, 1)
  assert.deepEqual(detail.messages[0].metadata.actions, [])

  const history = normalizeCvHistory({
    documents: [null, { id: 'document-1', original_filename: 'cv.pdf', mime_type: 'application/pdf' }],
    analyses: [{ id: 'analysis-1', target_title: 'Analyst', compatibility_score: 55, analysis_result: { summary: null } }],
  })
  assert.equal(history.documents.length, 1)
  assert.equal(history.analyses[0].analysis_result.status, 'fallback')
  assert.equal(history.analyses[0].analysis_result.score, 55)
})
