export const MAX_PROFILE_PICTURE_SIZE = 2 * 1024 * 1024
export const PROFILE_PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function buildInitials(name = '') {
  const cleaned = String(name || '').trim()
  if (!cleaned) return 'U'

  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function validateProfilePictureFile(file) {
  if (!file) {
    return { valid: false, message: 'Please choose an image to upload.' }
  }

  if (!PROFILE_PICTURE_TYPES.includes(file.type)) {
    return { valid: false, message: 'Please upload a JPG, PNG, or WEBP image.' }
  }

  if (file.size > MAX_PROFILE_PICTURE_SIZE) {
    return { valid: false, message: 'The image is too large. Please choose a smaller image.' }
  }

  return { valid: true }
}

export function normalizeAvatarUrl(url) {
  if (!url) return ''
  return String(url).trim()
}
