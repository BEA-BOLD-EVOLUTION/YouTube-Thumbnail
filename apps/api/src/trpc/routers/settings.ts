import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits = 32 bytes

function getEncryptionKey(): Buffer | null {
  const keyStr = process.env.ENCRYPTION_KEY
  if (!keyStr) return null
  const key = Buffer.from(keyStr, 'hex')
  if (key.length !== KEY_LENGTH) {
    console.warn('[settings] ENCRYPTION_KEY must be 64 hex chars (32 bytes). Encryption disabled.')
    return null
  }
  return key
}

function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey()
  if (!key) {
    // Fallback: legacy base64 encoding — warn once at startup if key missing
    return `enc:${Buffer.from(plaintext).toString('base64')}`
  }
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `aes:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

function decryptApiKey(encrypted: string): string {
  // AES-256-GCM format: aes:{iv}:{tag}:{ciphertext}
  if (encrypted.startsWith('aes:')) {
    const key = getEncryptionKey()
    if (!key) throw new Error('ENCRYPTION_KEY not set — cannot decrypt stored API key')
    const parts = encrypted.slice(4).split(':')
    if (parts.length !== 3) throw new Error('Malformed encrypted key')
    const [ivHex, tagHex, ctHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const ciphertext = Buffer.from(ctHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  }
  // Legacy format: enc:{base64}
  if (encrypted.startsWith('enc:')) {
    return Buffer.from(encrypted.slice(4), 'base64').toString('utf8')
  }
  return encrypted
}

function maskApiKey(key: string | null): string | null {
  if (!key) return null
  try {
    const decrypted = decryptApiKey(key)
    if (decrypted.length < 8) return '****'
    return `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`
  } catch {
    return '****'
  }
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
    .input(z.object({ apiKey: z.string().min(1, 'API key is required').max(200) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { GoogleGenAI } = await import('@google/genai')
        const testClient = new GoogleGenAI({ apiKey: input.apiKey })
        await testClient.models.list()
      } catch {
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
