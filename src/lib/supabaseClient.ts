import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — cloud sync is disabled. ' +
      'Add them to .env.local to enable it.',
  )
}

// Falls back to a harmless placeholder so createClient doesn't throw when unconfigured;
// every call site must check isSupabaseConfigured before actually using this client.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder')
