import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createPortfolioRepository } from '../src/services/portfolioRepository.js'

class FakeQuery {
  constructor(client, table) {
    this.client = client
    this.table = table
    this.filters = []
    this.fields = '*'
    this.operation = 'select'
    this.payload = null
    this.orderBy = null
  }

  select(fields) {
    this.fields = fields
    return this
  }

  eq(field, value) {
    this.filters.push([field, value])
    return this
  }

  order(field, options) {
    this.orderBy = { field, ascending: options?.ascending !== false }
    return this
  }

  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  upsert(payload) {
    this.operation = 'upsert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  single() {
    return this.execute(true)
  }

  maybeSingle() {
    return this.execute(true)
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async execute(single = false) {
    if (this.client.failedTables.has(this.table)) {
      return { data: null, error: new Error(`Database read failed for ${this.table}.`) }
    }

    const records = this.client.tables[this.table]
    if (this.operation !== 'select') {
      if (this.client.role !== 'student' || this.payload.student_id !== this.client.userId) {
        return { data: null, error: new Error('Row-level security denied the write.') }
      }
      if (this.operation === 'update') {
        const existingIndex = records.findIndex((record) => (
          this.filters.every(([field, value]) => record[field] === value)
          && record.student_id === this.client.userId
        ))
        if (existingIndex < 0) return { data: null, error: new Error('Row-level security denied the update.') }
        records[existingIndex] = { ...records[existingIndex], ...this.payload }
        return { data: records[existingIndex], error: null }
      }
      const existingIndex = this.operation === 'upsert'
        ? records.findIndex((record) => record.id === this.payload.id)
        : -1
      if (existingIndex >= 0) records[existingIndex] = { ...records[existingIndex], ...this.payload }
      else records.push(this.payload)
      return { data: this.payload, error: null }
    }

    let rows = records.filter((record) => this.filters.every(([field, value]) => record[field] === value))
    if (this.client.role === 'student') rows = rows.filter((record) => record.student_id === this.client.userId)
    if (this.client.role === 'employer') rows = rows.filter((record) => this.client.allowedStudentIds.has(record.student_id))
    if (this.orderBy) {
      const direction = this.orderBy.ascending ? 1 : -1
      rows.sort((left, right) => String(left[this.orderBy.field] || '').localeCompare(String(right[this.orderBy.field] || '')) * direction)
    }

    if (!this.fields.includes('*')) {
      const selectedFields = this.fields.split(',').map((field) => field.trim())
      rows = rows.map((row) => Object.fromEntries(selectedFields.filter((field) => field in row).map((field) => [field, row[field]])))
    }
    return { data: single ? rows[0] || null : rows, error: null }
  }
}

function createFakeClient(tables, { role, userId, allowedStudentIds = [], failedTables = [] }) {
  return {
    tables,
    role,
    userId,
    allowedStudentIds: new Set(allowedStudentIds),
    failedTables: new Set(failedTables),
    from(table) {
      return new FakeQuery(this, table)
    },
  }
}

const sourceFiles = await Promise.all([
  readFile(new URL('../src/services/studentService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/skillService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/internshipService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/candidateService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/student/StudentModulePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/student/CvPortfolioAnalyzerPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
])

test('student-created project and certificate records are returned consistently to student and recruiter views', async () => {
  const tables = { portfolios: [], projects: [], certificates: [] }
  const studentRepository = createPortfolioRepository(createFakeClient(tables, {
    role: 'student',
    userId: 'student-1',
  }))
  const createdProject = {
    id: 'project-1',
    student_id: 'student-1',
    title: 'Malawi Crop Tracker',
    description: 'A project record',
    status: 'completed',
    image_path: 'student-1/projects/private.png',
  }
  const createdCertificate = {
    id: 'certificate-1',
    student_id: 'student-1',
    title: 'Data Analysis',
    issuer: 'Skill Academy',
    verification_status: 'pending',
    file_path: 'student-1/certificates/private.pdf',
  }
  await studentRepository.saveProject(createdProject)
  await studentRepository.saveCertificate(createdCertificate)

  const studentEvidence = await studentRepository.getEvidence('student-1')
  const recruiterRepository = createPortfolioRepository(createFakeClient(tables, {
    role: 'employer',
    userId: 'employer-1',
    allowedStudentIds: ['student-1'],
  }))
  const recruiterEvidence = await recruiterRepository.getRecruitmentEvidence('student-1')

  assert.deepEqual(studentEvidence.projects.map(({ id }) => id), ['project-1'])
  assert.deepEqual(studentEvidence.certificates.map(({ id }) => id), ['certificate-1'])
  assert.deepEqual(recruiterEvidence.projects.map(({ id }) => id), ['project-1'])
  assert.deepEqual(recruiterEvidence.certificates.map(({ id }) => id), ['certificate-1'])
  assert.equal(recruiterEvidence.projects[0].image_path, undefined)
  assert.equal(recruiterEvidence.certificates[0].file_path, undefined)
})

test('employer evidence reads remain restricted to authorized student IDs', async () => {
  const tables = {
    portfolios: [],
    projects: [{ id: 'private-project', student_id: 'student-2', title: 'Private' }],
    certificates: [{ id: 'private-certificate', student_id: 'student-2', title: 'Private' }],
  }
  const recruiterRepository = createPortfolioRepository(createFakeClient(tables, {
    role: 'employer',
    userId: 'employer-1',
    allowedStudentIds: ['student-1'],
  }))

  const evidence = await recruiterRepository.getRecruitmentEvidence('student-2')
  assert.deepEqual(evidence, { projects: [], certificates: [] })
})

test('student resubmission only returns a requires-correction certificate to pending', async () => {
  const tables = {
    portfolios: [],
    projects: [],
    certificates: [
      { id: 'correction-1', student_id: 'student-1', verification_status: 'requires_correction' },
      { id: 'pending-1', student_id: 'student-1', verification_status: 'pending' },
      { id: 'other-student', student_id: 'student-2', verification_status: 'requires_correction' },
    ],
  }
  const repository = createPortfolioRepository(createFakeClient(tables, {
    role: 'student',
    userId: 'student-1',
  }))

  const resubmitted = await repository.resubmitCertificate('correction-1', {
    student_id: 'student-1',
    title: 'Updated credential',
    file_path: 'student-1/certificates/replacement.pdf',
  })
  assert.equal(resubmitted.verification_status, 'pending')
  assert.equal(resubmitted.verification_notes, null)
  await assert.rejects(repository.resubmitCertificate('pending-1', {
    student_id: 'student-1',
    file_path: 'student-1/certificates/other.pdf',
  }), /update/)
  await assert.rejects(repository.resubmitCertificate('other-student', {
    student_id: 'student-1',
    file_path: 'student-1/certificates/not-owned.pdf',
  }), /update/)
})

test('empty evidence is distinct from a failed database read', async () => {
  const emptyRepository = createPortfolioRepository(createFakeClient({
    portfolios: [],
    projects: [],
    certificates: [],
  }, { role: 'student', userId: 'student-1' }))
  const emptyEvidence = await emptyRepository.getEvidence('student-1')
  assert.deepEqual(emptyEvidence, { portfolio: null, projects: [], certificates: [] })

  const failingRepository = createPortfolioRepository(createFakeClient({
    portfolios: [],
    projects: [],
    certificates: [],
  }, { role: 'student', userId: 'student-1', failedTables: ['projects'] }))
  await assert.rejects(failingRepository.getEvidence('student-1'), /Database read failed for projects/)
})

test('all portfolio consumers use the canonical evidence service', () => {
  const [student, skills, internships, candidates, portfolioPage, cvPage, server] = sourceFiles

  assert.equal(student.match(/portfolioService\.getEvidence\(studentId\)/g)?.length, 3)
  assert.match(skills, /portfolioService\.getEvidence\(userId\)/)
  assert.match(internships, /portfolioService\.getEvidence\(studentId\)/)
  assert.match(candidates, /portfolioService\.getRecruitmentEvidence\(application\.student_id\)/)
  assert.match(portfolioPage, /portfolioService\.getOverview\(userId\)/)
  assert.match(cvPage, /portfolioService\.getOverview\(user\.id\)/)
  assert.match(server, /portfolioRepository\.getEvidence\(userId\)/)
  assert.doesNotMatch(student, /from\(['"](?:projects|certificates|portfolios)['"]\)/)
  assert.doesNotMatch(skills, /from\(['"](?:projects|certificates|portfolios)['"]\)/)
  assert.doesNotMatch(internships, /from\(['"](?:projects|certificates|portfolios)['"]\)/)
  assert.doesNotMatch(candidates, /from\(['"](?:projects|certificates|portfolios)['"]\)/)
  assert.match(portfolioPage, /Promise\.allSettled\(\[\s*portfolioService\.getOverview\(userId\),\s*skillService\.listSkills\(\)/)
})
