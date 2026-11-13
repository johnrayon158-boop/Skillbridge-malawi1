export const NOTIFICATION_CHANNELS = Object.freeze(['in_app', 'email', 'sms'])
export const NOTIFICATION_PRIORITY_LEVELS = Object.freeze(['low', 'normal', 'high'])

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  inApp: true,
  email: true,
  sms: false,
  reminderWindowHours: 24,
  quietHours: false,
  categories: ['application_update', 'interview_reminder', 'skill_gap_update', 'learning_recommendation', 'new_job_match', 'career_recommendation', 'employer_message'],
})

export function normalizeNotificationPreferences(preferences = {}) {
  const categories = Array.isArray(preferences.categories) && preferences.categories.length
    ? preferences.categories
    : DEFAULT_NOTIFICATION_PREFERENCES.categories

  return {
    inApp: preferences.inApp ?? preferences.in_app ?? DEFAULT_NOTIFICATION_PREFERENCES.inApp,
    email: preferences.email ?? DEFAULT_NOTIFICATION_PREFERENCES.email,
    sms: preferences.sms ?? DEFAULT_NOTIFICATION_PREFERENCES.sms,
    reminderWindowHours: Number(preferences.reminderWindowHours ?? preferences.reminder_window_hours ?? DEFAULT_NOTIFICATION_PREFERENCES.reminderWindowHours),
    quietHours: Boolean(preferences.quietHours ?? preferences.quiet_hours ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHours),
    categories: Array.from(new Set([...DEFAULT_NOTIFICATION_PREFERENCES.categories, ...categories])),
  }
}

export function buildNotificationRecord({
  userId,
  title,
  message,
  notificationType = 'application_update',
  relatedEntityType = null,
  relatedEntityId = null,
  dedupeKey = null,
  priority = 'normal',
  channels = ['in_app'],
  metadata = {},
} = {}) {
  const normalizedType = String(notificationType || 'application_update').trim() || 'application_update'
  const normalizedChannels = Array.isArray(channels) && channels.length ? channels : ['in_app']
  const validChannels = normalizedChannels.filter((channel) => NOTIFICATION_CHANNELS.includes(channel) || channel === 'in_app')

  return {
    userId,
    title: String(title || 'Platform update').trim(),
    message: String(message || 'A platform update is ready for you.').trim(),
    notificationType: normalizedType,
    relatedEntityType: relatedEntityType ? String(relatedEntityType) : null,
    relatedEntityId: relatedEntityId || null,
    priority: NOTIFICATION_PRIORITY_LEVELS.includes(priority) ? priority : 'normal',
    channels: validChannels.length ? validChannels : ['in_app'],
    metadata: metadata || {},
    dedupeKey: dedupeKey || `${userId}:${normalizedType}:${relatedEntityType || 'general'}:${relatedEntityId || 'none'}`,
  }
}

export function createNotificationSummary(notifications = []) {
  const unreadCount = notifications.filter((item) => !item.is_read).length

  return {
    total: notifications.length,
    unreadCount,
    byType: notifications.reduce((accumulator, item) => {
      const type = item.notification_type || item.notificationType || 'general'
      accumulator[type] = (accumulator[type] || 0) + 1
      return accumulator
    }, {}),
  }
}

export function canAccessMessageThread(currentUserId, senderId, receiverId) {
  if (!currentUserId) return false
  return currentUserId === senderId || currentUserId === receiverId
}

export async function listNotifications({ supabase, userId, unreadOnly = false, limit = 50 }) {
  if (!supabase || !userId) {
    return { items: [], unreadCount: 0, total: 0 }
  }

  let query = supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) throw error

  const items = data || []
  return {
    items,
    unreadCount: items.filter((item) => !item.is_read).length,
    total: items.length,
    preferences: normalizeNotificationPreferences(),
  }
}

export async function markNotificationRead({ supabase, notificationId, userId }) {
  if (!supabase || !notificationId) {
    return { id: notificationId, userId, is_read: true }
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function markAllNotificationsRead({ supabase, userId }) {
  if (!supabase || !userId) {
    return { updated: true, userId }
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select()

  if (error) throw error
  return { updated: true, count: (data || []).length, items: data || [] }
}
