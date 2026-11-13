import { supabase } from './supabase'

const configuredApiBase = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_API_BASE_URL
const isLoopbackApi = (() => {
  if (!configuredApiBase || typeof window === 'undefined') return false
  try {
    return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(new URL(configuredApiBase, window.location.origin).hostname)
  } catch {
    return false
  }
})()
const useConfiguredApi = configuredApiBase && !(import.meta.env.PROD && isLoopbackApi)
const AI_API_BASE = (useConfiguredApi
  ? configuredApiBase
  : import.meta.env.DEV && typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : typeof window !== 'undefined'
      ? window.location.origin
      : '').replace(/\/+$/, '')

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const safeDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null

async function readAiResponse(response, fallbackMessage) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('The SkillBridge AI service returned an invalid response. Please try again later.')
  }
  if (!isRecord(payload)) {
    throw new Error('The SkillBridge AI service returned an invalid response. Please try again later.')
  }
  if (!response.ok || payload.ok !== true) {
    const requestError = new Error(fallbackMessage)
    requestError.status = response.status
    if (response.status === 429 || response.status >= 500) requestError.code = 'AI_UNAVAILABLE'
    throw requestError
  }
  if (!Object.hasOwn(payload, 'data')) {
    throw new Error('The SkillBridge AI service returned an incomplete response. Please try again later.')
  }
  return payload.data
}

function normalizeConversationMessages(value) {
  return (Array.isArray(value) ? value : []).filter((message) => (
    isRecord(message)
    && typeof message.id === 'string'
    && ['assistant', 'user'].includes(message.sender)
    && typeof message.message === 'string'
  )).map((message) => {
    const metadata = isRecord(message.metadata) ? message.metadata : {}
    return {
      ...message,
      created_at: safeDate(message.created_at),
      metadata: {
        actions: Array.isArray(metadata.actions) ? metadata.actions.filter((action) => (
          isRecord(action)
          && typeof action.label === 'string'
          && ['/student/career', '/student/skills/gaps', '/student/jobs', '/student/interview-prep', '/student/profile', '/student/modules', '/student/learning', '/student/applications', '/student/portfolio'].includes(action.to)
        )) : [],
        sources: Array.isArray(metadata.sources) ? metadata.sources.filter((source) => (
          isRecord(source) && typeof source.url === 'string' && /^https:\/\/\S+$/i.test(source.url)
        )) : [],
      },
    }
  })
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.')
  }
  return data.session.access_token
}

async function fetchAiApi(url, options) {
  try {
    return await fetch(url, options)
  } catch (error) {
    if (error instanceof TypeError) {
      const guidance = import.meta.env.DEV
        ? 'Start the API with "npm run dev" so it runs alongside Vite.'
        : 'Set VITE_AI_API_URL to the public HTTPS URL of your deployed API and redeploy the frontend.'
      throw new Error(`Cannot reach the SkillBridge API at ${AI_API_BASE}. ${guidance}`, { cause: error })
    }
    throw error
  }
}

