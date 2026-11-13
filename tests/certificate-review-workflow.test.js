import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  canResubmitCertificate,
  getCertificateStatusLabel,
  normalizeCertificateReview,
} from '../src/utils/certificateWorkflow.js'

const [workflowMigration, uploadMigration, adminAccessMigration] = await Promise.all([
  readFile(new URL('../supabase/migrations/20261119000007_certificate_review_workflow.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261009010000_student_certificate_uploads.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20261014000005_admin_certificate_verification.sql', import.meta.url), 'utf8'),
])

test('certificate review decisions require a reason and valid independent verification method', () => {
  assert.deepEqual(normalizeCertificateReview({
    status: 'verified',
    method: 'issuer_confirmation',
    reason: 'Confirmed with the issuing institution.',
  }), {
    status: 'verified',
    method: 'issuer_confirmation',
    reason: 'Confirmed with the issuing institution.',
  })
  assert.deepEqual(normalizeCertificateReview({
    status: 'requires_correction',
    method: 'issuer_confirmation',
    reason: 'Upload a clearer copy showing the issuer.',
  }), {
    status: 'requires_correction',
    method: null,
    reason: 'Upload a clearer copy showing the issuer.',
  })
  assert.deepEqual(normalizeCertificateReview({
    status: 'rejected',
    reason: 'The credential could not be confirmed.',
  }), {
    status: 'rejected',
    method: null,
    reason: 'The credential could not be confirmed.',
  })
  assert.throws(() => normalizeCertificateReview({ status: 'verified', method: 'issuer_confirmation' }), /reason/)
  assert.throws(() => normalizeCertificateReview({ status: 'verified', method: 'uploaded_file', reason: 'Checked' }), /independently verified/)
  assert.throws(() => normalizeCertificateReview({ status: 'rejected', reason: 'x'.repeat(2001) }), /2,000/)
})

test('certificate statuses are presented as pending, approved, rejected, and requires correction', () => {
  assert.deepEqual(
    ['pending', 'verified', 'rejected', 'requires_correction'].map(getCertificateStatusLabel),
    ['Pending', 'Approved', 'Rejected', 'Requires Correction'],
  )
  assert.equal(canResubmitCertificate({ verification_status: 'requires_correction' }), true)
  assert.equal(canResubmitCertificate({ verification_status: 'pending' }), false)
})

test('certificate workflow stores append-oriented history, restricts review decisions, and notifies the owner', () => {
  assert.match(workflowMigration, /create table if not exists public\.certificate_review_history/i)
  assert.match(workflowMigration, /for select using \(public\.owns_student\(student_id\) or public\.is_admin\(\)\)/i)
  assert.match(workflowMigration, /revoke all on public\.certificate_review_history from public, anon, authenticated/i)
  assert.match(workflowMigration, /create or replace function public\.review_student_certificate/i)
  assert.match(workflowMigration, /if not public\.is_admin\(\) then/i)
  assert.match(workflowMigration, /if v_certificate\.verification_status <> 'pending' then/i)
  assert.match(workflowMigration, /insert into public\.certificate_review_history/i)
  assert.match(workflowMigration, /insert into public\.notifications/i)
  assert.match(workflowMigration, /create policy certificates_admin_select[\s\S]*?for select using \(public\.is_admin\(\)\)/i)
  assert.match(workflowMigration, /create policy certificates_owner_update[\s\S]*?not public\.is_admin\(\)/i)
  assert.match(workflowMigration, /administrators cannot review their own certificate/i)
})

test('certificate files remain private and student access is scoped to the owner folder', () => {
  assert.match(uploadMigration, /'student-certificates',[\s\S]*?false,/i)
  assert.match(uploadMigration, /student_certificates_owner_select on storage\.objects[\s\S]*?storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i)
  assert.match(uploadMigration, /student_certificates_owner_insert on storage\.objects[\s\S]*?storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i)
  assert.match(adminAccessMigration, /student_certificates_admin_select on storage\.objects[\s\S]*?public\.is_admin\(\)/i)
  assert.match(workflowMigration, /new\.file_path not like \(auth\.uid\(\)::text \|\| '\/certificates\/%'\)/i)
})
