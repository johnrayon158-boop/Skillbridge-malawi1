const MAX_CERTIFICATE_SIZE = 10 * 1024 * 1024

const CERTIFICATE_EXTENSIONS = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
})

export function validateCertificateFile(file) {
  if (!file) return { valid: false, message: 'Choose a PDF or image of your certificate.' }
  if (!Object.hasOwn(CERTIFICATE_EXTENSIONS, file.type)) {
    return { valid: false, message: 'Certificate files must be PDF, JPEG, PNG, WebP, HEIC or HEIF images.' }
  }
  if (file.size > MAX_CERTIFICATE_SIZE) {
    return { valid: false, message: 'Certificate files must be 10 MB or smaller.' }
  }
  return { valid: true, extension: CERTIFICATE_EXTENSIONS[file.type] }
}
