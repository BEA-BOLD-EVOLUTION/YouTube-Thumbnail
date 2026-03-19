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
      const { data: { session } } = await supabase.auth.getSession()

      // If stored session is expired or about to expire, try refreshing
      if (session && session.expires_at && session.expires_at - Math.floor(Date.now() / 1000) < 60) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession()
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
