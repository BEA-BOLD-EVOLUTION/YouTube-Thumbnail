'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { getSupabase } from '@/lib/supabase-client'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            retry: (failureCount, error) => {
              if (error && typeof error === 'object' && 'data' in error) {
                const trpcError = error as { data?: { code?: string } }
                if (trpcError.data?.code === 'UNAUTHORIZED') return false
              }
              return failureCount < 1
            },
          },
        },
      })
  )

  const defaultApiUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:4000'
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

  // In production we use a same-origin Next.js rewrite (/api-proxy/trpc -> Railway)
  // to avoid CORS preflight entirely. In development we hit the API directly.
  const trpcUrl =
    process.env.NODE_ENV === 'development'
      ? `${defaultApiUrl.replace(/\/$/, '')}/trpc`
      : '/api-proxy/trpc'

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: trpcUrl,
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' })
          },
          async headers() {
            try {
              const supabase = getSupabase()
              if (!supabase) {
                console.warn('[trpc] No supabase client — sending request without auth')
                return {}
              }
              const { data: { session }, error: sessionError } = await supabase.auth.getSession()
              if (sessionError) {
                console.error('[trpc] getSession error:', sessionError.message)
                return {}
              }
              if (!session) {
                console.warn('[trpc] No session found — user may not be logged in')
                return {}
              }

              const now = Math.floor(Date.now() / 1000)
              const expiresAt = session.expires_at ?? 0
              const ttl = expiresAt - now
              console.log(`[trpc] Session token TTL: ${ttl}s | expires_at: ${expiresAt} | now: ${now} | user: ${session.user?.email}`)

              if (ttl < 60) {
                console.log('[trpc] Token expiring soon, refreshing...')
                const { data: { session: refreshed }, error: refreshError } = await supabase.auth.refreshSession()
                if (refreshError) {
                  console.error('[trpc] refreshSession error:', refreshError.message)
                  return {}
                }
                if (refreshed?.access_token) {
                  console.log('[trpc] Token refreshed successfully, new TTL:', (refreshed.expires_at ?? 0) - now, 's')
                  return { Authorization: `Bearer ${refreshed.access_token}` }
                }
                console.warn('[trpc] refreshSession returned no access_token')
                return {}
              }

              return { Authorization: `Bearer ${session.access_token}` }
            } catch (err) {
              console.error('[trpc] headers() exception:', err)
              return {}
            }
          },
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
