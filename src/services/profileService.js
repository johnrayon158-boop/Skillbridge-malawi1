import { supabase } from './supabase'
import { requireData } from './serviceUtils'
import { validateProfilePictureFile } from '../utils/avatar'
import { buildStudentProfileChanges } from '../utils/careerInterests.js'

const EDITABLE_EMPLOYER_FIELDS = [
  'company_name',
  'industry',
  'description',
  'website',
  'email',
  'phone',
  'country',
  'district',
  'city',
  'logo_url',
  'company_size',
]

function getStorageObjectPathFromUrl(url) {
  if (!url) return null

  const trimmed = url.trim()

  try {
    const parsed = new URL(trimmed)
    const pathname = decodeURIComponent(parsed.pathname)
    const publicPrefix = '/storage/v1/object/public/profile-pictures/'
    if (pathname.startsWith(publicPrefix)) {
      return pathname.slice(publicPrefix.length)
    }
  } catch {
    // Ignore parsing failures and fall back to string cleanup below.
  }

  const withoutHost = trimmed.replace(/^https?:\/\/[^/]+\//, '')
  const publicPrefix = 'storage/v1/object/public/profile-pictures/'
  if (withoutHost.startsWith(publicPrefix)) {
    return withoutHost.slice(publicPrefix.length)
  }

  if (withoutHost.startsWith('profile-pictures/')) {
    return withoutHost.replace(/^profile-pictures\//, '')
  }

  return withoutHost
}

export const profileService = {
  async getProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*, student_profiles(*), employer_profiles(*)').eq('id', userId).single()
    return requireData(data, error, 'Unable to load the profile.')
  },

  async updateProfile(userId, changes) {
    const safeChanges = { ...changes }
    delete safeChanges.role
    delete safeChanges.id
    const { data, error } = await supabase.from('profiles').update(safeChanges).eq('id', userId).select().single()
    return requireData(data, error, 'Unable to update the profile.')
  },

  async updateStudentProfile(userId, changes) {
    const { data, error } = await supabase.from('student_profiles').update(buildStudentProfileChanges(changes)).eq('id', userId).select().single()
    return requireData(data, error, 'Unable to update the student profile.')
  },

  async updateEmployerProfile(userId, changes) {
    const payload = Object.fromEntries(EDITABLE_EMPLOYER_FIELDS
      .filter((field) => Object.hasOwn(changes, field))
      .map((field) => [field, typeof changes[field] === 'string' ? changes[field].trim() || null : changes[field]]))
    const { data, error } = await supabase.from('employer_profiles').update(payload).eq('id', userId).select().single()
    return requireData(data, error, 'Unable to update the employer profile.')
  },

  async uploadAvatar(userId, file) {
    const validation = validateProfilePictureFile(file)
    if (!validation.valid) {
      throw new Error(validation.message)
    }

    const extension = (file.name?.split('.').pop() || 'png').toLowerCase()
    const filePath = `${userId}/profile.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      throw new Error(uploadError.message || 'Unable to upload the profile picture.')
    }

    const { data: { publicUrl } } = supabase.storage.from('profile-pictures').getPublicUrl(filePath)
    const { data, error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId).select().single()
    return requireData(data, error, 'Unable to update the profile picture.')
  },

  async deleteAvatar(userId) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single()

    if (profileError) {
      throw new Error(profileError.message || 'Unable to load the profile picture.')
    }

    if (profileData?.avatar_url) {
      const objectPath = getStorageObjectPathFromUrl(profileData.avatar_url)
      if (objectPath) {
        const { error: storageError } = await supabase.storage.from('profile-pictures').remove([objectPath])
        if (storageError) {
          throw new Error(storageError.message || 'Unable to remove the profile picture.')
        }
      }
    }

    const { data, error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId).select().single()
    return requireData(data, error, 'Unable to remove the profile picture.')
  },
}
