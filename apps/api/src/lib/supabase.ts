import { createClient, SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') })

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY?.trim()

const isValidUrl = (url: string | undefined): boolean => {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

let supabase: SupabaseClient | null = null

if (isValidUrl(supabaseUrl) && supabaseServiceKey) {
  supabase = createClient(supabaseUrl!, supabaseServiceKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  console.log('✅ Supabase client initialized')
} else {
  console.warn('⚠️  Supabase credentials not configured.')
}

export { supabase }
