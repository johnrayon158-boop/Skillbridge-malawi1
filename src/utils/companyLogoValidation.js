const MAX_COMPANY_LOGO_SIZE = 5 * 1024 * 1024

const COMPANY_LOGO_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
})

export function validateCompanyLogoFile(file) {
  if (!file) return { valid: false, message: 'Choose an image for your company logo.' }
  const extension = COMPANY_LOGO_EXTENSIONS[file.type]
  if (!extension) return { valid: false, message: 'Company logos must be PNG, JPEG, or WebP images.' }
  if (file.size > MAX_COMPANY_LOGO_SIZE) return { valid: false, message: 'Company logos must be 5 MB or smaller.' }
  return { valid: true, extension }
}
