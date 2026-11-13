import { useState } from 'react'
import { Button } from '../ui/Button'
import { RequestError } from '../ui/RequestState'
import { interviewService } from '../../services/interviewService'
import { INTERVIEW_REPORT_CATEGORIES, normalizeInterviewReport } from '../../utils/interviewPolicy'

export function InterviewPolicyReport({ interviewId, existingReport, onReportSaved }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(INTERVIEW_REPORT_CATEGORIES[0].value)
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const report = normalizeInterviewReport(existingReport)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const savedReport = await interviewService.submitPolicyReport(interviewId, category, details)
      onReportSaved?.(savedReport)
      setOpen(false)
      setDetails('')
    } catch (submitError) {
      setError(submitError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      {report ? (
        <p role="status" className="text-xs text-slate-600">
          You reported these instructions · {report.status.replaceAll('_', ' ')}
        </p>
      ) : null}
      {!open ? (
        <Button type="button" variant="ghost" size="sm" className="px-0 text-rose-700 hover:bg-transparent hover:underline" onClick={() => setOpen(true)}>
          {report ? 'Update report' : 'Report instructions'}
        </Button>
      ) : (
        <form className="mt-2 space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            What is your concern?
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={category} onChange={(event) => setCategory(event.target.value)}>
              {INTERVIEW_REPORT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Details (optional)
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              maxLength={2000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Share only what is needed to identify the instruction. Do not include passwords or other sensitive information."
            />
          </label>
          {error ? <RequestError error={error} fallback="Your report could not be submitted." /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Submitting…' : 'Submit report'}</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setOpen(false); setError(null) }}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  )
}
