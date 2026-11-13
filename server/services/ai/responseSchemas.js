const CHAT_ACTION_ROUTES = new Set([
  '/student/career',
  '/student/skills/gaps',
  '/student/jobs',
  '/student/interview-prep',
  '/student/profile',
  '/student/modules',
  '/student/learning',
  '/student/applications',
  '/student/portfolio',
])

const CV_ANALYSIS_KEYS = [
  'professionalSummary',
  'education',
  'skills',
  'experience',
  'projects',
  'certifications',
  'structure',
]

const PORTFOLIO_ANALYSIS_KEYS = [
  'relevance',
  'quality',
  'technicalEvidence',
  'diversity',
  'documentation',
  'completeness',
]

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const boundedString = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
const safeDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
const boundedStrings = (value, limit = 10) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 600)).filter(Boolean).slice(0, limit)
  : []

function getGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  const candidate = candidates.find((item) => Array.isArray(item?.content?.parts) &&
    item.content.parts.some((part) => typeof part?.text === 'string'))
  if (!candidate) return ''
  return candidate.content.parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

function getInteractionText(payload) {
  const steps = payload?.interaction?.steps || payload?.steps
  if (!Array.isArray(steps)) return ''
  return steps
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((content) => content?.type === 'text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n')
}

function getInteractionSources(payload) {
  const steps = payload?.interaction?.steps || payload?.steps
  if (!Array.isArray(steps)) return []
  return steps
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .flatMap((content) => Array.isArray(content.annotations) ? content.annotations : [])
    .filter((annotation) => annotation?.type === 'url_citation' &&
      typeof annotation.url === 'string' && /^https:\/\/\S+$/i.test(annotation.url))
    .map((annotation) => ({
      title: boundedString(annotation.title, 160) || annotation.url,
      url: annotation.url.slice(0, 2048),
    }))
}

export function extractGeminiResponse(payload) {
  const isInteraction = Array.isArray(payload?.interaction?.steps) || Array.isArray(payload?.steps)
  return {
    text: isInteraction ? getInteractionText(payload) : getGeminiText(payload),
    sources: isInteraction ? getInteractionSources(payload) : [],
    responseId: boundedString(payload?.responseId || payload?.interaction?.id || payload?.id, 160) || null,
    model: boundedString(payload?.modelVersion || payload?.model, 100) || null,
    finishReason: boundedString(payload?.candidates?.[0]?.finishReason, 80) || null,
  }
}

function findJsonObject(text) {
  const start = text.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

export function parseGeminiJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  for (const candidate of [cleaned, findJsonObject(cleaned)]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      continue
    }
  }
  return null
}

export function normalizeChatResponse(value, allowPartial = false) {
  if (!isRecord(value) || !isNonEmptyString(value.message)) return null
  if (!allowPartial && (!Array.isArray(value.actions) || !Array.isArray(value.sources))) return null
  const actions = (Array.isArray(value.actions) ? value.actions : [])
    .filter((action) => isRecord(action) && CHAT_ACTION_ROUTES.has(action.to) && isNonEmptyString(action.label))
    .map((action) => ({ label: boundedString(action.label, 80), to: action.to }))
    .slice(0, 3)
  const sources = (Array.isArray(value.sources) ? value.sources : [])
    .filter((source) => isRecord(source) && typeof source.url === 'string' && /^https:\/\/\S+$/i.test(source.url))
    .map((source) => ({
      title: boundedString(source.title, 160) || source.url,
      url: source.url.slice(0, 2048),
    }))
    .slice(0, 8)

  return {
    message: boundedString(value.message, 12000),
    actions,
    sources,
  }
}

function normalizeConversation(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return null
  return {
    id: boundedString(value.id, 160),
    title: boundedString(value.title, 120) || 'Career conversation',
    created_at: safeDate(value.created_at),
    updated_at: safeDate(value.updated_at),
  }
}

function normalizeChatMessage(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id) ||
      !['user', 'assistant'].includes(value.sender) || !isNonEmptyString(value.message)) return null
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  const reply = normalizeChatResponse({
    message: value.message,
    actions: metadata.actions,
    sources: metadata.sources,
  }, true)

  return {
    id: boundedString(value.id, 160),
    sender: value.sender,
    message: reply.message,
    metadata: { actions: reply.actions, sources: reply.sources },
    created_at: safeDate(value.created_at),
  }
}

export function normalizeConversationList(value) {
  return (Array.isArray(value) ? value : []).map(normalizeConversation).filter(Boolean)
}

export function normalizeConversationDetail(value) {
  if (!isRecord(value)) return null
  const conversation = normalizeConversation(value.conversation)
  if (!conversation) return null
  return {
    conversation,
    messages: (Array.isArray(value.messages) ? value.messages : []).map(normalizeChatMessage).filter(Boolean),
  }
}

