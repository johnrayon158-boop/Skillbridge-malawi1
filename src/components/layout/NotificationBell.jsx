import { useEffect, useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { notificationService } from '../../services/notificationService'

function safeNotificationUrl(notification) {
  const actionUrl = notification.action_url
  if (typeof actionUrl === 'string' && actionUrl.startsWith('/') && !actionUrl.startsWith('//')) return actionUrl
  if (notification.application_id) return `/student/applications/${notification.application_id}`
  if (notification.opportunity_id) return notification.notification_type === 'internship_match'
    ? `/student/internships/${notification.opportunity_id}`
    : `/student/jobs/${notification.opportunity_id}`
  return '/student/notifications'
}

export function NotificationBell({ user, role }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const route = role === 'employer' ? '/employer/notifications' : role === 'admin' ? '/admin/notifications' : '/student/notifications'

  useEffect(() => {
    if (!user?.id) return undefined
    let active = true
    const refresh = async () => {
      try {
        const [page, count] = await Promise.all([
          notificationService.listPage(user.id, { limit: 6 }),
          notificationService.getUnreadCount(user.id),
        ])
        if (!active) return
        setItems(page.items)
        setUnreadCount(count)
        setError('')
      } catch {
        if (active) setError('Notifications are temporarily unavailable.')
      }
    }
    void refresh()
    const subscription = notificationService.subscribe(user.id, () => { void refresh() })
    const intervalId = window.setInterval(() => { void refresh() }, 60_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
      void subscription.unsubscribe()
    }
  }, [user?.id])

  const markRead = async (notification) => {
    try {
      await notificationService.markRead(notification.id, user.id)
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
      setUnreadCount((current) => Math.max(0, current - (notification.is_read ? 0 : 1)))
    } catch {
      setError('Unable to update this notification.')
    }
  }

  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        <Bell size={18} />
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {open ? <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-label="Recent notifications">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
        </div>
        {error ? <p role="alert" className="p-4 text-sm text-rose-700">{error}</p> : items.length ? <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {items.map((item) => <li key={item.id} className={`p-3 ${item.is_read ? '' : 'bg-sky-50/70'}`}>
            <div className="flex items-start gap-2">
              <Link to={safeNotificationUrl(item)} onClick={() => { setOpen(false); if (!item.is_read) void markRead(item) }} className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="mt-1 line-clamp-2 block text-xs text-slate-600">{item.message}</span>
                <time className="mt-1 block text-[11px] text-slate-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              </Link>
              {!item.is_read ? <button type="button" aria-label={`Mark ${item.title} as read`} onClick={() => void markRead(item)} className="rounded p-1 text-sky-700 hover:bg-sky-100"><Check size={16} /></button> : null}
            </div>
          </li>)}
        </ul> : <p className="p-5 text-sm text-slate-500">You’re all caught up. New relevant alerts will appear here.</p>}
        <Link to={route} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-sky-800 hover:bg-slate-50">View all notifications</Link>
      </div> : null}
    </div>
  )
}
