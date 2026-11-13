const MAX_VERIFICATION_DOCUMENT_SIZE = 10 * 1024 * 1024

const VERIFICATION_DOCUMENT_EXTENSIONS = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
})

const REQUIRED_FIELDS = Object.freeze([
  ['legal_business_name', 'Legal business name', 2, 160],
  ['registration_number', 'Registration or licence number', 1, 100],
  ['registration_authority', 'Registration authority', 2, 160],
  ['registration_country', 'Registration country', 2, 100],
  ['representative_name', 'Representative name', 2, 120],
  ['representative_role', 'Representative role', 2, 100],
])

export function validateEmployerVerificationFields(values = {}) {
  for (const [field, label, minLength, maxLength] of REQUIRED_FIELDS) {
    const value = String(values[field] || '').trim()
    if (value.length < minLength) return { valid: false, message: `${label} is required.` }
    if (value.length > maxLength) return { valid: false, message: `${label} must be ${maxLength} characters or fewer.` }
  }
  return { valid: true }
}

export function validateEmployerVerificationDocument(file) {
  if (!file) return { valid: false, message: 'Choose a business registration certificate, licence, or official organisation letter.' }
  const extension = VERIFICATION_DOCUMENT_EXTENSIONS[file.type]
  if (!extension) return { valid: false, message: 'Verification evidence must be a PDF, JPEG, or PNG file.' }
  if (!file.size || file.size > MAX_VERIFICATION_DOCUMENT_SIZE) {
    return { valid: false, message: 'Verification evidence must be larger than 0 bytes and 10 MB or smaller.' }
  }
  return { valid: true, extension }
}
