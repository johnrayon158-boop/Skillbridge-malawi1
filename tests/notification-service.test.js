import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNotificationRecord,
  normalizeNotificationPreferences,
  canAccessMessageThread,
} from '../server/services/notifications/notificationService.js'
import { buildReminderPayload } from '../server/services/notifications/reminderService.js'

test('notification records use safe defaults and deduplicate keys for repeated events', () => {
  const notification = buildNotificationRecord({
    userId: 'user-123',
    title: 'Interview scheduled',
    message: 'Your interview is scheduled for tomorrow.',
    notificationType: 'interview_reminder',
    dedupeKey: 'application-1:interview_reminder',
  })

  assert.equal(notification.userId, 'user-123')
  assert.equal(notification.notificationType, 'interview_reminder')
  assert.equal(notification.priority, 'normal')
  assert.equal(notification.dedupeKey, 'application-1:interview_reminder')
  assert.equal(notification.channels.includes('in_app'), true)
})

test('notification preferences merge system defaults without dropping explicit user choices', () => {
  const preferences = normalizeNotificationPreferences({
    email: false,
    categories: ['application_update'],
  })

  assert.equal(preferences.email, false)
  assert.equal(preferences.sms, false)
  assert.equal(preferences.categories.includes('application_update'), true)
  assert.equal(preferences.categories.includes('interview_reminder'), true)
})

test('reminder payloads normalize dates and mark recurring reminders to the correct type', () => {
  const reminder = buildReminderPayload({
    userId: 'user-456',
    title: 'Complete your application review',
    description: 'Review your shortlisted role before the deadline.',
    reminderType: 'application_deadline',
    reminderDate: '2026-10-04T09:00:00Z',
    recurring: true,
  })

  assert.equal(reminder.userId, 'user-456')
  assert.equal(reminder.reminderType, 'application_deadline')
  assert.equal(reminder.completed, false)
  assert.equal(reminder.recurring, true)
  assert.equal(typeof reminder.reminderDate, 'string')
})

test('message access is restricted to sender, receiver, or a valid related workflow participant', () => {
  assert.equal(canAccessMessageThread('user-a', 'user-a', 'user-b'), true)
  assert.equal(canAccessMessageThread('user-a', 'user-c', 'user-b'), false)
  assert.equal(canAccessMessageThread('user-a', 'user-b', 'user-a'), true)
})
