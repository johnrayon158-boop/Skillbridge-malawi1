import { useEffect, useState } from 'react'
import { Button } from './Button'
import { classifyRequestError, createDebugReference, getSafeErrorMetadata } from '../../utils/requestError'

export function RequestError({
  error,
  fallback,
  kind,
  onRetry,
  retryLabel = 'Try again',
  stale = false,
}) {
  const [referenceId] = useState(createDebugReference)
  const presentation = classifyRequestError(error, { fallback, kind })

  useEffect(() => {
    if (!error) return
    console.error('[SkillBridge request]', getSafeErrorMetadata(error, presentation.category, referenceId))
  }, [error, presentation.category, referenceId])

  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="font-semibold">{presentation.title}</p>
      <p className="mt-1">{presentation.message}</p>
      {stale ? <p className="mt-1">The last successfully loaded information is still shown.</p> : null}
      <p className="mt-2 text-xs text-rose-700">Debug reference: {referenceId}</p>
      {onRetry ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  )
}

export function LastUpdated({ value, label = 'Last refreshed' }) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null

  return <p className="text-xs text-slate-500">{label}: <time dateTime={date.toISOString()}>{date.toLocaleString()}</time></p>
}
