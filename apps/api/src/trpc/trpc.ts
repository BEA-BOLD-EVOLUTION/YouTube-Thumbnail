import { initTRPC, TRPCError } from '@trpc/server'
import { Context } from './context'

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    console.error('tRPC Error:', error.message)
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    const authHeader = ctx.req?.headers?.authorization
    console.error(`[protected] UNAUTHORIZED | path: ${ctx.req?.path || ctx.req?.url || '?'} | auth header present: ${!!authHeader} | token prefix: ${authHeader ? authHeader.slice(0, 15) + '...' : 'NONE'}`)
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in.',
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { role: true, email: true },
  })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase())
  const isAdminByEmail = user?.email && adminEmails.includes(user.email.toLowerCase())
  const isAdminByRole = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role)

  if (!isAdminByEmail && !isAdminByRole) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }

  return next({ ctx })
})
