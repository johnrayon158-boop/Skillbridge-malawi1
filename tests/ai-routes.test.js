import assert from 'node:assert/strict'
import test from 'node:test'
import { AI_POST_ROUTES, createAiRouteHandlers } from '../server/services/ai/aiRouteHandlers.js'

const requiredCareer = {
  id: 'career-1',
  title: 'Data Analyst',
  career_skills: [
    { required_level: 'advanced', skills: { name: 'SQL' } },
    { required_level: 'intermediate', skills: { name: 'Statistics' } },
  ],
}

const requiredJob = {
  id: 'job-1',
  title: 'Data Analyst',
  status: 'published',
  job_skills: [
    { required_level: 'advanced', skills: { name: 'SQL' } },
    { required_level: 'intermediate', skills: { name: 'Statistics' } },
  ],
}

const studentData = {
  skills: [{ name: 'SQL', level: 'advanced', confidence: 90 }],
  assessments: [{ percentage: 80, assessments: { skills: { name: 'SQL' } } }],
  projects: [],
  certificates: [],
  portfolio: null,
  resources: [{ id: 'resource-1', title: 'Statistics course', url: 'https://example.edu/statistics', resource_type: 'course', skills: { name: 'Statistics' } }],
  employment: [],
  skillEvidence: [],
  profile: { student_profiles: [{ education_level: 'Bachelor' }] },
}

function createHarness({
  authenticated = true,
  role = 'student',
  data = studentData,
  jobs = [requiredJob],
  storedMatches = [],
  employerApplications,
  scoring,
} = {}) {
  const responses = []
  let savedMatches = null
  const handlers = createAiRouteHandlers({
    authenticate: async () => authenticated ? { id: 'student-1' } : null,
    getProfile: async () => ({ id: 'student-1', role, student_profiles: data.profile?.student_profiles || [] }),
    loadStudentData: async () => data,
    loadCareer: async (id) => id === requiredCareer.id ? requiredCareer : null,
    loadJob: async (id) => id === requiredJob.id ? requiredJob : null,
    loadJobs: async () => jobs,
    loadEmployerApplications: async (ids) => employerApplications || ids.map((id) => ({
      id,
      job_id: requiredJob.id,
      student_id: 'student-1',
    })),
    getStoredJobMatches: async (studentId, jobIds) => storedMatches
      .filter((match) => match.student_id === studentId && jobIds.includes(match.job_id)),
    saveJobMatches: async (payload) => { savedMatches = payload },
    loadOwnedApplication: async (id, userId) => id === 'application-1' && userId === 'student-1',
    saveRecommendationFeedback: async (feedback) => ({ id: 'feedback-1', ...feedback }),
    getJsonBody: async (req) => req.body,
    sendJson: (_res, status, payload) => responses.push({ status, payload }),
    errorResponse: (message, statusCode) => ({ ok: false, error: message, statusCode }),
    ...(scoring ? { scoring } : {}),
  })
  const call = async (route, body) => {
    responses.length = 0
    await handlers[`POST ${route}`]({ body, headers: {} }, {})
    return responses[0]
  }
  return { handlers, call, getSavedMatches: () => savedMatches }
}

const validCalls = [
  ['/api/ai/skills-gap', { targetCareerId: 'career-1' }, 'skill_gaps'],
  ['/api/ai/learning-recommendations', { targetCareerId: 'career-1' }, 'recommendations'],
  ['/api/ai/learning-recommendations', { targetJobId: 'job-1' }, 'recommendations'],
  ['/api/ai/job-match', {}, 'matches'],
  ['/api/ai/job-readiness', { jobId: 'job-1' }, 'overall_readiness'],
  ['/api/ai/career-roadmap', { targetCareerId: 'career-1' }, 'roadmap'],
  ['/api/ai/feedback', { recommendationId: 'recommendation-1', isUseful: true }, 'id'],
  ['/api/ai/interview-preparation', { jobId: 'job-1' }, 'readinessScore'],
  ['/api/ai/interview-feedback', { answer: 'I would first review the data, then validate the results with SQL.' }, 'scores'],
  ['/api/ai/skill-evidence', { skillName: 'SQL' }, 'trust'],
  ['/api/ai/evidence-graph', {}, 'skills'],
  ['/api/ai/career-simulation', { targetCareerId: 'career-1', completedSkills: ['Statistics'] }, 'projected'],
]

