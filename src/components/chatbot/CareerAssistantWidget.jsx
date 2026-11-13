import { Bot, LoaderCircle, SendHorizonal, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { aiService } from '../../services/aiService'
import { studentService } from '../../services/studentService'
import { Button } from '../ui/Button'
import { RequestError } from '../ui/RequestState'

const STORAGE_PREFIX = 'skillbridge-career-assistant'
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

const defaultSuggestions = [
  'Explain something I am curious about.',
  'Help me plan my week.',
  'What careers are suitable for me?',
  'What skills should I develop?',
  'What skills am I missing?',
  'Help me prepare for an interview.',
  'Help me apply for jobs.',
  'Find jobs suitable for my skills.',
]

function formatTimestamp(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getCachedMessages(userId) {
  try {
    const cached = JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}:${userId}`) || '{}')
    return Array.isArray(cached.messages)
      ? cached.messages.filter((message) => (
        message
        && ['assistant', 'user'].includes(message.role)
        && typeof message.text === 'string'
      )).map((message, index) => ({
        ...message,
        id: typeof message.id === 'string' ? message.id : `cached-${index}`,
        createdAt: typeof message.createdAt === 'string' && Number.isFinite(Date.parse(message.createdAt)) ? message.createdAt : null,
        actions: Array.isArray(message.actions) ? message.actions.filter((action) => (
          action && typeof action.label === 'string' && CHAT_ACTION_ROUTES.has(action.to)
        )) : [],
        sources: Array.isArray(message.sources) ? message.sources.filter((source) => (
          source && typeof source.url === 'string' && /^https:\/\/\S+$/i.test(source.url)
        )) : [],
      }))
      : []
  } catch {
    return []
  }
}

function summarizeContext(context = {}) {
  const profile = context.profile || {}
  const student = Array.isArray(profile.student_profiles) ? profile.student_profiles[0] : profile.student_profiles || {}
  const recommendations = Array.isArray(context.recommendations) ? context.recommendations : []
  const skills = Array.isArray(context.skills) ? context.skills : []
  const jobs = Array.isArray(context.jobs) ? context.jobs : []
  const applications = Array.isArray(context.applications) ? context.applications : []

  const recommendedCareer = recommendations[0]?.careers?.title || 'your target career'
  const missingSkills = [...new Set(recommendations.flatMap((item) => item?.missing_skills || []))].slice(0, 6)
  const currentSkills = skills.map((skill) => skill?.skills?.name || skill?.name || skill?.skill_name).filter(Boolean).slice(0, 8)
  const activeApplications = applications.filter((application) => !['withdrawn', 'rejected', 'accepted'].includes(String(application?.status || '').toLowerCase())).length

  return {
    name: profile?.full_name || 'Student',
    programme: student?.programme || student?.institution || 'your current studies',
    career: recommendedCareer,
    skills: currentSkills,
    missingSkills,
    jobs: jobs.slice(0, 3).map((job) => job?.title).filter(Boolean),
    activeApplications,
  }
}

function buildLocalReply(message, context) {
  const normalized = message.toLowerCase()
  const summary = summarizeContext(context)
  const recommendations = context.recommendations || []
  const jobs = context.jobs || []
  const applications = context.applications || []
  const topCareer = recommendations[0]?.careers?.title || summary.career
  const topSkills = recommendations[0]?.strong_skills || summary.skills || []
  const missingSkills = [...new Set(recommendations.flatMap((item) => item?.missing_skills || []))]

  if (normalized.includes('career') && (normalized.includes('suitable') || normalized.includes('choose') || normalized.includes('should'))) {
    const careerList = recommendations.slice(0, 3).map((item) => item?.careers?.title).filter(Boolean)
    const text = careerList.length
      ? `Based on your profile, ${summary.programme}, and recent assessment evidence, the best-fit options for you are ${careerList.join(', ')}. Your strongest signals are ${topSkills.slice(0, 3).join(', ') || 'your current work and project experience'}, so I would suggest starting with ${careerList[0]} and building the gaps most relevant to that path.`
      : `Based on the information available in your SkillBridge profile, your strongest fit is ${topCareer}. I recommend focusing on ${summary.skills.join(', ') || 'your current strengths'} and updating your profile if you want a more precise recommendation.`

    return {
      text: `${text} To keep improving, focus on the activities that strengthen your readiness and talk to your advisor or check the skills gap section for the next best step.`,
      actions: [
        { label: 'View recommended careers', to: '/student/career' },
        { label: 'View skills gap', to: '/student/skills/gaps' },
      ],
    }
  }

  if (normalized.includes('skill') && (normalized.includes('learn') || normalized.includes('develop') || normalized.includes('should') || normalized.includes('missing'))) {
    const learningSkills = missingSkills.length ? missingSkills : summary.missingSkills
    const content = learningSkills.length
      ? `Your current strengths are ${summary.skills.join(', ') || 'your existing knowledge'}, and the most relevant skills to build next are ${learningSkills.slice(0, 5).join(', ')}. I would prioritise these in order: ${learningSkills.slice(0, 3).join(', ')}. This will improve your readiness for ${topCareer}.`
      : `Your profile shows a solid foundation in ${summary.skills.join(', ') || 'your current skills'}, and I would focus on deeper project work, portfolio evidence, and a few practical assessments to make your readiness stronger for ${topCareer}.`

    return {
      text: content,
      actions: [
        { label: 'Open skills gap', to: '/student/skills/gaps' },
        { label: 'Explore learning', to: '/student/learning' },
      ],
    }
  }

  if (normalized.includes('interview')) {
    const role = topCareer
    const requirements = (jobs[0]?.job_skills || []).slice(0, 3).map((skill) => skill?.skills?.name || skill?.name || '').filter(Boolean)
    const keySkills = requirements.length ? requirements : topSkills.slice(0, 3)
    return {
      text: `For ${role}, I would prepare around ${keySkills.join(', ') || 'your core job skills'}, and structure your answers using the STAR format: Situation, Task, Action, Result. Review your projects, explain the problem you solved, and practise concise answers about your strengths, teamwork, and learning mindset.`,
      actions: [
        { label: 'Prepare for interviews', to: '/student/interview-prep' },
        { label: 'View jobs', to: '/student/jobs' },
      ],
    }
  }

  if (normalized.includes('job') || normalized.includes('apply')) {
    const matchingJobs = jobs.slice(0, 3)
    if (matchingJobs.length) {
      const titles = matchingJobs.map((job) => job.title).join(', ')
      return {
        text: `The most relevant jobs currently visible in SkillBridge for your profile are ${titles}. Match your strengths to the job requirements, tailor your CV, and focus on roles that align with ${topCareer}. Your recent applications are ${applications.length ? applications.slice(0, 2).map((app) => `${app?.jobs?.title || 'a role'} (${app?.status || 'pending'})`).join(', ') : 'not yet fully tracked.'}`,
        actions: [
          { label: 'Find matching jobs', to: '/student/jobs' },
          { label: 'Track applications', to: '/student/applications' },
        ],
      }
    }

    return {
      text: `I do not see a direct match yet, but your profile is closest to ${topCareer}. I recommend improving your portfolio and skills gap before applying widely. Keep your profile complete and review the jobs section for roles that match your latest skills and evidence.`,
      actions: [
        { label: 'Update profile', to: '/student/profile' },
        { label: 'Explore jobs', to: '/student/jobs' },
      ],
    }
  }

  if (normalized.includes('portfolio') || normalized.includes('cv') || normalized.includes('profile')) {
    return {
      text: `Your profile and portfolio are most valuable when they show evidence of the skills relevant to ${topCareer}. Strengthen your portfolio with recent projects, measurable results, and clear reflection on the tools you used. If your profile is incomplete, update education, skills, and project evidence so it matches your target role.`,
      actions: [
        { label: 'Update profile', to: '/student/profile' },
        { label: 'Open portfolio', to: '/student/portfolio' },
      ],
    }
  }

  return {
    text: `Here is the best next step based on your SkillBridge profile: focus on ${topCareer}, strengthen ${missingSkills.slice(0, 3).join(', ') || 'the current skill gaps'}, and keep building evidence through projects, assessments, and job applications. If you want, I can help you narrow this down to a specific target role or learning path.`,
    actions: [
      { label: 'View career roadmap', to: '/student/career' },
      { label: 'Explore learning', to: '/student/learning' },
    ],
  }
}

export function CareerAssistantWidget() {
  const { user, profile } = useAuth()
  const [context, setContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')
  const [historyFailure, setHistoryFailure] = useState(false)
  const [historyRetry, setHistoryRetry] = useState(0)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!user?.id) return

    let active = true

    const loadStudentContext = async () => {
      const [dashboardResult, recommendationsResult] = await Promise.allSettled([
      studentService.getDashboard(user.id, profile),
        aiService.getCareerRecommendations(user.id),
      ])
      if (!active) return

      const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null
      const recommendations = recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : null
      setContext({
        profile: dashboard?.profile || profile,
        skills: dashboard?.skills || [],
        recommendations: recommendations || dashboard?.recommendations || [],
        jobs: dashboard?.jobs || [],
        applications: dashboard?.applications || [],
        assessments: dashboard?.assessments || [],
        portfolio: dashboard?.portfolio || null,
      })
    }

    const loadChatHistory = async () => {
      setLoadingHistory(true)
      try {
        const savedConversations = await aiService.getCareerChatConversations(user.id)
        if (!active) return
        setConversations(savedConversations)

        if (savedConversations.length) {
          const latest = await aiService.getCareerChatConversation(user.id, savedConversations[0].id)
          if (!active) return
          setConversationId(latest.conversation.id)
          setMessages(latest.messages.map((message) => ({
            id: message.id,
            role: message.sender,
            createdAt: message.created_at,
            text: message.message,
            actions: message.metadata?.actions || [],
            sources: message.metadata?.sources || [],
          })))
          return
        }

        const intro = {
          id: `welcome-${user.id}`,
          role: 'assistant',
          createdAt: new Date().toISOString(),
          text: `Hi ${profile?.full_name?.split(' ')[0] || 'there'} — ask me about anything. I can answer general questions and use your SkillBridge profile when you want personalized career guidance.`,
        }
        setConversationId(null)
        setMessages([intro])
      } catch (historyError) {
        if (!active) return
        setError(historyError)
        setHistoryFailure(true)
        const cachedMessages = getCachedMessages(user.id)
        setMessages(cachedMessages.length ? cachedMessages : [{
          id: `welcome-${user.id}`,
          role: 'assistant',
          createdAt: new Date().toISOString(),
          text: `Hi ${profile?.full_name?.split(' ')[0] || 'there'} — ask me about anything. I can answer general questions and use your SkillBridge profile when you want personalized career guidance.`,
        }])
      } finally {
        if (active) setLoadingHistory(false)
      }
    }

    loadStudentContext()
    loadChatHistory()

    return () => { active = false }
  }, [historyRetry, profile, user])

  useEffect(() => {
    if (!user?.id || !messages.length) return
    window.localStorage.setItem(`${STORAGE_PREFIX}:${user.id}`, JSON.stringify({ messages }))
  }, [messages, user])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const helperText = useMemo(() => {
    if (!context) return 'Loading your profile...'
    return `Working with ${summaryLabel(context)}`
  }, [context])

  const handleSend = async () => {
    if (!input.trim() || sending || loadingHistory) return

    const nextMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      createdAt: new Date().toISOString(),
      text: input.trim(),
    }

    setMessages((current) => [...current, nextMessage])
    const question = input.trim()
    setInput('')
    setSending(true)
    setError('')
    setHistoryFailure(false)

    try {
      const reply = await askCareerAssistant(question, context, user?.id, conversationId)
      if (reply.conversationId) setConversationId(reply.conversationId)
      if (reply.conversations) setConversations(reply.conversations)
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        text: reply.text,
        actions: reply.actions,
        sources: reply.sources,
      }])
    } catch (requestError) {
      const webSearchQuestion = /\b(job|jobs|internship|internships|intern|vacanc(?:y|ies)|opening|openings|hiring|job posting|employment|apprenticeship|placement|placements|graduate scheme|graduate program|recruiting)\b/i.test(question)
      const careerQuestion = /\b(career|skill|interview|portfolio|cv|profile|application)\b/i.test(question)
      const fallback = careerQuestion && !webSearchQuestion ? buildLocalReply(question, context) : null
      if (fallback) {
        setMessages((current) => [...current, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          createdAt: new Date().toISOString(),
          text: fallback.text,
          actions: fallback.actions,
        }])
        setError(requestError || new Error('AI is temporarily unavailable.'))
        setHistoryFailure(false)
        return
      }

      const failureMessage = webSearchQuestion
        ? 'Live web search is temporarily unavailable. Please try again later.'
        : "I'm temporarily unable to get an answer right now. Please try again shortly."
      setError(requestError || Object.assign(new Error(failureMessage), { code: 'AI_UNAVAILABLE' }))
      setHistoryFailure(false)
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        text: failureMessage,
      }])
    } finally {
      setSending(false)
    }
  }

  const startNewConversation = () => {
    setConversationId(null)
    setError('')
    setHistoryFailure(false)
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        text: 'New conversation started. Ask me anything, or ask for personalized career guidance using your SkillBridge profile.',
      },
    ])
  }

  const selectConversation = async (selectedId) => {
    if (!selectedId) {
      startNewConversation()
      return
    }
    if (!user?.id || selectedId === conversationId) return

    setLoadingHistory(true)
    setError('')
    setHistoryFailure(false)
    try {
      const result = await aiService.getCareerChatConversation(user.id, selectedId)
      setConversationId(result.conversation.id)
      setMessages(result.messages.map((message) => ({
        id: message.id,
        role: message.sender,
        createdAt: message.created_at,
        text: message.message,
        actions: message.metadata?.actions || [],
        sources: message.metadata?.sources || [],
      })))
    } catch (loadError) {
      setError(loadError)
      setHistoryFailure(true)
    } finally {
      setLoadingHistory(false)
    }
  }

  const removeConversation = async () => {
    if (!user?.id || !conversationId || sending || loadingHistory) return
    if (!window.confirm('Delete this chat and all its messages? This cannot be undone.')) return

    setLoadingHistory(true)
    setError('')
    setHistoryFailure(false)
    try {
      await aiService.deleteCareerChatConversation(user.id, conversationId)
      const remaining = conversations.filter((conversation) => conversation.id !== conversationId)
      setConversations(remaining)
      if (remaining.length) {
        const latest = await aiService.getCareerChatConversation(user.id, remaining[0].id)
        setConversationId(latest.conversation.id)
        setMessages(latest.messages.map((message) => ({
          id: message.id,
          role: message.sender,
          createdAt: message.created_at,
          text: message.message,
          actions: message.metadata?.actions || [],
          sources: message.metadata?.sources || [],
        })))
      } else {
        startNewConversation()
      }
    } catch (deleteError) {
      setError(deleteError)
      setHistoryFailure(false)
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="flex h-[70dvh] min-h-[360px] max-h-[760px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:h-[70vh] sm:min-h-[440px]">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-800">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">SkillBridge Assistant</p>
            <p className="text-xs text-slate-500">General answers and personalized career guidance</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor="career-chat-history">Chat history</label>
          <select
            id="career-chat-history"
            value={conversationId || ''}
            onChange={(event) => selectConversation(event.target.value)}
            disabled={loadingHistory || sending}
            className="min-w-0 max-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 sm:flex-none sm:max-w-56"
          >
            <option value="">New chat</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title || 'Saved chat'}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" size="sm" onClick={startNewConversation} disabled={sending || loadingHistory} className="shrink-0 whitespace-nowrap text-slate-600 hover:bg-slate-200">
            New chat
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={removeConversation} disabled={!conversationId || sending || loadingHistory} aria-label="Delete current chat" title="Delete current chat" className="px-2 text-rose-700 hover:bg-rose-50">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-slate-200 bg-sky-50/70 px-3 py-3 sm:px-4">
        <div role="group" aria-label="Suggested prompts" className="flex w-max flex-nowrap gap-2 sm:w-auto sm:flex-wrap">
          {defaultSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              className="whitespace-nowrap rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-3 py-4 sm:px-4" ref={scrollRef}>
        <div className="space-y-3">
          {loadingHistory ? <p className="text-center text-xs text-slate-500">Loading saved conversation…</p> : null}
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === 'user' ? 'bg-sky-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                <p className="break-words whitespace-pre-line">{message.text}</p>
                {message.actions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <Link key={action.label} to={action.to} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {message.sources?.length ? (
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <p className="mb-1 text-xs font-semibold text-slate-600">Web sources</p>
                    <ul className="space-y-1">
                      {message.sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-xs text-sky-700 underline hover:text-sky-900"
                          >
                            {source.title || source.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {message.createdAt ? <p className={`mt-2 text-[10px] ${message.role === 'user' ? 'text-sky-100' : 'text-slate-400'}`}>{formatTimestamp(message.createdAt)}</p> : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">
                <LoaderCircle className="h-4 w-4 animate-spin text-sky-700" />
                Thinking...
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-t border-rose-200 bg-rose-50 px-3 py-2 sm:px-4">
          <RequestError
            error={error}
            fallback="We could not complete that request."
            onRetry={historyFailure ? () => setHistoryRetry((count) => count + 1) : undefined}
            retryLabel="Reload chat history"
          />
        </div>
      ) : null}

      <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="career-assistant-input">Ask SkillBridge Assistant</label>
          <textarea
            id="career-assistant-input"
            rows={1}
            enterKeyHint="send"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask me anything..."
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white"
          />
          <Button type="button" size="md" onClick={handleSend} disabled={!input.trim() || sending || loadingHistory} className="h-[44px] rounded-2xl px-3">
            <SendHorizonal size={16} />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{helperText}</p>
      </div>
    </div>
  )
}

async function askCareerAssistant(message, context, studentId, conversationId) {
  const payload = {
    studentId: studentId || context?.profile?.id,
    context: {
      profile: context?.profile,
      skills: context?.skills || [],
      recommendations: context?.recommendations || [],
      jobs: context?.jobs || [],
      applications: context?.applications || [],
    }
  }

  const response = await aiService.askCareerAssistant(payload.studentId, message, payload.context, conversationId)
  if (response?.message || response?.answer || response?.text) {
    return {
      text: response.message || response.answer || response.text,
      actions: response.actions || [],
      sources: response.sources || [],
      conversationId: response.conversationId,
      conversations: response.conversations,
    }
  }

  throw new Error('The AI assistant returned an empty response.')
}

function summaryLabel(context = {}) {
  const summary = summarizeContext(context)
  return `${summary.career} • ${summary.skills.length ? summary.skills.slice(0, 2).join(', ') : 'your current profile'}`
}

export default CareerAssistantWidget
