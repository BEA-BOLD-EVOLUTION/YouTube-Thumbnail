import { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import { prisma } from '../lib/prisma'
import { supabase } from '../lib/supabase'

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')
  const route = req.path || req.url

  console.log(`[ctx] ${route} | auth header: ${authHeader ? `Bearer ${token?.slice(0, 8)}...` : 'NONE'} | supabase: ${supabase ? 'ok' : 'NULL'}`)

  let user = null

  if (token && supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token)
      if (error) {
        console.error(`[ctx] ${route} | supabase.auth.getUser FAILED:`, error.message, '| status:', error.status)
      } else if (data?.user) {
        console.log(`[ctx] ${route} | supabase user: ${data.user.email} (${data.user.id})`)
        user = await prisma.user.upsert({
          where: { email: data.user.email! },
          update: {},
          create: {
            email: data.user.email!,
            clerkId: data.user.id,
            name: data.user.user_metadata?.name || null,
          },
        })
        console.log(`[ctx] ${route} | db user: id=${user.id} email=${user.email}`)
      } else {
        console.warn(`[ctx] ${route} | supabase returned no error but no user data`)
      }
    } catch (error) {
      console.error(`[ctx] ${route} | EXCEPTION:`, error)
    }
  } else {
    console.warn(`[ctx] ${route} | skipped auth: token=${!!token} supabase=${!!supabase}`)
  }

  console.log(`[ctx] ${route} | result: user=${user ? user.email : 'NULL'}`)
  return { req, res, prisma, user }
}

export type Context = Awaited<ReturnType<typeof createContext>>
