import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20261114000001_standardize_application_statuses.sql', import.meta.url)

test('application status migration preserves history and enforces the canonical state machine', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /add constraint applications_status_check[\s\S]*'offer_declined'/)
  assert.match(sql, /create or replace function public\.application_status_transition_allowed/)
  assert.match(sql, /create trigger applications_status_transition_guard/)
  assert.match(sql, /create trigger applications_status_change_event/)
  assert.doesNotMatch(sql, /into\s+(?:updated_application|target_application)\s*,\s*target_employer_id/i)
  assert.match(sql, /insert into public\.application_events/)
  assert.match(sql, /Conflicting terminal application and offer records need manual review/)
  assert.match(sql, /offers_one_pending_per_application/)
})

test('application workflows centralize interview, offer, and student outcome updates', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.employer_schedule_interview/)
  assert.match(sql, /set status = 'interview'/)
  assert.match(sql, /create or replace function public\.employer_create_offer/)
  assert.match(sql, /An outstanding offer already exists for this application/)
  assert.match(sql, /create or replace function public\.student_respond_to_offer/)
  assert.match(sql, /create or replace function public\.student_withdraw_application/)
  assert.match(sql, /drop policy if exists applications_student_withdraw/)
  assert.match(sql, /drop policy if exists interviews_participant_all/)
  assert.match(sql, /drop policy if exists offers_participant_all/)
})
