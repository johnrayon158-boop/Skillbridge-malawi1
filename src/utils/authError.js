export function getFriendlyAuthError(error) {
  if (!error) return 'Something went wrong. Please try again.'

  const message = error.message || ''
  const code = error.code || error.name || ''

  if (!message && !code) {
    return 'Unable to complete your request. Please try again.'
  }

  const normalized = `${code} ${message}`.toLowerCase()

  if (normalized.includes('email_not_confirmed') || normalized.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in. Check your inbox for the confirmation link.'
  }

  if (normalized.includes('invalid login') || normalized.includes('invalid credentials') || normalized.includes('email or password')) {
    return 'Email or password is incorrect.'
  }

  if (normalized.includes('user_already_exists') || normalized.includes('duplicate') || normalized.includes('already registered')) {
    return 'An account with this email already exists.'
  }

  if (normalized.includes('weak password') || normalized.includes('password') && normalized.includes('too short')) {
    return 'Please choose a stronger password.'
  }

  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('failed to fetch') || normalized.includes('connection')) {
    return 'Unable to connect to SkillBridge. Please check your internet connection and try again.'
  }

  if (normalized.includes('missing supabase') || normalized.includes('environment')) {
    return 'Supabase environment variables are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  }

  if (normalized.includes('reset password') || normalized.includes('password reset')) {
    return 'Password reset instructions could not be sent. Please try again.'
  }

  return 'Unable to complete your request. Please try again.'
}
