import { useEffect, useId, useRef, useState } from 'react'

const INPUT = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:bg-white'

export function CareerGoalSummary({
  targetRole,
  careerGoal,
  className = '',
  onCareerGoalChange,
  inputClass = INPUT,
}) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const paragraphRef = useRef(null)
  const textId = useId()
  const role = typeof targetRole === 'string' ? targetRole.trim() : ''
  const goal = typeof careerGoal === 'string' ? careerGoal : ''
  const hasGoal = Boolean(goal.trim())
  const editable = typeof onCareerGoalChange === 'function'
  const expandable = editable ? goal.length > 160 : canExpand || goal.length > 120
  const showEditor = editable && (!expandable || expanded)
  const showSummary = hasGoal && (!editable || (expandable && !expanded))

  useEffect(() => {
    if (expanded || editable || !hasGoal) return undefined
    const element = paragraphRef.current
    if (!element) return undefined

    let frame = 0
    const measureOverflow = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const hasOverflow = element.scrollHeight > element.clientHeight + 1
        setCanExpand((current) => current === hasOverflow ? current : hasOverflow)
      })
    }

    measureOverflow()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureOverflow)
    observer?.observe(element)
    window.addEventListener('resize', measureOverflow)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', measureOverflow)
    }
  }, [careerGoal, editable, expanded, hasGoal])

  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Career focus</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-slate-900">{role || 'Target occupation not set'}</h3>
      <p className="mt-3 text-sm font-medium text-slate-700">Career goal description</p>
      {showSummary ? (
        <p
          id={textId}
          ref={paragraphRef}
          className={`mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600 ${expanded ? '' : 'line-clamp-2'}`}
        >
          {goal}
        </p>
      ) : null}
      {!hasGoal && !editable ? <p className="mt-1 text-sm leading-6 text-slate-500">No career-goal description saved.</p> : null}
      {showEditor ? (
        <textarea
          id={textId}
          maxLength={500}
          className={`${inputClass} mt-1 min-h-24`}
          value={goal}
          onChange={(event) => onCareerGoalChange(event.target.value)}
          aria-label="Career goal description"
        />
      ) : null}
      {editable ? <p className="mt-1 text-xs text-slate-500">Describe your broader ambitions; this supports guidance but is not used as a role search term. {goal.length}/500</p> : null}
      {expandable ? (
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      ) : null}
    </section>
  )
}
