import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { validateCompanyLogoFile } from '../utils/companyLogoValidation'
import {
  validateEmployerVerificationDocument,
  validateEmployerVerificationFields,
} from '../utils/employerVerificationValidation'

const COMPANY_LOGO_BUCKET = 'company-logos'
const EMPLOYER_VERIFICATION_BUCKET = 'employer-verification-documents'

const EDITABLE_COMPANY_FIELDS = [
  'company_name',
  'industry',
  'description',
  'website',
  'email',
  'phone',
  'country',
  'district',
  'city',
  'company_size',
]

function getCompanyLogoPath(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    const prefix = `/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/`
    return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null
  } catch {
    return null
  }
}

export const companyService = {
  async getProfile(employerId) {
    const { data, error } = await supabase.from('employer_profiles').select('*').eq('id', employerId).single()
    return requireData(data, error, 'Unable to load the company profile.')
  },

  async getVerificationSubmissions(employerId) {
    const { data, error } = await supabase.from('employer_verification_submissions')
      .select('id, employer_id, legal_business_name, registration_number, registration_authority, registration_country, representative_name, representative_role, document_path, status, reviewer_feedback, submitted_at, reviewed_at, reviewed_by, employer_verification_events(id, actor_id, action, note, created_at)')
      .eq('employer_id', employerId)
      .order('submitted_at', { ascending: false })
    const submissions = requireData(data, error, 'Unable to load employer verification history.')
    return Promise.all(submissions.map(async (submission) => {
      const { data: signedFile, error: signedFileError } = await supabase.storage
        .from(EMPLOYER_VERIFICATION_BUCKET)
        .createSignedUrl(submission.document_path, 600)
      if (signedFileError) throw new Error(`Unable to open the verification document: ${signedFileError.message}`)
      return { ...submission, document_url: signedFile.signedUrl }
    }))
  },

  async submitVerification(employerId, fields, file) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'Unable to verify the employer account.')
    if (!user || user.id !== employerId) throw new Error('Only the signed-in employer can submit company verification.')

    const fieldsValidation = validateEmployerVerificationFields(fields)
    if (!fieldsValidation.valid) throw new Error(fieldsValidation.message)
    const fileValidation = validateEmployerVerificationDocument(file)
    if (!fileValidation.valid) throw new Error(fileValidation.message)

    const documentPath = `${employerId}/${crypto.randomUUID()}.${fileValidation.extension}`
    const { error: uploadError } = await supabase.storage.from(EMPLOYER_VERIFICATION_BUCKET).upload(documentPath, file, {
      contentType: file.type,
      cacheControl: '600',
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message || 'Unable to upload the verification document.')

    const { data: signedFile, error: signedFileError } = await supabase.storage
      .from(EMPLOYER_VERIFICATION_BUCKET)
      .createSignedUrl(documentPath, 600)
    if (signedFileError) {
      const { error: cleanupError } = await supabase.storage.from(EMPLOYER_VERIFICATION_BUCKET).remove([documentPath])
      if (cleanupError) {
        throw new Error(`Unable to prepare the verification document link. The private upload could not be cleaned up: ${cleanupError.message}`, { cause: signedFileError })
      }
      throw new Error(`Unable to prepare the verification document link: ${signedFileError.message}`)
    }

    const payload = Object.fromEntries([
      'legal_business_name',
      'registration_number',
      'registration_authority',
      'registration_country',
      'representative_name',
      'representative_role',
    ].map((field) => [field, String(fields[field]).trim()]))
    const { data, error } = await supabase.from('employer_verification_submissions')
      .insert({ ...payload, employer_id: employerId, document_path: documentPath })
      .select('id, employer_id, legal_business_name, registration_number, registration_authority, registration_country, representative_name, representative_role, document_path, status, reviewer_feedback, submitted_at, reviewed_at, reviewed_by')
      .single()

    if (error) {
      const { error: cleanupError } = await supabase.storage.from(EMPLOYER_VERIFICATION_BUCKET).remove([documentPath])
      if (cleanupError) {
        throw new Error(`${error.message || 'Unable to submit employer verification.'} The uploaded private document could not be cleaned up: ${cleanupError.message}`, { cause: error })
      }
      throw new Error(error.message || 'Unable to submit employer verification.')
    }
    return { ...data, document_url: signedFile.signedUrl, employer_verification_events: [] }
  },

  async updateProfile(employerId, changes) {
    const payload = Object.fromEntries(EDITABLE_COMPANY_FIELDS
      .filter((field) => Object.hasOwn(changes, field))
      .map((field) => [field, typeof changes[field] === 'string' ? changes[field].trim() || null : changes[field]]))
    const { data, error } = await supabase.from('employer_profiles').update(payload).eq('id', employerId).select().single()
    return requireData(data, error, 'Unable to update the company profile.')
  },

  async uploadLogo(employerId, file) {
    const validation = validateCompanyLogoFile(file)
    if (!validation.valid) throw new Error(validation.message)

    const { data: currentProfile, error: profileError } = await supabase.from('employer_profiles')
      .select('logo_url')
      .eq('id', employerId)
      .single()
    if (profileError) throw new Error(profileError.message || 'Unable to load the current company logo.')

    const filePath = `${employerId}/logo/${crypto.randomUUID()}.${validation.extension}`
    const { error: uploadError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).upload(filePath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message || 'Unable to upload the company logo.')

    const { data: { publicUrl } } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(filePath)
    let updatedProfile
    try {
      const { data, error } = await supabase.from('employer_profiles')
        .update({ logo_url: publicUrl })
        .eq('id', employerId)
        .select()
        .single()
      updatedProfile = requireData(data, error, 'Unable to save the uploaded company logo.')
    } catch (saveError) {
      const { error: cleanupError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([filePath])
      if (cleanupError) {
        throw new Error(`${saveError.message} The uploaded image could not be cleaned up: ${cleanupError.message}`, { cause: saveError })
      }
      throw saveError
    }

    const previousPath = getCompanyLogoPath(currentProfile.logo_url)
    if (previousPath) {
      const { error: cleanupError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previousPath])
      if (cleanupError) throw new Error(`Company logo updated, but the previous stored image could not be deleted: ${cleanupError.message}`)
    }
    return updatedProfile
  },

  async removeLogo(employerId, currentLogoUrl) {
    const { data, error } = await supabase.from('employer_profiles')
      .update({ logo_url: null })
      .eq('id', employerId)
      .select()
      .single()
    const updatedProfile = requireData(data, error, 'Unable to remove the company logo.')
    const path = getCompanyLogoPath(currentLogoUrl)
    if (path) {
      const { error: storageError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([path])
      if (storageError) throw new Error(`Company logo removed from your profile, but its stored image could not be deleted: ${storageError.message}`)
    }
    return updatedProfile
  },
}
