import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

function encryptApiKey(key: string): string {
  const encoded = Buffer.from(key).toString('base64')
  return `enc:${encoded}`
}

function decryptApiKey(encrypted: string): string {
  if (!encrypted.startsWith('enc:')) return encrypted
  return Buffer.from(encrypted.slice(4), 'base64').toString('utf8')
}

function maskApiKey(key: string | null): string | null {
  if (!key) return null
  const decrypted = key.startsWith('enc:') ? decryptApiKey(key) : key
  if (decrypted.length < 8) return '****'
  return `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`
}

const GEMINI_MODELS = {
  'gemini-2.5-flash-image': {
    name: 'Gemini 2.5 Flash',
    description: 'Fast and efficient. Default choice.',
    tier: 'free',
  },
  'gemini-3.1-flash-image-preview': {
    name: 'Gemini 3.1 Flash',
    description: 'Thinking, search grounding, 512p. Requires your own API key.',
    tier: 'pro',
  },
  'gemini-3-pro-image-preview': {
    name: 'Gemini 3 Pro',
    description: 'Thinking capabilities, 4K output. Requires your own API key.',
    tier: 'pro',
  },
} as const

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { geminiApiKey: true, useOwnGemini: true, geminiModel: true, role: true },
    })

    const platformGeminiConfigured = Boolean(
      process.env.GOOGLE_GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEYS?.trim()
    )

    return {
      gemini: {
        hasApiKey: !!user?.geminiApiKey,
        maskedKey: maskApiKey(user?.geminiApiKey ?? null),
        useOwnKey: user?.useOwnGemini ?? false,
        model: user?.geminiModel ?? 'gemini-2.5-flash-image',
      },
      availableModels: GEMINI_MODELS,
      role: user?.role ?? 'USER',
      platformGeminiConfigured,
    }
  }),

  setGeminiApiKey: protectedProcedure
    .input(z.object({ apiKey: z.string().min(1, 'API key is required') }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { GoogleGenAI } = await import('@google/genai')
        const testClient = new GoogleGenAI({ apiKey: input.apiKey })
        await testClient.models.list()
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid API key. Please check your key and try again.',
        })
      }

      const encrypted = encryptApiKey(input.apiKey)
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { geminiApiKey: encrypted, useOwnGemini: true },
      })

      return { success: true, maskedKey: maskApiKey(encrypted) }
    }),

  removeGeminiApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { geminiApiKey: null, useOwnGemini: false },
    })
    return { success: true }
  }),

  toggleGeminiKeySource: protectedProcedure
    .input(z.object({ useOwnKey: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.useOwnKey) {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { geminiApiKey: true },
        })
        if (!user?.geminiApiKey) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You need to add an API key first.',
          })
        }
      }
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { useOwnGemini: input.useOwnKey },
      })
      return { success: true, useOwnKey: input.useOwnKey }
    }),

  setGeminiModel: protectedProcedure
    .input(z.object({ model: z.enum(['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']) }))
    .mutation(async ({ ctx, input }) => {
      if (input.model === 'gemini-3-pro-image-preview' || input.model === 'gemini-3.1-flash-image-preview') {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { geminiApiKey: true, useOwnGemini: true },
        })
        const hasOwnKey = !!(user?.geminiApiKey && user?.useOwnGemini)
        if (!hasOwnKey) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Pro model requires your own Gemini API key.',
          })
        }
      }
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { geminiModel: input.model },
      })
      return { success: true, model: input.model }
    }),
})
