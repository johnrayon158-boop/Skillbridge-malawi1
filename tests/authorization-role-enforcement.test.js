import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const migrationUrl = new URL(
  '../supabase/migrations/20261121000001_authorization_role_enforcement.sql',
  import.meta.url,
)
const migration = await readFile(migrationUrl, 'utf8')
const applicationWorkflow = await readFile(
  new URL('../supabase/migrations/20261114000001_standardize_application_statuses.sql', import.meta.url),
  'utf8',
)
const interviewWorkflow = await readFile(
  new URL('../supabase/migrations/20261117000001_interview_policy_and_consent.sql', import.meta.url),
  'utf8',
)
const localUrl = process.env.SUPABASE_AUTHZ_TEST_URL
const serviceKey = process.env.SUPABASE_AUTHZ_TEST_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_AUTHZ_TEST_ANON_KEY
const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])

if (localUrl && !localHostnames.has(new URL(localUrl).hostname)) {
  throw new Error('Authorization integration tests may only target a local Supabase instance.')
}

test('profile role escalation is blocked and signup keeps trusted role handling', () => {
  assert.match(migration, /drop policy if exists "Users can insert their own profile"/)
  assert.match(migration, /drop policy if exists "Users can delete their own profile"/)
  assert.match(migration, /revoke insert, delete on public\.profiles from public, anon, authenticated/)
  assert.match(migration, /function public\.prevent_profile_admin_insert[\s\S]*new\.role = 'admin'[\s\S]*not public\.is_admin\(\)/)
  assert.match(migration, /requested_role text := coalesce\(new\.raw_user_meta_data->>'role', 'student'\)/)
  assert.match(migration, /if requested_role not in \('student', 'employer'\) then/)
  assert.doesNotMatch(migration, /on conflict \(id\) do update set[\s\S]{0,180}role\s*=/i)
})

test('employer candidate access and privileged workflows require an employer role', () => {
  assert.match(migration, /create or replace function public\.owns_employer\(target_id uuid\)[\s\S]*auth\.uid\(\) = target_id and public\.is_employer\(\)/)
  assert.match(migration, /create or replace function public\.can_access_application\(target_id uuid\)[\s\S]*j\.employer_id = auth\.uid\(\) and public\.is_employer\(\)/)
  assert.match(migration, /create or replace function public\.has_employer_candidate_relationship[\s\S]*public\.owns_employer\(p_employer_id\)/)
  assert.match(migration, /employer_candidate_profile_read[\s\S]*public\.owns_employer\(j\.employer_id\)/)
  assert.match(migration, /employer_candidate_student_profile_read[\s\S]*public\.owns_employer\(j\.employer_id\)/)
  assert.match(migration, /employer_candidate_education_read[\s\S]*public\.owns_employer\(j\.employer_id\)/)
  assert.match(migration, /employer_candidate_skills_read[\s\S]*public\.owns_employer\(j\.employer_id\)/)
  assert.match(migration, /employer_candidate_results_read[\s\S]*join public\.job_assessments ja[\s\S]*ja\.assessment_id = assessment_results\.assessment_id/)
  assert.match(migration, /employer_feedback_employer_all[\s\S]*public\.has_employer_candidate_relationship/)
  assert.match(applicationWorkflow, /employer_update_application[\s\S]*public\.owns_employer\(target_employer_id\)/)
  assert.match(applicationWorkflow, /employer_create_offer[\s\S]*public\.owns_employer\(target_employer_id\)/)
  assert.match(interviewWorkflow, /employer_schedule_interview[\s\S]*public\.owns_employer\(target_employer_id\)/)
})

