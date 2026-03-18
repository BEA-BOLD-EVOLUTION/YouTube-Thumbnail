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

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${(process.env.NEXT_PUBLIC_API_URL || defaultApiUrl).replace(/\/$/, '')}/trpc`,
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' })
          },
          async headers() {
            try {
              const supabase = getSupabase()
              if (!supabase) return {}
              const { data: { session } } = await supabase.auth.getSession()
              if (session?.access_token) {
                return { Authorization: `Bearer ${session.access_token}` }
              }
              return {}
            } catch {
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
