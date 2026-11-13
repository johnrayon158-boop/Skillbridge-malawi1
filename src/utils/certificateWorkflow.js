const VERIFICATION_METHODS = new Set([
  'issuer_registry',
  'issuer_confirmation',
  'credential_provider',
])

const CERTIFICATE_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  verified: 'Approved',
  rejected: 'Rejected',
  requires_correction: 'Requires Correction',
})

export function getCertificateStatusLabel(status) {
  return CERTIFICATE_STATUS_LABELS[status] || 'Unknown'
}

export function normalizeCertificateReview({ status, method = null, reason = '' }) {
  if (!['verified', 'rejected', 'requires_correction'].includes(status)) {
    throw new Error('Choose a valid certificate review decision.')
  }
  const normalizedReason = String(reason).trim()
  if (!normalizedReason) throw new Error('Add a reason for this certificate review decision.')
  if (normalizedReason.length > 2000) throw new Error('Review reasons must be 2,000 characters or fewer.')
  if (status === 'verified' && !VERIFICATION_METHODS.has(method)) {
    throw new Error('Choose how this certificate was independently verified.')
  }
  return {
    status,
    method: status === 'verified' ? method : null,
    reason: normalizedReason,
  }
}

export function canResubmitCertificate(certificate) {
  return certificate?.verification_status === 'requires_correction'
}
