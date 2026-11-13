const VERIFICATION_METHODS = new Set([
  'issuer_registry',
  'issuer_confirmation',
  'credential_provider',
])

export function isCertificateIndependentlyVerified(certificate) {
  return certificate?.verification_status === 'verified'
    && VERIFICATION_METHODS.has(certificate.verification_method)
    && Boolean(certificate.verified_by && certificate.verified_at)
}
