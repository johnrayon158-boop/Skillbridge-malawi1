import { createClient } from '@supabase/supabase-js'
import { parseRecoveryRedirect } from '../utils/authRedirect'

// Captured before createClient() initializes: the auth client consumes the
// recovery tokens and clears the URL hash, so this is the only reliable point
// to know the visitor arrived from a password reset email.
export const initialRecoveryRedirect = typeof window === 'undefined'
  ? { isRecovery: false, errorCode: '' }
  : parseRecoveryRedirect(window.location.hash, window.location.search, window.location.pathname)

export const supabaseConfigStatus = {
  hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
  hasPublishableKey: Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
}

const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && supabaseKey,
)

export const getSupabaseConfigMessage = () =>
  'Supabase environment variables are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file.'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co'
const configuredKey = supabaseKey || 'demo-anon-key'

export const supabase = createClient(supabaseUrl, configuredKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