function normalizeCategory(value, keys) {
  if (!isRecord(value)) return Object.fromEntries(keys.map((key) => [key, '']))
  return Object.fromEntries(keys.map((key) => [key, boundedString(value[key], 700)]))
}

export function normalizeCvAnalysis(value, allowPartial = false) {
  if (!isRecord(value) || !isNonEmptyString(value.summary)) return null
  const arrayFields = [
    'strengths',
    'weaknesses',
    'missingSkills',
    'missingCvContent',
    'missingPortfolioEvidence',
    'cvImprovements',
    'portfolioImprovements',
    'priorityActions',
    'actionPlan',
  ]
  if (!allowPartial && (
    arrayFields.some((field) => !Array.isArray(value[field]))
    || !isRecord(value.cvAnalysis)
    || !isRecord(value.portfolioAnalysis)
    || arrayFields.filter((field) => field !== 'priorityActions')
      .some((field) => value[field].some((item) => typeof item !== 'string'))
    || value.priorityActions.some((item) => !isRecord(item) ||
      typeof item.title !== 'string' || typeof item.description !== 'string')
    || [...CV_ANALYSIS_KEYS.map((key) => value.cvAnalysis[key]),
      ...PORTFOLIO_ANALYSIS_KEYS.map((key) => value.portfolioAnalysis[key])]
      .some((item) => typeof item !== 'string')
  )) return null
  const priorityActions = (Array.isArray(value.priorityActions) ? value.priorityActions : [])
    .filter((item) => isRecord(item) && isNonEmptyString(item.title) && isNonEmptyString(item.description))
    .slice(0, 8)
    .map((item) => ({
      title: boundedString(item.title, 160),
      description: boundedString(item.description, 700),
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
    }))

  return {
    summary: boundedString(value.summary, 1200),
    strengths: boundedStrings(value.strengths),
    weaknesses: boundedStrings(value.weaknesses),
    missingSkills: boundedStrings(value.missingSkills, 15),
    missingCvContent: boundedStrings(value.missingCvContent),
    missingPortfolioEvidence: boundedStrings(value.missingPortfolioEvidence),
    cvAnalysis: normalizeCategory(value.cvAnalysis, CV_ANALYSIS_KEYS),
    portfolioAnalysis: normalizeCategory(value.portfolioAnalysis, PORTFOLIO_ANALYSIS_KEYS),
    cvImprovements: boundedStrings(value.cvImprovements),
    portfolioImprovements: boundedStrings(value.portfolioImprovements),
    priorityActions,
    actionPlan: boundedStrings(value.actionPlan, 10),
  }
}

export function buildDeterministicCvAnalysis(deterministic) {
  const score = Math.max(0, Math.min(100, Number(deterministic?.score) || 0))
  const sections = deterministic?.basis?.sections || {}
  const missingSkills = boundedStrings(deterministic?.basis?.missingSkills, 15)
  const presentSections = Object.entries(sections).filter(([, present]) => present).map(([name]) => name)
  const missingSections = Object.entries(sections).filter(([, present]) => !present).map(([name]) => name)
  const strengths = presentSections.length
    ? [`The CV includes ${presentSections.slice(0, 4).join(', ')} evidence.`]
    : ['A deterministic CV completeness and evidence review was completed.']
  if (deterministic?.basis?.matchedSkills?.length) {
    strengths.push(`Target skill evidence found for ${deterministic.basis.matchedSkills.slice(0, 5).join(', ')}.`)
  }
  const improvements = missingSections.slice(0, 6).map((section) => `Add or clarify a ${section.replace(/[A-Z]/g, ' $&').toLowerCase()} section.`)
  const summary = `Your CV has a ${score}% deterministic evidence compatibility score for the selected target. This score reflects documented evidence coverage, not a probability of employment.`

  return {
    summary,
    strengths,
    weaknesses: missingSkills.length ? [`Target skills without supporting CV or profile evidence: ${missingSkills.slice(0, 6).join(', ')}.`] : [],
    missingSkills,
    missingCvContent: missingSections.slice(0, 8),
    missingPortfolioEvidence: [],
    cvAnalysis: normalizeCategory({}, CV_ANALYSIS_KEYS),
    portfolioAnalysis: normalizeCategory({}, PORTFOLIO_ANALYSIS_KEYS),
    cvImprovements: improvements,
    portfolioImprovements: [],
    priorityActions: missingSkills.slice(0, 3).map((skill) => ({
      title: `Build evidence for ${skill}`,
      description: `Add a relevant project, assessment, or verified skill record for ${skill}.`,
      priority: 'medium',
    })),
    actionPlan: [
      'Review the target requirements and compare them with your documented evidence.',
      ...(missingSkills.length ? [`Build and document evidence for ${missingSkills.slice(0, 3).join(', ')}.`] : []),
    ].slice(0, 10),
  }
}

