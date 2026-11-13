import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { portfolioService } from './portfolioService'
import { skillService } from './skillService'
import { matchingService } from './matchingService'
import { filterRecommendationSkillNames, filterSelectableSkillRows } from '../utils/skillCatalog'

const MATCH_SELECT = 'job_id, student_id, match_score, skills_score, career_target_score, education_score, assessment_score, project_score, portfolio_score, certificate_score, experience_score, strong_skills, developing_skills, missing_skills, explanation, calculation_status, calculation_reason, calculated_at'

function filterCandidateMatch(match, visibleSkills) {
  const filtered = filterRecommendationSkillNames({ ...match, reason: match.explanation }, visibleSkills)
  const { reason, ...result } = filtered
  return { ...result, explanation: reason }
}

async function loadMatches(jobIds, studentIds) {
  const { data, error } = await supabase
    .from('job_matches')
    .select(MATCH_SELECT)
    .in('job_id', jobIds)
    .in('student_id', studentIds)
  return requireData(data, error, 'Unable to load candidate match information.')
}

async function refreshApplications(applications, matches) {
  const matchesByApplication = new Map(matches.map((match) => [
    `${match.job_id}:${match.student_id}`,
    match,
  ]))
  const applicationIds = applications
    .filter((application) => {
      const match = matchesByApplication.get(`${application.job_id}:${application.student_id}`)
      return !match || !['completed', 'unavailable'].includes(match.calculation_status)
    })
    .map((application) => application.id)

  if (!applicationIds.length) return false
  for (let index = 0; index < applicationIds.length; index += 100) {
    await matchingService.refreshEmployerApplicationMatches(applicationIds.slice(index, index + 100))
  }
  return true
}

export const candidateService = {
  async list(employerId) {
    const { data, error } = await supabase
      .from('applications')
      .select('*, jobs!inner(id, title, employer_id), student_profiles(id, profiles(full_name, email, avatar_url), phone, institution, programme, education_level)')
      .eq('jobs.employer_id', employerId)
      .order('applied_at', { ascending: false })
    const applications = requireData(data, error, 'Unable to load candidates.')
    if (!applications.length) return applications

    const jobIds = [...new Set(applications.map((application) => application.job_id))]
    const studentIds = [...new Set(applications.map((application) => application.student_id))]
    const [matches, visibleSkills] = await Promise.all([
      loadMatches(jobIds, studentIds),
      skillService.listSkills(),
    ])
    let refreshed = false
    let matchRefreshError = ''
    try {
      refreshed = await refreshApplications(applications, matches)
    } catch (error) {
      matchRefreshError = error instanceof Error ? error.message : 'Match analysis could not be refreshed.'
    }
    const matchRows = refreshed ? await loadMatches(jobIds, studentIds) : matches
    const matchesByApplication = new Map(matchRows.map((match) => [
      `${match.job_id}:${match.student_id}`,
      filterCandidateMatch(match, visibleSkills),
    ]))
    return applications.map((application) => ({
      ...application,
      match_refresh_error: matchRefreshError,
      job_matches: matchesByApplication.has(`${application.job_id}:${application.student_id}`)
        ? [matchesByApplication.get(`${application.job_id}:${application.student_id}`)]
        : [],
    }))
  },

  async getCandidate(applicationId, employerId) {
    const { data, error } = await supabase
      .from('applications')
      .select('*, jobs!inner(id, title, employer_id), application_events(*), application_stage_progress(*, recruitment_stages(name, sequence_order)), student_profiles(id, phone, institution, programme, education_level, profiles(full_name, email, avatar_url, user_skills(*, skills(*))), education(*), assessment_results(*, assessments(title, assessment_type)))')
      .eq('id', applicationId)
      .eq('jobs.employer_id', employerId)
      .single()
    const application = requireData(data, error, 'Unable to load this candidate.')

    const [initialMatches, portfolioEvidence, visibleSkills] = await Promise.all([
      loadMatches([application.job_id], [application.student_id]),
      portfolioService.getRecruitmentEvidence(application.student_id),
      skillService.listSkills(),
    ])
    let refreshed = false
    let matchRefreshError = ''
    try {
      refreshed = await refreshApplications([application], initialMatches)
    } catch (refreshError) {
      matchRefreshError = refreshError instanceof Error
        ? refreshError.message
        : 'Match analysis could not be refreshed.'
    }
    const matchRows = refreshed ? await loadMatches([application.job_id], [application.student_id]) : initialMatches
    application.match_refresh_error = matchRefreshError
    application.job_matches = matchRows
      .map((match) => filterCandidateMatch(match, visibleSkills))
    application.student_profiles = {
      ...application.student_profiles,
      projects: portfolioEvidence.projects,
      certificates: portfolioEvidence.certificates,
    }
    const studentProfile = application.student_profiles
    const profile = studentProfile?.profiles
    const filterProfileSkills = (profileRecord) => profileRecord
      ? { ...profileRecord, user_skills: filterSelectableSkillRows(profileRecord.user_skills || []) }
      : profileRecord
    if (studentProfile) {
      application.student_profiles = {
        ...studentProfile,
        profiles: Array.isArray(profile)
          ? profile.map(filterProfileSkills)
          : filterProfileSkills(profile),
      }
    }
    return application
  },
}
