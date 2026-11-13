import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  normalizeNotificationPreferences,
} from '../utils/notificationPreferences.js'

export { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES, normalizeNotificationPreferences }

let notificationSubscriptionId = 0

export const notificationService = {
  async list(userId, options = {}) {
    return (await this.listPage(userId, options)).items
  },

  async listPage(userId, options = {}) {
    const settings = typeof options === 'boolean' ? { unread: options } : options
    const { limit = 50, offset = 0, unread = false, readOnly = false, category = '' } = settings
    let query = supabase.from('notifications').select('*', { count: 'exact' })
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (unread) query = query.eq('is_read', false)
    if (readOnly) query = query.eq('is_read', true)
    if (category) query = query.eq('notification_type', category)
    const { data, error, count } = await query
    return { items: requireData(data, error, 'Unable to load notifications.'), total: count || 0 }
  },

  async getUnreadCount(userId) {
    const { count, error } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .eq('is_read', false)
    if (error) throw new Error(error.message || 'Unable to load unread notification count.')
    return count || 0
  },

  async getPreferences(userId) {
    const { data, error } = await supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message || 'Unable to load notification preferences.')
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data || {}) }
  },

  async savePreferences(userId, preferences) {
    const payload = {
      user_id: userId,
      ...normalizeNotificationPreferences(preferences),
    }
    const { data, error } = await supabase.from('notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    return requireData(data, error, 'Unable to save notification preferences.')
  },

  async generateOpportunityNotifications() {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify your account.')
    if (!authData?.user) throw new Error('Sign in to refresh opportunity notifications.')
    const { data, error } = await supabase.rpc('generate_opportunity_notifications')
    if (error) throw new Error(error.message || 'Unable to refresh opportunity notifications.')
    return Number(data) || 0
  },

  async markRead(notificationId, userId) {
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .select()
      .single()
    return requireData(data, error, 'Unable to update the notification.')
  },

  async markAllRead(userId) {
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .is('dismissed_at', null)
      .select('id')
    return requireData(data, error, 'Unable to update notifications.')
  },

  async dismiss(notificationId, userId) {
    const { error } = await supabase.from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .is('dismissed_at', null)
    if (error) throw new Error(error.message || 'Unable to dismiss the notification.')
  },

  subscribe(userId, onNotification) {
    notificationSubscriptionId += 1
    return supabase.channel(`notifications:${userId}:${notificationSubscriptionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, onNotification)
      .subscribe()
  },

  async listReminders(userId) {
    const { data, error } = await supabase.from('reminders').select('*').eq('user_id', userId).order('reminder_date')
    return requireData(data, error, 'Unable to load reminders.')
  },

  async saveReminder(reminder) {
    const { data, error } = await supabase.from('reminders').upsert(reminder).select().single()
    return requireData(data, error, 'Unable to save the reminder.')
  },

  async completeReminder(id, userId) {
    const { data, error } = await supabase.from('reminders')
      .update({ completed: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return requireData(data, error, 'Unable to complete the reminder.')
  },
}
