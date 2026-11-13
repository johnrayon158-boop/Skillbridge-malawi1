import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../contexts/AuthContext'
import { EVALUATION_WORKFLOWS, evaluationService } from '../services/evaluationService'

const QUESTIONS = [
  ['ease_of_use', 'The platform was easy to use.'],
  ['navigation_clarity', 'I could find the features and information I needed.'],
  ['task_completion', 'I could complete the career-development tasks I tried.'],
  ['trust_in_recommendations', 'The recommendations were understandable and relevant to my needs.'],
  ['overall_satisfaction', 'Overall, I am satisfied with SkillBridge Malawi.'],
]

const EMPTY_ANSWERS = Object.fromEntries(QUESTIONS.map(([field]) => [field, 0]))

export default function EvaluationPage() {
  const { user, profile } = useAuth()
  const [answers, setAnswers] = useState(EMPTY_ANSWERS)
  const [feedback, setFeedback] = useState('')
  const [workflow, setWorkflow] = useState('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setNotice('')
    evaluationService.getMyEvaluation(user.id, workflow)
      .then((response) => {
        if (!active) return
        setAnswers(response
          ? Object.fromEntries(QUESTIONS.map(([field]) => [field, response[field] || 0]))
          : EMPTY_ANSWERS)
        setFeedback(response?.feedback || '')
        setSavedAt(response?.submitted_at || '')
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load your evaluation.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.id, workflow])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await evaluationService.saveEvaluation(user.id, answers, feedback, workflow)
      setSavedAt(response.submitted_at || new Date().toISOString())
      setNotice('Thank you. Your evaluation response has been saved and can be updated later.')
    } catch (submitError) {
      setError(submitError.message || 'Unable to save your evaluation.')
    } finally {
      setSaving(false)
    }
  }

  return <AppShell title="Platform evaluation" subtitle="Share structured feedback about your SkillBridge experience.">
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-5 sm:p-7">
        <div><h1 className="text-2xl font-bold text-slate-900">Evaluate your experience</h1><p className="mt-2 text-sm leading-6 text-slate-600">Please complete this after trying the relevant features. Use 1 for strongly disagree / very poor and 5 for strongly agree / very good. Responses are summarized by workflow; administrators do not see your written comments in the report.</p></div>
        {loading ? <p role="status" className="mt-6 text-sm text-slate-600">Loading your response…</p> : <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">Page or workflow
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
              {EVALUATION_WORKFLOWS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {QUESTIONS.map(([field, prompt]) => <fieldset key={field} className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-800">{prompt}</legend>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((rating) => <label key={rating} className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2 text-sm ${answers[field] === rating ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 text-slate-600'}`}>
                <input className="sr-only" type="radio" name={field} value={rating} required checked={answers[field] === rating} onChange={() => setAnswers((current) => ({ ...current, [field]: rating }))} />
                <span className="font-semibold">{rating}</span><span className="text-[10px]">{rating === 1 ? 'Low' : rating === 5 ? 'High' : ''}</span>
              </label>)}
            </div>
          </fieldset>)}
          <label className="block text-sm font-medium text-slate-700">Optional comments<textarea maxLength={1000} rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="What worked well? What should be improved?" /></label>
          {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
          {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving || loading}>{saving ? 'Saving…' : savedAt ? 'Update evaluation' : 'Submit evaluation'}</Button>{savedAt ? <span className="text-xs text-slate-500">Last submitted {new Date(savedAt).toLocaleString()}</span> : null}</div>
          <p className="text-xs text-slate-500">Signed in as {profile?.role || 'user'}. One response per account and workflow is stored for this questionnaire version; you may update it.</p>
        </form>}
      </Card>
    </div>
  </AppShell>
}
