'use client'

import { useEffect, useState, useCallback } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase-client'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }

    const getSession = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('[useAuth] getSession error:', sessionError.message)
      }

      const now = Math.floor(Date.now() / 1000)
      const expiresAt = session?.expires_at ?? 0
      const ttl = expiresAt - now
      console.log(`[useAuth] Initial session: user=${session?.user?.email || 'none'} | TTL=${ttl}s | expires_at=${expiresAt}`)

      // If stored session is expired or about to expire, try refreshing
      if (session && session.expires_at && session.expires_at - now < 60) {
        console.log('[useAuth] Session expired/expiring, refreshing...')
        const { data: { session: refreshed }, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) {
          console.error('[useAuth] refreshSession error:', refreshError.message)
        }
        console.log(`[useAuth] After refresh: user=${refreshed?.user?.email || 'none'} | TTL=${(refreshed?.expires_at ?? 0) - now}s`)
        setSession(refreshed)
        setUser(refreshed?.user ?? null)
      } else {
        setSession(session)
        setUser(session?.user ?? null)
      }

      setLoading(false)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log(`[useAuth] onAuthStateChange: event=${event} user=${session?.user?.email || 'none'}`)
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        if (event === 'SIGNED_IN') router.refresh()
        if (event === 'SIGNED_OUT') router.push('/login')
      }
    )

    return () => { subscription.unsubscribe() }
  }, [router])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { data: null, error: new Error('Supabase not configured') }
    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return { error: new Error('Supabase not configured') }
    return supabase.auth.signOut()
  }, [])

  return {
    user,
    session,
    loading,
    signInWithEmail,
    signOut,
    isAuthenticated: !!session,
  }
}
