const STUDENT_PROJECT_SELECT = '*, project_skills(*, skills(*))'
const STUDENT_CERTIFICATE_SELECT = '*, certificate_skills(*, skills(*)), certificate_review_history(id, event_type, previous_status, new_status, reason, created_at)'
const RECRUITMENT_PROJECT_SELECT = 'id, title, description, project_type, status, repository_url, live_url, created_at, updated_at'
const RECRUITMENT_CERTIFICATE_SELECT = 'id, title, issuer, issue_date, expiry_date, credential_id, credential_url, verification_status'

function requireStudentId(studentId) {
  if (typeof studentId !== 'string' || !studentId.trim()) {
    throw new Error('A valid student ID is required to load portfolio evidence.')
  }
}

function requireResponse(response, message) {
  if (response.error) throw new Error(response.error.message || message)
  return response.data
}

export function createPortfolioRepository(client) {
  async function saveProject(project) {
    requireStudentId(project?.student_id)
    const response = await client.from('projects').upsert(project).select().single()
    return requireResponse(response, 'Unable to save the project.')
  }

  async function saveCertificate(certificate) {
    requireStudentId(certificate?.student_id)
    const response = await client.from('certificates').insert(certificate).select().single()
    return requireResponse(response, 'Unable to save the certificate.')
  }

  async function resubmitCertificate(id, certificate) {
    requireStudentId(certificate?.student_id)
    if (typeof id !== 'string' || !id.trim()) throw new Error('Choose a certificate to resubmit.')
    const response = await client.from('certificates')
      .update({
        ...certificate,
        verification_status: 'pending',
        verification_method: null,
        verified_by: null,
        verified_at: null,
        verification_notes: null,
      })
      .eq('id', id)
      .eq('student_id', certificate.student_id)
      .eq('verification_status', 'requires_correction')
      .select()
      .single()
    return requireResponse(response, 'Unable to resubmit this certificate. It may no longer require correction.')
  }

  async function getEvidence(studentId) {
    requireStudentId(studentId)
    const [portfolioResult, projectsResult, certificatesResult] = await Promise.all([
      client.from('portfolios')
        .select('*, portfolio_skills(*, skills(*))')
        .eq('student_id', studentId)
        .maybeSingle(),
      client.from('projects')
        .select(STUDENT_PROJECT_SELECT)
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false }),
      client.from('certificates')
        .select(STUDENT_CERTIFICATE_SELECT)
        .eq('student_id', studentId)
        .order('issue_date', { ascending: false }),
    ])

    return {
      portfolio: requireResponse(portfolioResult, 'Unable to load your portfolio.'),
      projects: requireResponse(projectsResult, 'Unable to load your projects.') || [],
      certificates: requireResponse(certificatesResult, 'Unable to load your certificates.') || [],
    }
  }

  async function getRecruitmentEvidence(studentId) {
    requireStudentId(studentId)
    const [projectsResult, certificatesResult] = await Promise.all([
      client.from('projects')
        .select(RECRUITMENT_PROJECT_SELECT)
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false }),
      client.from('certificates')
        .select(RECRUITMENT_CERTIFICATE_SELECT)
        .eq('student_id', studentId)
        .order('issue_date', { ascending: false }),
    ])

    return {
      projects: requireResponse(projectsResult, 'Unable to load recruitment-visible projects.') || [],
      certificates: requireResponse(certificatesResult, 'Unable to load recruitment-visible certificates.') || [],
    }
  }

  return { saveProject, saveCertificate, resubmitCertificate, getEvidence, getRecruitmentEvidence }
}
