import { createClient } from '@supabase/supabase-js'

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