test('all missing AI POST endpoints are registered', () => {
  const { handlers } = createHarness()
  assert.deepEqual(AI_POST_ROUTES.map((route) => `POST ${route}`), Object.keys(handlers))
})

for (const [route, body, expectedField] of validCalls) {
  test(`${route} accepts valid input and returns ${expectedField}`, async () => {
    const { call } = createHarness()
    const response = await call(route, body)
    assert.equal(response.status, 200)
    assert.equal(response.payload.ok, true)
    assert.ok(Object.hasOwn(response.payload.data, expectedField))
  })

  test(`${route} rejects a non-object request body`, async () => {
    const { call } = createHarness()
    const response = await call(route, [])
    assert.equal(response.status, 400)
    assert.equal(response.payload.ok, false)
    assert.match(response.payload.error, /JSON object/)
  })
}

test('AI endpoints reject unauthenticated requests', async () => {
  const { call } = createHarness({ authenticated: false })
  const response = await call('/api/ai/job-match', {})
  assert.equal(response.status, 401)
  assert.equal(response.payload.ok, false)
})

test('AI endpoints reject requests that attempt to access another student profile', async () => {
  const { call } = createHarness()
  const response = await call('/api/ai/job-match', { studentId: 'another-student' })
  assert.equal(response.status, 403)
  assert.equal(response.payload.ok, false)
})

test('AI endpoints reject employer accounts', async () => {
  const { call } = createHarness({ role: 'employer' })
  const response = await call('/api/ai/job-match', {})
  assert.equal(response.status, 403)
  assert.equal(response.payload.ok, false)
})

test('employer match analysis recalculates and persists an application match', async () => {
  const { call, getSavedMatches } = createHarness({ role: 'employer' })
  const response = await call('/api/employer/job-match-analysis', { applicationIds: ['application-1'] })

  assert.equal(response.status, 200)
  assert.equal(response.payload.data.matches[0].calculation_status, 'completed')
  assert.equal(getSavedMatches().userId, 'student-1')
  assert.equal(getSavedMatches().matches[0].calculation_status, 'completed')
})

test('employer match analysis rejects student accounts and applications outside employer ownership', async () => {
  const student = await createHarness().call('/api/employer/job-match-analysis', { applicationIds: ['application-1'] })
  const notOwned = await createHarness({ role: 'employer', employerApplications: [] })
    .call('/api/employer/job-match-analysis', { applicationIds: ['application-1'] })

  assert.equal(student.status, 403)
  assert.equal(notOwned.status, 404)
})

test('student job match refresh reuses completed analyses without recalculating or rewriting them', async () => {
  let calculations = 0
  const storedMatch = {
    job_id: 'job-1',
    student_id: 'student-1',
    match_score: 77,
    calculation_status: 'completed',
    calculated_at: '2026-02-01T10:00:00.000Z',
    explanation: 'Saved analysis',
  }
  const { call, getSavedMatches } = createHarness({
    storedMatches: [storedMatch],
    scoring: { calculateJobMatches: () => { calculations += 1; return { matches: [] } } },
  })
  const response = await call('/api/ai/job-match', {})

  assert.equal(response.status, 200)
  assert.equal(response.payload.data.matches[0].match_score, 77)
  assert.equal(response.payload.data.matches[0].title, requiredJob.title)
  assert.deepEqual(response.payload.data.matches[0].factors, {})
  assert.equal(calculations, 0)
  assert.equal(getSavedMatches(), null)
})