test('employer verification documents require role-aware ownership', () => {
  assert.match(migration, /employer_verification_submissions_owner_read[\s\S]*public\.owns_employer\(employer_id\)/)
  assert.match(migration, /employer_verification_submissions_owner_insert[\s\S]*public\.owns_employer\(employer_id\)/)
  assert.match(migration, /employer_verification_documents_owner_read[\s\S]*public\.owns_employer\(auth\.uid\(\)\)/)
  assert.match(migration, /employer_verification_documents_owner_insert[\s\S]*public\.owns_employer\(auth\.uid\(\)\)/)
  assert.match(migration, /employer_verification_documents_owner_delete_unsubmitted[\s\S]*public\.owns_employer\(auth\.uid\(\)\)/)
})

test('local RLS integration enforces role, ownership, recruitment scope, and private storage', {
  skip: !localUrl || !serviceKey || !anonKey
}, async () => {
  const service = createClient(localUrl, serviceKey, { auth: { persistSession: false } })
  const anonymous = createClient(localUrl, anonKey, { auth: { persistSession: false } })
  const password = `Authz-test-${randomUUID()}-aA1!`
  const accounts = []
  const clients = new Map()
  const uploadedPaths = []

  const createAccount = async (role) => {
    const email = `authz-${randomUUID()}@example.invalid`
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: 'Authorization Test' },
    })
    assert.ifError(error)
    accounts.push(data.user.id)
    return data.user.id
  }

  const signIn = async (id, email) => {
    const client = createClient(localUrl, anonKey, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({ email, password })
    assert.ifError(error)
    clients.set(id, client)
    return client
  }

  try {
    const studentId = await createAccount('student')
    const otherStudentId = await createAccount('student')
    const employerId = await createAccount('employer')
    const otherEmployerId = await createAccount('employer')
    const adminId = await createAccount('student')

    for (const id of [studentId, otherStudentId]) {
      const { error } = await service.from('student_profiles').insert({ id })
      assert.ifError(error)
    }

    for (const id of [employerId, otherEmployerId]) {
      const { error } = await service.from('employer_profiles').insert({
        id,
        company_name: `Company ${id.slice(0, 8)}`,
        industry: 'Technology',
        description: 'Authorization test employer',
        email: `${id}@example.invalid`,
      })
      assert.ifError(error)
    }

    const jobIds = []
    for (const id of [employerId, otherEmployerId]) {
      const { data, error } = await service.from('jobs').insert({
        employer_id: id,
        title: 'Authorization test role',
        description: 'A draft job used by a local RLS test.',
        employment_type: 'full_time',
        status: 'draft',
      }).select('id').single()
      assert.ifError(error)
      jobIds.push(data.id)
    }

    const assessmentIds = []
    for (const [index, jobId] of jobIds.entries()) {
      const { data: assessment, error: assessmentError } = await service.from('assessments').insert({
        title: `Authorization test assessment ${index}`,
        description: 'A draft assessment used by a local RLS test.',
        assessment_type: 'job',
        status: 'published',
      }).select('id').single()
      assert.ifError(assessmentError)
      assessmentIds.push(assessment.id)
      const { error: jobAssessmentError } = await service.from('job_assessments').insert({
        job_id: jobId,
        assessment_id: assessment.id,
      })
      assert.ifError(jobAssessmentError)
    }

    const applicationIds = []
    const assessmentResultIds = []
    for (const [index, [candidateId, jobId]] of [[studentId, jobIds[0]], [otherStudentId, jobIds[1]]].entries()) {
      const { data, error } = await service.from('applications').insert({
        student_id: candidateId,
        job_id: jobId,
      }).select('id').single()
      assert.ifError(error)
      applicationIds.push(data.id)

      const now = new Date().toISOString()
      const { data: result, error: resultError } = await service.from('assessment_results').insert({
        assessment_id: assessmentIds[index],
        student_id: candidateId,
        score: 75,
        percentage: 75,
        passed: true,
        started_at: now,
        completed_at: now,
      }).select('id').single()
      assert.ifError(resultError)
      assessmentResultIds.push(result.id)
    }

    const { error: legacyEmployerProfileError } = await service.from('employer_profiles').insert({
      id: studentId,
      company_name: 'Legacy forged employer record',
      industry: 'Technology',
      description: 'Simulates a legacy employer profile owned by a student role.',
      email: `${studentId}@example.invalid`,
    })
    assert.ifError(legacyEmployerProfileError)
    const { data: legacyJob, error: legacyJobError } = await service.from('jobs').insert({
      employer_id: studentId,
      title: 'Legacy authorization test role',
      description: 'Simulates a legacy job created before role enforcement.',
      employment_type: 'full_time',
      status: 'draft',
    }).select('id').single()
    assert.ifError(legacyJobError)
    const { data: legacyApplication, error: legacyApplicationError } = await service.from('applications').insert({
      student_id: otherStudentId,
      job_id: legacyJob.id,
    }).select('id').single()
    assert.ifError(legacyApplicationError)

    const { error: adminRoleError } = await service.from('profiles')
      .update({ role: 'admin' })
      .eq('id', adminId)
    assert.ifError(adminRoleError)

    const { data: studentUser, error: studentAuthError } = await service.auth.admin.getUserById(studentId)
    assert.ifError(studentAuthError)
    const { data: otherStudentUser, error: otherStudentAuthError } = await service.auth.admin.getUserById(otherStudentId)
    assert.ifError(otherStudentAuthError)
    const { data: employerUser, error: employerAuthError } = await service.auth.admin.getUserById(employerId)
    assert.ifError(employerAuthError)
    const { data: otherEmployerUser, error: otherEmployerAuthError } = await service.auth.admin.getUserById(otherEmployerId)
    assert.ifError(otherEmployerAuthError)
    const { data: adminUser, error: adminAuthError } = await service.auth.admin.getUserById(adminId)
    assert.ifError(adminAuthError)

    const student = await signIn(studentId, studentUser.user.email)
    const otherStudent = await signIn(otherStudentId, otherStudentUser.user.email)
    const employer = await signIn(employerId, employerUser.user.email)
    const otherEmployer = await signIn(otherEmployerId, otherEmployerUser.user.email)
    const admin = await signIn(adminId, adminUser.user.email)

    const { data: anonymousProfiles, error: anonymousError } = await anonymous.from('profiles').select('id')
    assert.ifError(anonymousError)
    assert.deepEqual(anonymousProfiles, [])

    const { data: ownProfile, error: ownProfileError } = await student.from('profiles').select('id').eq('id', studentId)
    assert.ifError(ownProfileError)
    assert.equal(ownProfile.length, 1)

    const { data: crossProfile, error: crossProfileError } = await student.from('profiles').select('id').eq('id', otherStudentId)
    assert.ifError(crossProfileError)
    assert.deepEqual(crossProfile, [])

    const { data: ownApplications, error: ownApplicationsError } = await student.from('applications').select('id')
    assert.ifError(ownApplicationsError)
    assert.deepEqual(ownApplications.map(({ id }) => id), [applicationIds[0]])
    const { data: crossApplications, error: crossApplicationsError } = await student.from('applications').select('id').eq('id', applicationIds[1])
    assert.ifError(crossApplicationsError)
    assert.deepEqual(crossApplications, [])
    const { data: ownResults, error: ownResultsError } = await student.from('assessment_results').select('id')
    assert.ifError(ownResultsError)
    assert.deepEqual(ownResults.map(({ id }) => id), [assessmentResultIds[0]])
    const { data: crossResults, error: crossResultsError } = await student.from('assessment_results').select('id').eq('id', assessmentResultIds[1])
    assert.ifError(crossResultsError)
    assert.deepEqual(crossResults, [])

    const { error: profileInsertError } = await student.from('profiles').insert({
      id: studentId,
      full_name: 'Forged administrator',
      email: studentUser.user.email,
      role: 'admin',
    })
    assert.ok(profileInsertError)

    const { error: profileRoleUpdateError } = await student.from('profiles')
      .update({ role: 'admin' })
      .eq('id', studentId)
    assert.ok(profileRoleUpdateError)

    const { error: profileDeleteError } = await student.from('profiles').delete().eq('id', studentId)
    assert.ok(profileDeleteError)

    const { error: employerProfileError } = await student.from('employer_profiles').insert({
      id: studentId,
      company_name: 'Forged employer',
      industry: 'Technology',
      description: 'Must be blocked by role-aware ownership.',
      email: studentUser.user.email,
    })
    assert.ok(employerProfileError)
    const { error: studentRpcError } = await student.rpc('employer_update_application', {
      p_application_id: legacyApplication.id,
      p_status: 'shortlisted',
      p_note: null,
    })
    assert.ok(studentRpcError)

    const { data: employerCandidates, error: candidatesError } = await employer.from('student_profiles').select('id')
    assert.ifError(candidatesError)
    assert.deepEqual(employerCandidates.map(({ id }) => id), [studentId])

    const { data: employerApplications, error: applicationsError } = await employer.from('applications').select('id')
    assert.ifError(applicationsError)
    assert.deepEqual(employerApplications.map(({ id }) => id), [applicationIds[0]])
    const { data: employerResults, error: employerResultsError } = await employer.from('assessment_results').select('id')
    assert.ifError(employerResultsError)
    assert.deepEqual(employerResults.map(({ id }) => id), [assessmentResultIds[0]])

    const { data: unrelatedEmployerCandidates, error: unrelatedCandidatesError } = await otherEmployer.from('student_profiles').select('id')
    assert.ifError(unrelatedCandidatesError)
    assert.deepEqual(unrelatedEmployerCandidates.map(({ id }) => id), [otherStudentId])

    const { data: adminProfiles, error: adminProfilesError } = await admin.from('profiles').select('id')
    assert.ifError(adminProfilesError)
    for (const id of accounts) assert.ok(adminProfiles.some(({ id: profileId }) => profileId === id))
    const { data: adminApplications, error: adminApplicationsError } = await admin.from('applications').select('id')
    assert.ifError(adminApplicationsError)
    for (const id of applicationIds) assert.ok(adminApplications.some(({ id: applicationId }) => applicationId === id))
    const { data: adminResults, error: adminResultsError } = await admin.from('assessment_results').select('id')
    assert.ifError(adminResultsError)
    for (const id of assessmentResultIds) assert.ok(adminResults.some(({ id: resultId }) => resultId === id))

    const employerDocumentPath = `${employerId}/authorization-test-${randomUUID()}.txt`
    uploadedPaths.push(['employer-verification-documents', employerDocumentPath])
    const { error: uploadError } = await employer.storage
      .from('employer-verification-documents')
      .upload(employerDocumentPath, new Blob(['private test document']), { contentType: 'text/plain' })
    assert.ifError(uploadError)

    const { error: privateFileError } = await otherStudent.storage
      .from('employer-verification-documents')
      .download(employerDocumentPath)
    assert.ok(privateFileError)

    const studentDocumentPath = `${studentId}/authorization-test-${randomUUID()}.pdf`
    uploadedPaths.push(['student-certificates', studentDocumentPath])
    const { error: studentUploadError } = await student.storage
      .from('student-certificates')
      .upload(studentDocumentPath, new Blob(['private student document']), { contentType: 'application/pdf' })
    assert.ifError(studentUploadError)
    const { error: otherStudentFileError } = await otherStudent.storage
      .from('student-certificates')
      .download(studentDocumentPath)
    assert.ok(otherStudentFileError)
  } finally {
    for (const client of clients.values()) await client.auth.signOut()
    for (const [bucket, path] of uploadedPaths) {
      await service.storage.from(bucket).remove([path])
    }
    for (const id of accounts) await service.auth.admin.deleteUser(id)
  }
})
