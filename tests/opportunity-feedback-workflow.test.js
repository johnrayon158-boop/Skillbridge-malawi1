import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { normalizeNotificationPreferences } from '../src/utils/notificationPreferences.js'
import { buildCareerOpportunityPayload } from '../src/utils/careerOpportunityValidation.js'
import { buildEmployerFeedbackSubmission } from '../src/utils/employerFeedbackRules.js'

const migrationPath = new URL('../supabase/migrations/20261014000001_opportunity_notifications_feedback_workflows.sql', import.meta.url)

test('notification preferences allow only supported categories and normalized values', () => {
  const preferences = normalizeNotificationPreferences({
    enabled_categories: ['new_job_match', 'made_up_category', 'new_job_match'],
    preferred_industries: [' Agriculture ', 'Agriculture', ''],
    preferred_locations: ['Lilongwe'],
    preferred_opportunity_types: ['internship'],
    minimum_relevance_score: 140,
    digest_frequency: 'daily',
    email_enabled: true,
  })

  assert.deepEqual(preferences.enabled_categories, ['new_job_match'])
  assert.deepEqual(preferences.preferred_industries, ['Agriculture'])
  assert.deepEqual(preferences.preferred_locations, ['Lilongwe'])
  assert.deepEqual(preferences.preferred_opportunity_types, ['internship'])
  assert.equal(preferences.minimum_relevance_score, 100)
  assert.equal(preferences.digest_frequency, 'daily')
  assert.equal(preferences.email_enabled, false)
})

test('invalid notification preferences fall back safely without enabling email delivery', () => {
  const preferences = normalizeNotificationPreferences({
    enabled_categories: 'new_job_match',
    preferred_locations: 'Lilongwe',
    minimum_relevance_score: 'not-a-number',
    digest_frequency: 'instant',
    email_enabled: true,
  })

  assert.ok(preferences.enabled_categories.includes('new_job_match'))
  assert.deepEqual(preferences.preferred_locations, [])
  assert.equal(preferences.minimum_relevance_score, 30)
  assert.equal(preferences.digest_frequency, 'off')
  assert.equal(preferences.email_enabled, false)
})

test('admin opportunity validation preserves real listing constraints and skill links', () => {
  const opportunity = buildCareerOpportunityPayload({
    title: 'Data training',
    description: 'A practical data programme.',
    opportunity_type: 'training',
    provider: 'Verified provider',
    application_url: 'https://provider.example/apply',
    eligible_programmes: 'ICT, Data Science, ICT',
    academic_qualifications: 'Diploma in ICT\nBSc in Data Science',
    eligibility_requirements: 'Malawian resident, Available full time',
    eligible_candidate_types: ['student'],
    min_study_year: '2',
    max_study_year: '4',
    skill_ids: ['skill-1', 'skill-1'],
    career_ids: ['career-1', 'career-1'],
    delivery_mode: 'hybrid',
    status: 'published',
  })

  assert.deepEqual(opportunity.eligible_programmes, ['ICT', 'Data Science'])
  assert.deepEqual(opportunity.academic_qualifications, ['Diploma in ICT', 'BSc in Data Science'])
  assert.deepEqual(opportunity.eligibility_requirements, ['Malawian resident', 'Available full time'])
  assert.deepEqual(opportunity.eligible_candidate_types, ['student'])
  assert.deepEqual(opportunity.skill_ids, ['skill-1'])
  assert.deepEqual(opportunity.career_ids, ['career-1'])
  assert.equal(opportunity.min_study_year, 2)
  assert.equal(opportunity.application_url, 'https://provider.example/apply')
  assert.equal(opportunity.delivery_mode, 'hybrid')
  assert.throws(() => buildCareerOpportunityPayload({
    title: 'Missing source',
    description: 'A published opportunity needs a source.',
    opportunity_type: 'training',
    status: 'published',
  }), /provider/)
  assert.throws(() => buildCareerOpportunityPayload({
    title: 'Expired listing',
    description: 'An expired opportunity must stay unpublished.',
    opportunity_type: 'scholarship',
    provider: 'Verified provider',
    application_url: 'https://provider.example/apply',
    application_deadline: '2000-01-01',
    status: 'published',
  }), /Expired/)
  assert.throws(() => buildCareerOpportunityPayload({
    title: 'Invalid mode',
    description: 'Use a supported delivery mode.',
    opportunity_type: 'training',
    delivery_mode: 'space',
    status: 'draft',
  }), /delivery mode/)
  assert.throws(() => buildCareerOpportunityPayload({
    title: 'Unsafe link',
    description: 'No insecure link.',
    opportunity_type: 'scholarship',
    provider: 'Verified provider',
    application_url: 'http://provider.example',
    status: 'published',
  }), /HTTPS/)
  assert.throws(() => buildCareerOpportunityPayload({
    title: 'Invalid years',
    description: 'Study year bounds conflict.',
    opportunity_type: 'training',
    min_study_year: 4,
    max_study_year: 2,
    status: 'draft',
  }), /cannot exceed/)
})