const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100

export function normalizeCareerRecommendations(value) {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) return null
  if (value.recommendations.some((item) => !isRecord(item) || !isNonEmptyString(item.career_id) ||
      !isNonEmptyString(item.title) || !isScore(item.overall_score))) return null
  return {
    ...value,
    recommendations: value.recommendations,
    generated_at: typeof value.generated_at === 'string' ? value.generated_at : new Date().toISOString(),
    model: typeof value.model === 'string' ? value.model : 'deterministic-scoring',
  }
}

export function normalizeLearningRecommendations(value) {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) return null
  if (value.recommendations.some((item) => !isRecord(item) || !isNonEmptyString(item.skill) ||
      !isNonEmptyString(item.reason))) return null
  return { ...value, recommendations: value.recommendations }
}

export function normalizeJobMatches(value) {
  if (!isRecord(value) || !Array.isArray(value.matches)) return null
  if (value.matches.some((item) => !isRecord(item) || !isNonEmptyString(item.job_id) ||
      !isScore(item.match_score))) return null
  return { ...value, matches: value.matches }
}

export function normalizeSkillGaps(value) {
  if (!isRecord(value) || !Array.isArray(value.gaps) ||
      value.gaps.some((item) => !isRecord(item) || !isNonEmptyString(item.name))) return null
  return { ...value, gaps: value.gaps }
}

function normalizeDocument(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.original_filename) ||
      !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(value.mime_type)) return null
  return {
    id: value.id,
    original_filename: boundedString(value.original_filename, 180),
    mime_type: value.mime_type,
    file_size_bytes: Number.isFinite(Number(value.file_size_bytes)) ? Number(value.file_size_bytes) : 0,
    created_at: safeDate(value.created_at),
  }
}

export function normalizeCvHistory(value) {
  const documents = (Array.isArray(value?.documents) ? value.documents : []).map(normalizeDocument).filter(Boolean)
  const analyses = (Array.isArray(value?.analyses) ? value.analyses : [])
    .filter((item) => isRecord(item) && isNonEmptyString(item.id))
    .map((item) => {
      const score = Math.max(0, Math.min(100, Number(item.compatibility_score) || 0))
      const targetType = ['career', 'job', 'internship', 'career_goal'].includes(item.target_type) ? item.target_type : 'career'
      const savedResult = isRecord(item.analysis_result) ? item.analysis_result : {}
      const complete = normalizeCvAnalysis(savedResult)
      const normalized = complete || normalizeCvAnalysis(savedResult, true)
      const details = normalized || {
        ...buildDeterministicCvAnalysis({ score }),
        missingSkills: [],
      }
      return {
        ...item,
        target_type: targetType,
        target_id: boundedString(item.target_id, 160) || null,
        target_title: boundedString(item.target_title, 160) || 'Saved CV analysis',
        original_filename: boundedString(item.original_filename, 180),
        compatibility_score: score,
        created_at: safeDate(item.created_at),
        analysis_result: {
          ...details,
          documentId: boundedString(item.document_id, 160) || null,
          target: isRecord(savedResult.target) ? {
            type: ['career', 'job', 'internship', 'career_goal'].includes(savedResult.target.type) ? savedResult.target.type : targetType,
            id: boundedString(savedResult.target.id, 160) || boundedString(item.target_id, 160) || null,
            title: boundedString(savedResult.target.title, 160) || boundedString(item.target_title, 160) || 'Saved CV analysis',
          } : {
            type: boundedString(item.target_type, 40) || 'career',
            id: boundedString(item.target_id, 160) || null,
            title: boundedString(item.target_title, 160) || 'Saved CV analysis',
          },
          filename: boundedString(savedResult.filename, 180) || boundedString(item.original_filename, 180),
          score,
          scoreBreakdown: isRecord(savedResult.scoreBreakdown)
            ? savedResult.scoreBreakdown
            : (isRecord(item.score_breakdown) ? item.score_breakdown : {}),
          scoreBasis: isRecord(savedResult.scoreBasis)
            ? savedResult.scoreBasis
            : { scoreMethod: 'Only the stored compatibility score is available for this saved analysis.' },
          model: boundedString(savedResult.model, 80) || (normalized ? 'Gemini' : 'deterministic-fallback'),
          status: savedResult.status === 'fallback' || !complete ? 'fallback' : 'ok',
        },
      }
    })
  return { documents, analyses }
}
