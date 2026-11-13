import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, ExternalLink, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../contexts/AuthContext'
import { employerService } from '../services/employerService'
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES, notificationService } from '../services/notificationService'

const PAGE_SIZE = 20
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm'

function safeNotificationUrl(notification, role) {
  const actionUrl = notification.action_url
  if (typeof actionUrl === 'string' && actionUrl.startsWith('/') && !actionUrl.startsWith('//')) return { href: actionUrl, external: false }
  if (typeof actionUrl === 'string') {
    try {
      const parsed = new URL(actionUrl)
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return { href: parsed.href, external: true }
    } catch {
      return null
    }
  }
  const entityType = notification.related_entity_type
  const entityId = notification.related_entity_id
  if (!entityId) return null
  if (entityType === 'application') return { href: role === 'employer' ? `/employer/applications/${entityId}` : `/student/applications/${entityId}`, external: false }
  if (entityType === 'job' || entityType === 'opportunity') return { href: notification.notification_type === 'internship_match'
    ? `/student/internships/${entityId}`
    : `/student/jobs/${entityId}`, external: false }
  if (entityType === 'interview' && role === 'student') return { href: '/student/applications', external: false }
  if (entityType === 'offer' && role === 'student') return { href: '/student/applications', external: false }
  return null
}

function NotificationPreferences({ userId }) {
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES)
  const [retry, setRetry] = useState(0)
  const requestKey = `${userId}:${retry}`
  const [loadedKey, setLoadedKey] = useState('')
  const loading = loadedKey !== requestKey
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    notificationService.getPreferences(userId)
      .then((result) => {
        if (!active) return
        setPreferences(result)
        setError('')
        setLoadedKey(requestKey)
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError.message || 'Unable to load notification preferences.')
        setLoadedKey(requestKey)
      })
    return () => { active = false }
  }, [requestKey, userId])

  const toggleCategory = (category) => {
    setPreferences((current) => ({
      ...current,
      enabled_categories: current.enabled_categories.includes(category)
        ? current.enabled_categories.filter((item) => item !== category)
        : [...current.enabled_categories, category],
    }))
  }

  const save = async (event) => {
    event.preventDefault()
    if (error) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await notificationService.savePreferences(userId, preferences)
      setPreferences(saved)
      try {
        await notificationService.generateOpportunityNotifications()
        setMessage('Your notification preferences have been saved.')
      } catch (refreshError) {
        setError(`Your preferences were saved, but opportunity notifications could not be refreshed: ${refreshError.message || 'Please try again.'}`)
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save your preferences.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card className="p-5 text-sm text-slate-600" aria-label="Loading notification preferences">Loading notification preferences…</Card>
  if (error) return <Card className="p-5 sm:p-6"><p role="alert" className="text-sm text-rose-800">{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setRetry((count) => count + 1)}>Try again</Button></Card>

  return <Card className="p-5 sm:p-6">
    <form onSubmit={save} className="space-y-5">
      <div><h2 className="text-lg font-semibold text-slate-900">Notification preferences</h2><p className="mt-1 text-sm text-slate-600">Choose which in-app alerts you want to receive. Preferences are saved to your account.</p></div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-800">Categories</legend>
        {NOTIFICATION_CATEGORIES.map(([type, label]) => <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={preferences.enabled_categories.includes(type)} onChange={() => toggleCategory(type)} />
          {label}
        </label>)}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Preferred industries, comma separated
          <input className={`${inputClass} mt-1`} value={(preferences.preferred_industries || []).join(', ')} onChange={(event) => setPreferences({ ...preferences, preferred_industries: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Agriculture, health, finance" />
        </label>
        <label className="text-sm font-medium text-slate-700">Preferred locations, comma separated
          <input className={`${inputClass} mt-1`} value={(preferences.preferred_locations || []).join(', ')} onChange={(event) => setPreferences({ ...preferences, preferred_locations: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Lilongwe, Blantyre, Malawi-wide" />
        </label>
        <label className="text-sm font-medium text-slate-700">Opportunity types, comma separated
          <input className={`${inputClass} mt-1`} value={(preferences.preferred_opportunity_types || []).join(', ')} onChange={(event) => setPreferences({ ...preferences, preferred_opportunity_types: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Full-time, internship, training" />
        </label>
        <label className="text-sm font-medium text-slate-700">Minimum relevance score: {preferences.minimum_relevance_score}%
          <input className="mt-2 w-full accent-sky-700" type="range" min="0" max="100" step="5" value={preferences.minimum_relevance_score} onChange={(event) => setPreferences({ ...preferences, minimum_relevance_score: Number(event.target.value) })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={preferences.remote_work} onChange={(event) => setPreferences({ ...preferences, remote_work: event.target.checked })} />Include remote opportunities</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={preferences.deadline_reminders} onChange={(event) => setPreferences({ ...preferences, deadline_reminders: event.target.checked })} />Deadline reminders</label>
      </div>
      <p className="text-xs text-slate-500">Email and digest delivery are not enabled in this deployment; notifications are in-app only.</p>
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</Button>
    </form>
  </Card>
}

export default function NotificationsPage() {
  const { user, profile } = useAuth()
  const [items, setItems] = useState([])
  const [reminders, setReminders] = useState([])
  const [applicationAlerts, setApplicationAlerts] = useState([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [readFilter, setReadFilter] = useState('all')
  const [category, setCategory] = useState('')
  const [tab, setTab] = useState('notifications')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [busyId, setBusyId] = useState('')
  const isEmployer = profile?.role === 'employer'
  const isStudent = profile?.role === 'student'
  const opportunitySyncRef = useRef('')

  const load = useCallback(async (nextOffset = 0, append = false) => {
    setLoading(true)
    setError('')
    const errors = []
    if (isStudent && opportunitySyncRef.current !== user.id) {
      try {
        await notificationService.generateOpportunityNotifications()
        opportunitySyncRef.current = user.id
      } catch (syncError) {
        errors.push(syncError.message || 'Unable to refresh opportunity notifications.')
      }
    }
    const requests = [
      notificationService.listPage(user.id, {
          limit: PAGE_SIZE,
          offset: nextOffset,
          unread: readFilter === 'unread',
          readOnly: readFilter === 'read',
          category,
        }),
      notificationService.getUnreadCount(user.id),
    ]
    if (isEmployer) requests.push(
      notificationService.listReminders(user.id),
      employerService.getApplicationAlerts(user.id),
    )
    const results = await Promise.allSettled(requests)
    const [pageResult, countResult, remindersResult, applicationsResult] = results
    if (pageResult.status === 'fulfilled') {
      const result = pageResult.value
      setItems((current) => append ? [...current, ...result.items] : result.items)
      setOffset(nextOffset + result.items.length)
      setTotal(result.total)
    } else {
      errors.push(pageResult.reason?.message || 'Unable to load notifications.')
    }
    if (countResult.status === 'fulfilled') setUnreadCount(countResult.value)
    else errors.push(countResult.reason?.message || 'Unable to load unread notification count.')
    if (isEmployer) {
      if (remindersResult.status === 'fulfilled') setReminders(remindersResult.value)
      else errors.push(remindersResult.reason?.message || 'Unable to load application follow-ups.')
      if (applicationsResult.status === 'fulfilled') setApplicationAlerts(applicationsResult.value)
      else errors.push(applicationsResult.reason?.message || 'Unable to load new application alerts.')
    }
    setError(errors.join(' '))
    setLoading(false)
  }, [user.id, readFilter, category, isEmployer, isStudent])
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => { void Promise.resolve().then(() => load(0)) }, [load, retry])
  useEffect(() => {
    const subscription = notificationService.subscribe(user.id, () => { void loadRef.current(0) })
    return () => { void subscription.unsubscribe() }
  }, [user.id])

  const markRead = async (item) => {
    setBusyId(item.id)
    try {
      await notificationService.markRead(item.id, user.id)
      if (readFilter === 'unread') {
        setItems((current) => current.filter((notification) => notification.id !== item.id))
        setTotal((current) => Math.max(0, current - 1))
      } else {
        setItems((current) => current.map((notification) => notification.id === item.id ? { ...notification, is_read: true } : notification))
      }
      if (!item.is_read) setUnreadCount((current) => Math.max(0, current - 1))
    } catch (updateError) {
      setError(updateError.message || 'Unable to update this notification.')
    } finally {
      setBusyId('')
    }
  }

  const markAllRead = async () => {
    setBusyId('all')
    try {
      await notificationService.markAllRead(user.id)
      setUnreadCount(0)
      if (readFilter === 'unread') {
        setItems([])
        setTotal(0)
      } else {
        setItems((current) => current.map((item) => ({ ...item, is_read: true })))
      }
    } catch (updateError) {
      setError(updateError.message || 'Unable to mark notifications as read.')
    } finally {
      setBusyId('')
    }
  }

  const dismiss = async (item) => {
    setBusyId(item.id)
    try {
      await notificationService.dismiss(item.id, user.id)
      setItems((current) => current.filter((notification) => notification.id !== item.id))
      setTotal((current) => Math.max(0, current - 1))
      if (!item.is_read) setUnreadCount((current) => Math.max(0, current - 1))
    } catch (updateError) {
      setError(updateError.message || 'Unable to dismiss this notification.')
    } finally {
      setBusyId('')
    }
  }

  const completeReminder = async (reminder) => {
    setBusyId(reminder.id)
    try {
      await notificationService.completeReminder(reminder.id, user.id)
      setReminders((current) => current.map((item) => item.id === reminder.id ? { ...item, completed: true } : item))
    } catch (updateError) {
      setError(updateError.message || 'Unable to complete this hiring reminder.')
    } finally {
      setBusyId('')
    }
  }

  const pendingApplicationReminders = reminders.filter((item) => item.reminder_type === 'application_follow_up' && !item.completed)
  const title = isEmployer ? 'Employer notifications' : profile?.role === 'admin' ? 'System notifications' : 'Notifications'
  const subtitle = isEmployer
    ? 'Stay up to date on new applications and important hiring activity.'
    : 'Relevant opportunity alerts, reminders, and updates based on your SkillBridge activity.'
  return <AppShell title={title} subtitle={subtitle}>
    <div className="mx-auto max-w-5xl space-y-5">
      {!isEmployer ? <div className="flex flex-wrap gap-2" role="tablist" aria-label="Notification settings">
        <button type="button" role="tab" aria-selected={tab === 'notifications'} onClick={() => setTab('notifications')} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === 'notifications' ? 'bg-sky-800 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><Bell size={15} className="mr-1 inline" />Notifications</button>
        <button type="button" role="tab" aria-selected={tab === 'preferences'} onClick={() => setTab('preferences')} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === 'preferences' ? 'bg-sky-800 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><Settings2 size={15} className="mr-1 inline" />Preferences</button>
      </div> : null}
      {!isEmployer && tab === 'preferences' ? <NotificationPreferences userId={user.id} /> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[['Notifications in this view', total], ['Unread notifications', unreadCount], ['Current view', readFilter === 'unread' ? 'Unread' : readFilter === 'read' ? 'Read' : 'All']].map(([label, value]) => <Card key={label} className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold capitalize text-slate-900">{loading ? '—' : value}</p></Card>)}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
          <label className="flex-1 text-sm font-medium text-slate-700">Category
            <select className={`${inputClass} mt-1`} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{NOTIFICATION_CATEGORIES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select>
          </label>
          <label className="flex-1 text-sm font-medium text-slate-700">Status
            <select className={`${inputClass} mt-1`} value={readFilter} onChange={(event) => setReadFilter(event.target.value)}><option value="all">All notifications</option><option value="unread">Unread</option><option value="read">Read</option></select>
          </label>
          <Button className="self-end" variant="outline" disabled={loading} aria-label="Refresh notifications" onClick={() => void load(0)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh</Button>
          <Button className="self-end" variant="outline" disabled={busyId === 'all' || loading || unreadCount === 0} onClick={() => void markAllRead()}><CheckCheck size={15} /> Mark all read</Button>
        </div>
        {isEmployer ? <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900">New applications</h2><p className="mt-1 text-sm text-slate-600">Applications awaiting initial review.</p></div>
            <Badge tone={applicationAlerts.length ? 'blue' : 'slate'}>{applicationAlerts.length} to review</Badge>
          </div>
          {applicationAlerts.length ? <ul className="divide-y divide-slate-100">
            {applicationAlerts.map((application) => <li key={application.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{application.student_profiles?.profiles?.full_name || 'Candidate'} applied for {application.jobs?.title || 'your job'}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{String(application.status || 'applied').replaceAll('_', ' ')} · {application.applied_at ? new Date(application.applied_at).toLocaleString() : 'Date not recorded'}</p>
              </div>
              <Link to={`/employer/applications/${application.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-slate-50"><ExternalLink size={14} />Review</Link>
            </li>)}
          </ul> : <p className="text-sm text-slate-500">{loading ? 'Loading new applications…' : 'No new applications are waiting for review.'}</p>}
        </Card> : null}
        {isEmployer ? <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900">Application follow-ups</h2><p className="mt-1 text-sm text-slate-600">Reminders created when candidates submit applications to your jobs.</p></div>
            <Badge tone={pendingApplicationReminders.length ? 'amber' : 'slate'}>{pendingApplicationReminders.length} pending</Badge>
          </div>
          {pendingApplicationReminders.length ? <ul className="divide-y divide-slate-100">
            {pendingApplicationReminders.map((reminder) => <li key={reminder.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{reminder.title}</p>
                {reminder.description ? <p className="mt-1 text-sm text-slate-600">{reminder.description}</p> : null}
                <time className="mt-1 block text-xs text-slate-500" dateTime={reminder.reminder_date}>Due {new Date(reminder.reminder_date).toLocaleString()}</time>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to="/employer/applications" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-slate-50"><ExternalLink size={14} />Review applications</Link>
                <Button size="sm" variant="outline" disabled={busyId === reminder.id} aria-label={`Complete ${reminder.title}`} onClick={() => void completeReminder(reminder)}><Check size={15} />Done</Button>
              </div>
            </li>)}
          </ul> : <p className="text-sm text-slate-500">No pending application follow-ups.</p>}
        </Card> : null}
        {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<Button className="ml-3" size="sm" variant="outline" onClick={() => setRetry((current) => current + 1)}>Try again</Button></div> : null}
        {error ? null : loading ? <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-label="Loading notifications" /> : (() => {
          const visible = items
          if (!visible.length) return <Card className="p-8 text-center"><Bell className="mx-auto text-slate-400" size={28} /><p className="mt-3 font-medium text-slate-800">{isEmployer ? 'No hiring notifications here yet.' : 'No notifications here yet.'}</p><p className="mt-1 text-sm text-slate-600">{isEmployer ? 'New application alerts and important hiring updates will appear here.' : 'Relevant alerts and application updates will appear when there is something new.'}</p></Card>
          return <div className="space-y-3">{visible.map((item) => {
            const action = safeNotificationUrl(item, profile?.role)
            return <Card key={item.id} className={`p-4 sm:p-5 ${item.is_read ? '' : 'border-l-4 border-l-sky-600'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{item.title}</h2>{isEmployer ? <Badge tone="slate">{String(item.notification_type || 'update').replaceAll('_', ' ')}</Badge> : null}{!item.is_read ? <Badge tone="blue">Unread</Badge> : null}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
                  {Array.isArray(item.relevance_reasons) && item.relevance_reasons.length ? <p className="mt-2 text-xs text-slate-500">Why this alert: {item.relevance_reasons.join('; ')}</p> : null}
                  {item.relevance_score != null ? <p className="mt-2 text-xs text-slate-500">Relevance {item.relevance_score}% · indicative only</p> : null}
                  <time className="mt-2 block text-xs text-slate-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {action?.external ? <a href={action.href} target="_blank" rel="noreferrer" onClick={() => { if (!item.is_read) void markRead(item) }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-slate-50"><ExternalLink size={14} />Open</a> : action ? <Link to={action.href} onClick={() => { if (!item.is_read) void markRead(item) }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-slate-50"><ExternalLink size={14} />Open</Link> : null}
                  {!item.is_read ? <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void markRead(item)}>Mark read</Button> : null}
                  <Button size="sm" variant="ghost" aria-label={`Dismiss ${item.title}`} disabled={busyId === item.id} onClick={() => void dismiss(item)}><Trash2 size={15} /></Button>
                </div>
              </div>
            </Card>
          })}</div>
        })()}
        {!loading && offset < total ? <div className="text-center"><Button variant="outline" onClick={() => void load(offset, true)}>Load more notifications</Button></div> : null}
      </>}
    </div>
  </AppShell>
}