test('feedback submissions remain submitted and preserve only chosen relationship references', () => {
  const feedback = buildEmployerFeedbackSubmission({
    employer_id: 'employer-1',
    candidate_id: 'candidate-1',
    application_id: 'application-1',
    job_id: 'job-1',
    status: 'validated',
  })

  assert.equal(feedback.status, 'submitted')
  assert.equal(feedback.employer_id, 'employer-1')
  assert.equal(feedback.created_by, 'employer-1')
  assert.equal(feedback.candidate_id, 'candidate-1')
  assert.equal(feedback.application_id, 'application-1')
  assert.equal(feedback.job_id, 'job-1')
})

test('database migration wires real sources, authorization, and database-enforced deduplication', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const applicationNotifications = await readFile(new URL('../supabase/migrations/20261009150000_employer_application_notifications.sql', import.meta.url), 'utf8')
  const notificationService = await readFile(new URL('../src/services/notificationService.js', import.meta.url), 'utf8')
  const notificationPage = await readFile(new URL('../src/pages/NotificationsPage.jsx', import.meta.url), 'utf8')

  assert.match(sql, /create unique index if not exists notifications_user_dedupe_key[\s\S]*?on public\.notifications\(user_id, dedupe_key\)/i)
  assert.match(sql, /after insert or update of status, title, description, location, employment_type/i)
  assert.match(sql, /on public\.learning_resources for each row execute function public\.notify_for_learning_resource/i)
  assert.match(sql, /create table if not exists public\.career_opportunities/i)
  assert.match(sql, /create or replace function public\.save_career_opportunity/i)
  assert.match(sql, /only administrators can manage training and scholarship opportunities/i)
  assert.match(sql, /p\.role = 'student'/i)
  assert.match(sql, /minimum_relevance_score/i)
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)[\s\S]*?p\.role = 'student'/i)
  assert.match(sql, /notification_preferences_email_delivery_disabled check \(email_enabled = false\)/i)
  assert.match(sql, /add column if not exists dismissed_at timestamptz/i)
  assert.match(sql, /on conflict \(user_id, dedupe_key\)[\s\S]*?relevance_reasons = excluded\.relevance_reasons/i)
  const opportunityAdminSql = await readFile(new URL('../supabase/migrations/20261119000004_training_scholarship_admin.sql', import.meta.url), 'utf8')
  assert.match(opportunityAdminSql, /academic_qualifications text\[\]/i)
  assert.match(opportunityAdminSql, /eligibility_requirements text\[\]/i)
  assert.match(opportunityAdminSql, /create table if not exists public\.career_opportunity_careers/i)
  assert.match(opportunityAdminSql, /o\.status = 'published' and c\.status = 'published'/i)
  assert.match(opportunityAdminSql, /career_opportunity_careers_admin_write/i)
  assert.match(opportunityAdminSql, /only existing, published careers/i)
  assert.match(opportunityAdminSql, /replace inactive or unapproved required skills before publishing/i)
  assert.match(opportunityAdminSql, /expired opportunities cannot be published/i)
  assert.match(opportunityAdminSql, /create or replace function public\.generate_opportunity_notifications/i)
  assert.match(opportunityAdminSql, /coalesce\(v_row\.industries, '\{\}'::text\[\]\)[\s\S]*?array_agg\(c\.title\)/i)
  assert.match(opportunityAdminSql, /delete_career_definition[\s\S]*?career_opportunity_careers/i)
  assert.match(notificationService, /\.is\('dismissed_at', null\)[\s\S]*?update\(\{ dismissed_at:/i)
  assert.match(applicationNotifications, /applications_notify_employer[\s\S]*?after insert on public\.applications/i)
  assert.match(applicationNotifications, /insert into public\.notifications[\s\S]*?target_job\.employer_id/i)
  assert.match(notificationPage, /aria-label="Loading notifications"/i)
  assert.match(notificationPage, /No notifications here yet/i)
  assert.match(notificationPage, /role="alert"/i)
  assert.match(notificationPage, /item\.relevance_reasons/i)
  assert.match(notificationPage, /item\.is_read/i)
})

test('feedback persistence is atomic, identity-bound, relationship-checked and candidate-acknowledged', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const feedbackRules = await readFile(new URL('../supabase/migrations/20261013000001_competency_profile_evidence.sql', import.meta.url), 'utf8')
  const submission = sql.match(/create or replace function public\.submit_employer_feedback[\s\S]*?\n\$\$;/i)?.[0] || ''
  const response = sql.match(/create or replace function public\.respond_to_employer_feedback[\s\S]*?\n\$\$;/i)?.[0] || ''

  assert.match(submission, /v_employer_id uuid := auth\.uid\(\)/i)
  assert.match(submission, /insert into public\.employer_feedback\s*\(/i)
  assert.match(submission, /insert into public\.employer_feedback_competencies\s*\(/i)
  assert.match(submission, /'submitted', v_employer_id/i)
  assert.match(feedbackRules, /public\.has_employer_candidate_relationship\(new\.employer_id, new\.candidate_id\)/i)
  assert.match(feedbackRules, /the application does not belong to this employer and candidate/i)
  assert.match(response, /ef\.candidate_id = v_user_id/i)
  assert.match(response, /insert into public\.employer_feedback_acknowledgements/i)
  assert.match(response, /length\(trim\(coalesce\(p_notes, ''\)\)\) < 5/i)
  assert.match(sql, /grant execute on function public\.submit_employer_feedback\(jsonb, jsonb\) to authenticated/i)
  assert.match(sql, /grant execute on function public\.respond_to_employer_feedback\(uuid, text, text\) to authenticated/i)
})
