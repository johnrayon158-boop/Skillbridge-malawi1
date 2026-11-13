import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { formatApplicationStatus, normalizeApplicationStatus } from '../utils/applicationStatus.js'
import { APPLICATION_LIFECYCLE } from '../constants/database.js'

export { formatApplicationStatus, normalizeApplicationStatus }

export const applicationService = {
  async getApplications(studentId) {
    const { data, error } = await supabase.from('applications').select('*, jobs(*, employer_profiles(*)), application_events(*), interviews(id, status, scheduled_at)').eq('student_id', studentId).order('updated_at', { ascending: false })
    const applications = requireData(data, error, 'Unable to load applications.')
    return (applications || []).map((item) => ({
      ...item,
      status: normalizeApplicationStatus(item.status),
      display_status: formatApplicationStatus(item.status),
    }))
  },

  async getApplication(applicationId, studentId) {
    const { data, error } = await supabase.from('applications').select('*, jobs(*, employer_profiles(*)), application_events(*), interviews(*), offers(*)').eq('id', applicationId).eq('student_id', studentId).single()
    const application = requireData(data, error, 'Unable to load the application.')
    return application ? { ...application, status: normalizeApplicationStatus(application.status), display_status: formatApplicationStatus(application.status) } : application
  },

  async apply(application) {
    const status = normalizeApplicationStatus(application.status || 'applied')
    if (!APPLICATION_LIFECYCLE.includes(status)) throw new Error('Select a valid application status.')
    const payload = { ...application, status }
    const { data, error } = await supabase.from('applications').insert(payload).select().single()
    return requireData(data, error, 'Unable to submit the application.')
  },

  async recordApplicationEvent(applicationId, event) {
    const payload = {
      application_id: applicationId,
      event_type: event.event_type || event.type || 'application_update',
      title: event.title || 'Application updated',
      description: event.description || '',
      event_date: event.event_date || new Date().toISOString(),
      created_by: event.created_by || null,
    }

    const { data, error } = await supabase.from('application_events').insert(payload).select().single()
    return requireData(data, error, 'Unable to record the application event.')
  },

  async withdraw(applicationId) {
    const { data, error } = await supabase.rpc('student_withdraw_application', {
      p_application_id: applicationId,
    })
    if (error?.code === 'PGRST202') {
      throw new Error('The application withdrawal function is missing from Supabase. Apply the latest migration, then try again.')
    }
    return requireData(data, error, 'Unable to withdraw this application.')
  },
}