test('student job match refresh recalculates pending analyses after relevant evidence changes', async () => {
  let calculations = 0
  const { call, getSavedMatches } = createHarness({
    storedMatches: [{
      job_id: 'job-1',
      student_id: 'student-1',
      match_score: 40,
      calculation_status: 'pending',
      calculation_reason: 'Candidate evidence changed.',
    }],
    scoring: {
      calculateJobMatches: () => {
        calculations += 1
        return { matches: [{ job_id: 'job-1', match_score: 82, explanation: 'Updated evidence.' }] }
      },
    },
  })
  const response = await call('/api/ai/job-match', {})

  assert.equal(response.status, 200)
  assert.equal(calculations, 1)
  assert.equal(response.payload.data.matches[0].match_score, 82)
  assert.equal(getSavedMatches().matches[0].calculation_status, 'completed')
})

test('job match calculation falls back when an injected scorer omits eligible jobs', async () => {
  const { call, getSavedMatches } = createHarness({
    storedMatches: [{
      job_id: 'job-1',
      student_id: 'student-1',
      calculation_status: 'pending',
    }],
    scoring: { calculateJobMatches: () => ({ matches: [] }) },
  })
  const response = await call('/api/ai/job-match', {})

  assert.equal(response.status, 200)
  assert.deepEqual(response.payload.data.matches.map((match) => match.job_id), ['job-1'])
  assert.deepEqual(getSavedMatches().matches.map((match) => match.job_id), ['job-1'])
})

test('evidence graph returns linked sources and keeps unverified records unscored', async () => {
  const data = {
    ...studentData,
    skills: [],
    assessments: [{ id: 'result-1', assessment_id: 'assessment-1', percentage: 82, assessments: { title: 'JavaScript test', skills: { name: 'JavaScript' } } }],
    projects: [{ id: 'project-1', title: 'Portfolio project', project_skills: [{ skills: { name: 'JavaScript' } }] }],
    certificates: [{ id: 'certificate-1', title: 'JavaScript certificate', file_path: 'student/certificate.pdf', verification_status: 'verified', certificate_skills: [{ skills: { name: 'JavaScript' } }] }],
    skillEvidence: [{ id: 'evidence-1', skillName: 'JavaScript', evidence_type: 'other', evidence_strength: 100, verification_status: 'pending' }],
  }
  const { call } = createHarness({ data })
  const response = await call('/api/ai/evidence-graph', {})
  const entry = response.payload.data.skills.find((item) => item.skillName === 'JavaScript')

  assert.equal(response.status, 200)
  assert.equal(entry.trust.score, 82)
  assert.equal(entry.evidence.find((item) => item.type === 'project').score, null)
  assert.equal(entry.evidence.find((item) => item.type === 'certificate').evidenceStatus, 'uploaded_not_verified')
  assert.equal(entry.evidence.find((item) => item.type === 'other').score, null)
})