async function request(endpoint, payload = {}, apiPath = '/api/ai') {
  const accessToken = await getAccessToken()
  const response = await fetchAiApi(`${AI_API_BASE}${apiPath}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return readAiResponse(response, 'AI recommendations are temporarily unavailable.')
}

export const aiService = {
  async getCareerRecommendations(studentId, context = {}) {
    return request('career-recommendations', { studentId, ...context })
  },

  async getSkillsGap(studentId, targetCareerId, context = {}) {
    return request('skills-gap', { studentId, targetCareerId, ...context })
  },

  async getLearningRecommendations(studentId, targetCareerId, context = {}) {
    return request('learning-recommendations', { studentId, targetCareerId, ...context })
  },

  async getJobMatches(studentId, context = {}) {
    return request('job-match', { studentId, ...context })
  },

  async refreshEmployerApplicationMatches(applicationIds) {
    return request('job-match-analysis', { applicationIds }, '/api/employer')
  },

  async getJobReadiness(studentId, jobId, context = {}) {
    return request('job-readiness', { studentId, jobId, ...context })
  },

  async getCareerRoadmap(studentId, targetCareerId, context = {}) {
    return request('career-roadmap', { studentId, targetCareerId, ...context })
  },

  async submitFeedback(feedback) {
    return request('feedback', feedback)
  },

  async getInterviewQuestions() {
    return { recommendations: [], status: 'fallback' }
  },

  async getInterviewPreparation(studentId, context = {}) {
    return request('interview-preparation', { studentId, ...context })
  },

  async submitInterviewFeedback(payload) {
    return request('interview-feedback', payload)
  },

  async getSkillEvidence(studentId, skillName, context = {}) {
    return request('skill-evidence', { studentId, skillName, ...context })
  },

  async getEvidenceGraph(studentId, context = {}) {
    return request('evidence-graph', { studentId, ...context })
  },

  async getCareerSimulation(studentId, context = {}) {
    return request('career-simulation', { studentId, ...context })
  },

  async askCareerAssistant(studentId, message, context = {}, conversationId) {
    return request('career-chat', { studentId, message, context, conversationId })
  },

  async getCareerChatConversations(studentId) {
    const accessToken = await getAccessToken()
    const response = await fetchAiApi(`${AI_API_BASE}/api/ai/career-chat/conversations?studentId=${encodeURIComponent(studentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await readAiResponse(response, 'Unable to load chat history.')
    return Array.isArray(data?.conversations) ? data.conversations.filter((item) => (
      isRecord(item) && typeof item.id === 'string'
    )).map((item) => ({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : 'Career conversation',
      created_at: safeDate(item.created_at),
      updated_at: safeDate(item.updated_at),
    })) : []
  },

  async getCareerChatConversation(studentId, conversationId) {
    const accessToken = await getAccessToken()
    const response = await fetchAiApi(`${AI_API_BASE}/api/ai/career-chat/conversations/${encodeURIComponent(conversationId)}?studentId=${encodeURIComponent(studentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await readAiResponse(response, 'Unable to load this conversation.')
    if (!isRecord(data?.conversation) || typeof data.conversation.id !== 'string') {
      throw new Error('This conversation is unavailable or has invalid saved history.')
    }
    return {
      conversation: {
        id: data.conversation.id,
        title: typeof data.conversation.title === 'string' ? data.conversation.title : 'Career conversation',
        created_at: safeDate(data.conversation.created_at),
        updated_at: safeDate(data.conversation.updated_at),
      },
      messages: normalizeConversationMessages(data.messages),
    }
  },

  async deleteCareerChatConversation(studentId, conversationId) {
    const accessToken = await getAccessToken()
    const response = await fetchAiApi(`${AI_API_BASE}/api/ai/career-chat/conversations/${encodeURIComponent(conversationId)}?studentId=${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return readAiResponse(response, 'Unable to delete this conversation.')
  },

  async uploadCvDocument(userId, file) {
    const extension = file.name.split('.').pop()?.toLowerCase()
    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    const mimeType = mimeTypes[extension]
    if (!mimeType || (file.type && file.type !== mimeType)) {
      throw new Error('Choose a PDF or DOCX CV file.')
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      throw new Error('CV files must be smaller than 10 MB.')
    }

    const documentPath = `${userId}/${window.crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('cv-documents')
      .upload(documentPath, file, { contentType: mimeType, upsert: false })
    if (uploadError) throw new Error(uploadError.message || 'Unable to upload your CV.')

    const { data, error } = await supabase
      .from('cv_documents')
      .insert({
        user_id: userId,
        storage_path: documentPath,
        original_filename: file.name.slice(0, 180),
        mime_type: mimeType,
        file_size_bytes: file.size,
      })
      .select('id, original_filename, mime_type, file_size_bytes, created_at')
      .single()

    if (error) {
      const { error: cleanupError } = await supabase.storage.from('cv-documents').remove([documentPath])
      if (cleanupError) console.error('Unable to clean up unregistered CV upload:', cleanupError.message)
      throw new Error('Unable to save the uploaded CV to your private library.')
    }
    return data
  },

  async getCvAnalysisHistory() {
    const token = await getAccessToken()
    const response = await fetchAiApi(`${AI_API_BASE}/api/ai/cv-analysis/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await readAiResponse(response, 'Unable to load CV analysis history.')
    return {
      documents: Array.isArray(data?.documents) ? data.documents.filter((item) => (
        isRecord(item) && typeof item.id === 'string' && typeof item.original_filename === 'string' &&
        ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(item.mime_type)
      )).map((item) => ({ ...item, created_at: safeDate(item.created_at) })) : [],
      analyses: Array.isArray(data?.analyses) ? data.analyses.filter((item) => (
        isRecord(item) && typeof item.id === 'string' && isRecord(item.analysis_result)
      )).map((item) => ({ ...item, created_at: safeDate(item.created_at) })) : [],
    }
  },

  async analyzeCv(payload) {
    const token = await getAccessToken()
    const response = await fetchAiApi(`${AI_API_BASE}/api/ai/cv-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await readAiResponse(response, 'Unable to complete CV analysis.')
    if (!isRecord(data) || typeof data.summary !== 'string' || !Number.isFinite(data.score)) {
      throw new Error('The CV analysis response was incomplete. Please try again later.')
    }
    return data
  },
}
