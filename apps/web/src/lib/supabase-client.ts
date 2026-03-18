import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const hasSupabaseConfig = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let _supabase: ReturnType<typeof createBrowserClient> | null = null

export const getSupabase = () => {
  if (typeof window !== 'undefined') {
    if (_supabase === null && hasSupabaseConfig()) {
      _supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
        global: { headers: { 'x-client-info': 'youtube-thumbnail-web' } },
      })
    }
    return _supabase
  }
  return null
}
