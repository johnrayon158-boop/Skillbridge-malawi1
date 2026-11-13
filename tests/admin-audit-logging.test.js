import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20261119000005_admin_audit_logging.sql', import.meta.url)

test('admin audit migration makes logs append-only and stores the required audit fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /add column if not exists actor_role text/i)
  assert.match(sql, /add column if not exists action_result text not null/i)
  assert.match(sql, /add column if not exists before_summary jsonb/i)
  assert.match(sql, /add column if not exists after_summary jsonb/i)
  assert.match(sql, /drop policy if exists admin_logs_admin_all/i)
  assert.match(sql, /create policy admin_logs_admin_read[\s\S]*?for select using \(public\.is_admin\(\)\)/i)
  assert.match(sql, /revoke all on public\.admin_logs from public, anon, authenticated/i)
  assert.match(sql, /grant select on public\.admin_logs to authenticated/i)
  assert.match(sql, /v_actor_role is distinct from 'admin'/i)
  assert.match(sql, /v_actor_id, v_actor_role, v_action, v_entity_type, v_entity_id,[\s\S]*?'success', v_before_summary, v_after_summary/i)
})

test('administrative changes are automatically recorded with allowlisted summaries', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const [table, trigger] of [
    ['profiles', 'admin_audit_profiles'],
    ['employer_verification_submissions', 'admin_audit_employer_verification'],
    ['careers', 'admin_audit_careers'],
    ['skills', 'admin_audit_skills'],
    ['jobs', 'admin_audit_jobs'],
    ['assessments', 'admin_audit_assessments'],
    ['assessment_questions', 'admin_audit_assessment_questions'],
    ['learning_resources', 'admin_audit_learning_resources'],
    ['certificates', 'admin_audit_certificates'],
    ['interview_policy_reports', 'admin_audit_interview_policy_reports'],
  ]) {
    assert.match(sql, new RegExp(`create trigger ${trigger}[\\s\\S]*?on public\\.${table}`, 'i'))
  }
  assert.match(sql, /user\.role_changed/i)
  assert.match(sql, /employer_verification\.approved/i)
  assert.match(sql, /employer_verification\.rejected/i)
  assert.match(sql, /career\.created/i)
  assert.match(sql, /skill\.imported/i)
  assert.match(sql, /skill\.review_status_changed/i)
  assert.match(sql, /job\.moderated/i)
  assert.match(sql, /assessment\.question_updated/i)
  assert.match(sql, /learning_resource\.status_changed/i)
  assert.doesNotMatch(sql, /v_before->'correct_answer'|v_after->'correct_answer'|v_before->'document_path'|v_after->'document_path'|v_before->'reviewer_feedback'|v_after->'reviewer_feedback'/i)
})

test('audit service and page support safe search, pagination, entity and date filters', async () => {
  const service = await readFile(new URL('../src/services/adminService.js', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/admin/AdminModulePage.jsx', import.meta.url), 'utf8')
  const auditStart = service.indexOf('async getAuditLogs(')
  const auditEnd = service.indexOf('async getDataQualityOverview(', auditStart)
  const auditMethod = auditStart >= 0 && auditEnd > auditStart ? service.slice(auditStart, auditEnd) : ''

  assert.match(auditMethod, /action_result,\s*before_summary,\s*after_summary/)
  assert.match(auditMethod, /\.gte\('created_at'/)
  assert.match(auditMethod, /\.lt\('created_at'/)
  assert.match(auditMethod, /\.range\(offset, offset \+ safePageSize - 1\)/)
  assert.ok(page.includes('aria-label="Search audit logs"'))
  assert.ok(page.includes('From date'))
  assert.ok(page.includes('To date'))
  assert.ok(page.includes('Entity type'))
  assert.match(page, /log\.before_summary/)
  assert.match(page, /log\.after_summary/)
})
