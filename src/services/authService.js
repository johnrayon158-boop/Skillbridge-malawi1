import { getFriendlyAuthError } from '../utils/authError'
import {
  getSupabaseConfigMessage,
  hasSupabaseConfig,
  supabase,
} from './supabase'

const ensureSupabaseConfig = () => {
  if (!hasSupabaseConfig) {
    throw new Error(getSupabaseConfigMessage())
  }
}

const getResetPasswordRedirectUrl = () => {
  const configuredSiteUrl = (
    import.meta.env.VITE_APP_SITE_URL ||
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    window.location.origin
  )

  return `${String(configuredSiteUrl).replace(/\/$/, '')}/reset-password`
}

function reportSignInFailure() {
  const configuredApiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_AI_API_URL
  const apiBase = configuredApiUrl
    ? String(configuredApiUrl).replace(/\/+$/, '')
    : import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : window.location.origin
  void fetch(`${apiBase}/api/auth/sign-in-failure`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    keepalive: true,
  }).catch(() => {})
}

export const authService = {
  async signIn({ email, password, rememberMe = true }) {
    try {
      ensureSupabaseConfig()

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        reportSignInFailure()
        return { data: null, error: getFriendlyAuthError(error) }
      }

      if (!rememberMe) {
        await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
      }

      const profile = data?.user ? await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle() : { data: null }

      return {
        data,
        error: null,
        profile: profile.data,
        role: profile.data?.role || data?.user?.role || 'student',
      }
    } catch (error) {
      return { data: null, error: getFriendlyAuthError(error) }
    }
  },

  async signUp({ fullName, email, password, companyName = '', role = 'student' }) {
    try {
      ensureSupabaseConfig()

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            company_name: companyName,
          },
        },
      })

      if (error) {
        return { data: null, error: getFriendlyAuthError(error) }
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: getFriendlyAuthError(error) }
    }
  },

  async signOut() {
    try {
      ensureSupabaseConfig()
      const { error } = await supabase.auth.signOut()
      return { error: error ? getFriendlyAuthError(error) : null }
    } catch (error) {
      return { error: getFriendlyAuthError(error) }
    }
  },

  async resetPassword(email) {
    try {
      ensureSupabaseConfig()
      const redirectTo = getResetPasswordRedirectUrl()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      return { error: error ? getFriendlyAuthError(error) : null }
    } catch (error) {
      return { error: getFriendlyAuthError(error) }
    }
  },

  async updateProfile(profile) {
    try {
      ensureSupabaseConfig()
      const { data, error } = await supabase
        .from('profiles')
        .update(profile)
        .eq('id', profile.id)
        .select()
        .single()

      return { data, error: error ? getFriendlyAuthError(error) : null }
    } catch (error) {
      return { data: null, error: getFriendlyAuthError(error) }
    }
  },
}
