import { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import { prisma } from '../lib/prisma'
import { supabase } from '../lib/supabase'

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  let user = null

  if (token && supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token)
      if (error) {
        // Only log in dev — don't leak error details in production
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[ctx] auth failed:`, error.message)
        }
      } else if (data?.user) {
        user = await prisma.user.upsert({
          where: { email: data.user.email! },
          update: {},
          create: {
            email: data.user.email!,
            clerkId: data.user.id,
            name: data.user.user_metadata?.name || null,
          },
        })
      }
    } catch (error) {
      console.error('[ctx] auth exception:', error)
    }
  }

  return { req, res, prisma, user }
}

export type Context = Awaited<ReturnType<typeof createContext>>