test('career simulation rejects skills that are not required by the selected career', async () => {
  const { call } = createHarness()
  const response = await call('/api/ai/career-simulation', {
    targetCareerId: 'career-1',
    completedSkills: ['Unrelated skill'],
  })

  test('skills-gap endpoint compares current and required proficiency levels', async () => {
    const { call } = createHarness()
    const response = await call('/api/ai/skills-gap', { targetCareerId: 'career-1' })
    const statistics = response.payload.data.gaps.find((item) => item.name === 'Statistics')

    assert.equal(response.status, 200)
    assert.equal(statistics.gap, 'missing')
    assert.equal(statistics.currentLevel, 'Not assessed')
    assert.equal(statistics.requiredLevel, 'Intermediate')
    assert.equal(statistics.severity, 'high')
  })

  test('skills-gap endpoint reports present skills whose proficiency is below the requirement', async () => {
    const data = {
      ...studentData,
      skills: [{ name: 'SQL', level: 'intermediate' }],
    }
    const { call } = createHarness({ data })
    const response = await call('/api/ai/skills-gap', { targetJobId: 'job-1' })
    const sql = response.payload.data.gaps.find((item) => item.name === 'SQL')

    assert.equal(response.status, 200)
    assert.equal(sql.gap, 'insufficient')
    assert.equal(sql.currentLevel, 'Intermediate')
    assert.equal(sql.requiredLevel, 'Advanced')
    assert.equal(sql.severity, 'medium')
  })

  test('learning recommendations link only to matched database resources', async () => {
    const { call } = createHarness()
    const response = await call('/api/ai/learning-recommendations', { targetCareerId: 'career-1' })
    const statistics = response.payload.data.recommendations.find((item) => item.skill === 'Statistics')

    assert.equal(response.status, 200)
    assert.equal(statistics.resource_id, 'resource-1')
    assert.equal(statistics.resource_url, 'https://example.edu/statistics')
    assert.equal(statistics.title, 'Statistics course')
  })

  test('skills-gap and learning recommendations handle profiles without skills or assessments', async () => {
    const data = { ...studentData, skills: [], assessments: [], resources: [] }
    const { call } = createHarness({ data })
    const gapsResponse = await call('/api/ai/skills-gap', { targetCareerId: 'career-1' })
    const recommendationsResponse = await call('/api/ai/learning-recommendations', { targetCareerId: 'career-1' })

    assert.equal(gapsResponse.status, 200)
    assert.equal(gapsResponse.payload.data.gaps.length, 2)
    assert.ok(gapsResponse.payload.data.gaps.every((item) => item.gap === 'missing'))
    assert.equal(recommendationsResponse.status, 200)
    assert.ok(recommendationsResponse.payload.data.recommendations.every((item) => item.resource_id === null && !item.resource_url))
  })

  test('learning recommendations reject requests without a career or job target', async () => {
    const { call } = createHarness()
    const response = await call('/api/ai/learning-recommendations', {})
    assert.equal(response.status, 400)
    assert.match(response.payload.error, /Choose a career or job/)
  })

  test('job matching persists explained results and filters invalid or ineligible opportunities', async () => {
    const data = {
      ...studentData,
      profile: { role: 'student', student_profiles: [{ education_level: 'Bachelor', candidate_type: 'student' }] },
    }
    const jobs = [
      { ...requiredJob, employment_type: 'internship' },
      { ...requiredJob, id: 'job-fulltime', employment_type: 'full_time' },
      { ...requiredJob, id: 'job-graduate', employment_type: 'graduate' },
      { ...requiredJob, id: 'job-closed', employment_type: 'internship', status: 'closed' },
      { ...requiredJob, id: 'job-expired', employment_type: 'internship', application_deadline: '2000-01-01' },
    ]
    const { call, getSavedMatches } = createHarness({ data, jobs })
    const response = await call('/api/ai/job-match', {})
    const matches = response.payload.data.matches

    assert.equal(response.status, 200)
    assert.deepEqual(matches.map((item) => item.job_id), ['job-1', 'job-fulltime'])
    assert.ok(Object.hasOwn(matches[0].factors, 'skills'))
    assert.ok(Object.hasOwn(matches[0], 'strong_matches'))
    assert.ok(Object.hasOwn(matches[0], 'developing_skills'))
    assert.ok(Object.hasOwn(matches[0], 'missing_requirements'))
    assert.deepEqual(getSavedMatches().matches.map((item) => item.job_id), ['job-1', 'job-fulltime'])
    assert.equal(getSavedMatches().userId, 'student-1')
  })

  test('job matching permits graduate candidates to see graduate-eligible published job types', async () => {
    const data = {
      ...studentData,
      profile: { role: 'graduate', student_profiles: [{ candidate_type: 'graduate' }] },
    }
    const jobs = [
      { ...requiredJob, employment_type: 'full_time' },
      { ...requiredJob, id: 'student-internship', employment_type: 'internship' },
    ]
    const { call } = createHarness({ role: 'graduate', data, jobs })
    const response = await call('/api/ai/job-match', {})
    assert.deepEqual(response.payload.data.matches.map((item) => item.job_id), ['job-1', 'student-internship'])
  })
  assert.equal(response.status, 400)
  assert.match(response.payload.error, /Only skills required/)
})
