import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  formatInterviewDateTime,
  getSafeMeetingUrl,
  normalizeInterviewReport,
  toLocalInterviewDateTime,
  validateInterviewMeetingUrl,
} from '../src/utils/interviewPolicy.js'

const migration = await readFile(
  new URL('../supabase/migrations/20261117000001_interview_policy_and_consent.sql', import.meta.url),
  'utf8',
)

test('meeting URLs require HTTPS and reject credentials and malformed links', () => {
  assert.equal(validateInterviewMeetingUrl('https://meet.example.org/room/1').valid, true)
  assert.equal(getSafeMeetingUrl('https://meet.example.org/room/1'), 'https://meet.example.org/room/1')
  assert.equal(validateInterviewMeetingUrl('http://meet.example.org/room/1').valid, false)
  assert.equal(validateInterviewMeetingUrl('https://user:secret@meet.example.org/room/1').valid, false)
  assert.equal(validateInterviewMeetingUrl('javascript:alert(1)').valid, false)
  assert.equal(validateInterviewMeetingUrl(`https://meet.example.org/${'a'.repeat(2048)}`).valid, false)
  assert.equal(getSafeMeetingUrl('not a link'), '')
})

test('interview dates include local timezone and are editable as local datetime values', () => {
  const isoDate = '2026-04-20T14:30:00.000Z'
  assert.match(formatInterviewDateTime(isoDate), /\d{4}/)
  const localInput = toLocalInterviewDateTime(isoDate)
  assert.match(localInput, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  assert.equal(new Date(localInput).getTime(), new Date(isoDate).getTime())
  assert.equal(formatInterviewDateTime('not a date'), 'Date and time unavailable')
})

test('interview reports ignore malformed records', () => {
  assert.equal(normalizeInterviewReport(null), null)
  assert.equal(normalizeInterviewReport({ category: 'made_up', status: 'open' }), null)
  assert.deepEqual(normalizeInterviewReport({ category: 'other', status: 'open', details: null }), {
    category: 'other',
    status: 'open',
    details: '',
  })
})

test('interview migration scopes reports and records rescheduling history and notifications', () => {
  assert.doesNotMatch(migration, /into\s+target_interview\s*,\s*target_application/i)
  assert.match(migration, /interview_policy_reports_one_per_reporter/)
  assert.match(migration, /interview_policy_reports_reporter_read[\s\S]*reporter_id = auth\.uid\(\)/)
  assert.match(migration, /interview_policy_reports_admin_read[\s\S]*public\.is_admin\(\)/)
  assert.match(migration, /a\.student_id = auth\.uid\(\)/)
  assert.match(migration, /public\.owns_employer\(j\.employer_id\)/)
  assert.match(migration, /public\.is_admin\(\)[\s\S]*Only an administrator can review interview reports/)
  assert.match(migration, /'interview_rescheduled'[\s\S]*'Interview rescheduled'/)
  assert.match(migration, /insert into public\.notifications[\s\S]*'interview_reminder'/)
  assert.match(migration, /https:\/\/\[\^\/\?#\[:space:\]\]\+/)
})
