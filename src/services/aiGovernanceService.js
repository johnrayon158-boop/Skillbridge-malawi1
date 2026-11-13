const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_URL || 'http://localhost:4000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const data = await response.json().catch(() => ({ ok: false, error: 'Unable to parse governance response.' }))
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Governance data is temporarily unavailable.')
  }

  return data.data
}

export const aiGovernanceService = {
  async getStatus() {
    return request('/api/ai/governance/status')
  },

  async getRecommendation(id) {
    return request(`/api/ai/governance/recommendations/${id}`)
  },

  async getExplanation(id) {
    return request(`/api/ai/governance/explanation/${id}`)
  },

  async getMonitoring() {
    return request('/api/admin/ai-monitoring')
  },

  async getQuality() {
    return request('/api/admin/ai-monitoring/quality')
  },

  async getFairness() {
    return request('/api/admin/ai-monitoring/fairness')
  },

  async getErrors() {
    return request('/api/admin/ai-monitoring/errors')
  },

  async submitFeedback(payload) {
    return request('/api/ai/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
