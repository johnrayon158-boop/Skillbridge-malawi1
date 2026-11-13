import { buildNotificationRecord, normalizeNotificationPreferences } from './notificationService.js'

export function buildReminderPayload({
  userId,
  title,
  description = '',
  reminderType = 'application_deadline',
  reminderDate,
  completed = false,
  recurring = false,
  metadata = {},
} = {}) {
  const reminderDateValue = String(reminderDate || new Date().toISOString())

  return {
    userId,
    title: String(title || 'Reminder').trim(),
    description: String(description || '').trim(),
    reminderType: String(reminderType || 'application_deadline').trim(),
    reminderDate: reminderDateValue,
    completed: Boolean(completed),
    recurring: Boolean(recurring),
    metadata: metadata || {},
    notificationPreferences: normalizeNotificationPreferences(),
  }
}

export function buildReminderNotification({
  userId,
  title,
  reminderType = 'application_deadline',
  reminderDate,
  relatedEntityType = null,
  relatedEntityId = null,
} = {}) {
  const reminderDateValue = reminderDate || new Date().toISOString()
  const textType = String(reminderType || 'application_deadline').replace('_', ' ')

  return buildNotificationRecord({
    userId,
    title: title || 'Upcoming reminder',
    message: `You have an upcoming ${textType} reminder scheduled for ${new Date(reminderDateValue).toLocaleString()}.`,
    notificationType: reminderType === 'interview' ? 'interview_reminder' : 'application_update',
    relatedEntityType,
    relatedEntityId,
    priority: 'normal',
    channels: ['in_app'],
  })
}

export async function listReminders({ supabase, userId, completedOnly = false }) {
  if (!supabase || !userId) {
    return { items: [], total: 0 }
  }

  let query = supabase.from('reminders').select('*').eq('user_id', userId).order('reminder_date', { ascending: true })
  if (completedOnly) query = query.eq('completed', true)
  else query = query.eq('completed', false)

  const { data, error } = await query
  if (error) throw error

  return { items: data || [], total: (data || []).length }
}

export async function createReminder({ supabase, reminder }) {
  if (!supabase) {
    return { item: buildReminderPayload(reminder), created: true }
  }

  const payload = buildReminderPayload(reminder)
  const { data, error } = await supabase.from('reminders').insert({
    user_id: payload.userId,
    title: payload.title,
    description: payload.description,
    reminder_type: payload.reminderType,
    reminder_date: payload.reminderDate,
    completed: payload.completed,
    updated_at: new Date().toISOString(),
  }).select().single()

  if (error) throw error
  return { item: data, created: true }
}

export async function completeReminder({ supabase, reminderId }) {
  if (!supabase || !reminderId) {
    return { id: reminderId, completed: true }
  }

  const { data, error } = await supabase
    .from('reminders')
    .update({ completed: true, updated_at: new Date().toISOString() })
    .eq('id', reminderId)
    .select()
    .single()

  if (error) throw error
  return { item: data, completed: true }
}
