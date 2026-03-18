import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import {
  generateStartingImage,
  suggestImagePrompt,
  isImageGenerationAvailable,
  getAvailableModels,
  type GenerateImageParams,
  type GeminiImageModel,
} from '../../services/gemini-image.service'
import { recordAiUsageEvent } from '../../services/ai-usage.service'

function decryptApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null
  if (!encrypted.startsWith('enc:')) return encrypted
  return Buffer.from(encrypted.slice(4), 'base64').toString('utf8')
}

async function getContext(ctx: { prisma: any; user: { id: string } }) {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { geminiApiKey: true, useOwnGemini: true, geminiModel: true },
  })

  const userApiKey =
    user?.useOwnGemini && user?.geminiApiKey ? decryptApiKey(user.geminiApiKey) : null

  // Pro model = BYOK only (no paid subscription required)
  const hasByok = !!userApiKey

  return { user, userApiKey, hasByok }
}

export const imageRouter = router({
  isAvailable: protectedProcedure.query(async ({ ctx }) => {
    const { userApiKey } = await getContext(ctx)
    const flashAvailable = isImageGenerationAvailable(userApiKey, 'gemini-2.5-flash-image', false)
    const proAvailable = isImageGenerationAvailable(userApiKey, 'gemini-3-pro-image', false)
    return {
      available: flashAvailable || proAvailable,
      provider: 'gemini',
      usingOwnKey: !!userApiKey,
      availableModels: getAvailableModels(),
    }
  }),

  generate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1', '4:3', '3:4'])
          .optional()
          .default('16:9'),
        style: z
          .enum(['photorealistic', 'cinematic', 'anime', 'illustration', 'concept-art'])
          .optional()
          .default('photorealistic'),
        negativePrompt: z.string().max(500).optional(),
        referenceImage: z.object({ base64: z.string(), mimeType: z.string() }).optional(),
        referenceImages: z
          .array(z.object({ base64: z.string(), mimeType: z.string() }))
          .max(14)
          .optional(),
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3-pro-image']).optional(),
        enableThinking: z.boolean().optional(),
        outputResolution: z.enum(['standard', '2k', '4k']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'

      // Pro model requires BYOK
      if (model === 'gemini-3-pro-image' && !userApiKey) {
        model = 'gemini-2.5-flash-image'
      }

      const referenceImages =
        input.referenceImages || (input.referenceImage ? [input.referenceImage] : undefined)
      const referenceCount = referenceImages?.length ?? 0

      const modelInfo = getAvailableModels()[model]
      const maxImages = modelInfo?.maxImages ?? 3

      if (referenceCount > maxImages) {
        const canUsePro = !!userApiKey
        if (!input.model && model === 'gemini-2.5-flash-image' && referenceCount <= 14 && canUsePro) {
          model = 'gemini-3-pro-image'
        } else {
          throw new TRPCError({
            code: canUsePro ? 'BAD_REQUEST' : 'FORBIDDEN',
            message:
              referenceCount > 3
                ? 'Mixing more than 3 images requires Pro (add your own Gemini API key in Settings).'
                : `This model supports up to ${maxImages} reference images.`,
          })
        }
      }

      if (!isImageGenerationAvailable(userApiKey, model, false)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Image generation is not available. Add your Gemini API key in Settings.',
        })
      }

      const result = await generateStartingImage({
        prompt: input.prompt,
        aspectRatio: input.aspectRatio as GenerateImageParams['aspectRatio'],
        style: input.style as GenerateImageParams['style'],
        negativePrompt: input.negativePrompt,
        referenceImages,
        userApiKey,
        model,
        enableThinking: input.enableThinking,
        outputResolution: input.outputResolution,
        allowPlatformKeyForPro: false,
      })

      await recordAiUsageEvent(ctx.prisma, {
        userId: ctx.user.id,
        provider: 'gemini',
        model: result.image?.model ?? model,
        operation: 'image.generate',
        source: 'trpc.image.generate',
        usedOwnKey: !!result.usedOwnKey,
        metadata: { aspectRatio: input.aspectRatio, style: input.style, referenceCount },
      })

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to generate image',
        })
      }

      return {
        success: true,
        usedOwnKey: result.usedOwnKey,
        image: {
          base64: result.image!.base64,
          mimeType: result.image!.mimeType,
          prompt: result.image!.prompt,
          enhancedPrompt: result.image!.enhancedPrompt,
          thinking: result.image!.thinking,
          model: result.image!.model,
        },
      }
    }),

  suggestPrompt: protectedProcedure
    .input(
      z.object({
        videoIntent: z.string().min(1).max(1000),
        referenceImages: z
          .array(z.object({ base64: z.string(), mimeType: z.string() }))
          .max(14)
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { userApiKey } = await getContext(ctx)

      const result = await suggestImagePrompt(input.videoIntent, userApiKey, input.referenceImages)

      if (!result.usedFallback) {
        await recordAiUsageEvent(ctx.prisma, {
          userId: ctx.user.id,
          provider: 'gemini',
          model: 'gemini-2.5-flash-image',
          operation: 'image.suggestPrompt',
          source: 'trpc.image.suggestPrompt',
          usedOwnKey: !!userApiKey,
        })
      }

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to suggest prompt',
        })
      }

      return { success: true, suggestedPrompt: result.prompt, usedFallback: !!result.usedFallback }
    }),

  quickGenerate: protectedProcedure
    .input(
      z.object({
        videoIntent: z.string().min(1).max(1000),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1', '4:3', '3:4'])
          .optional()
          .default('16:9'),
        style: z
          .enum(['photorealistic', 'cinematic', 'anime', 'illustration', 'concept-art'])
          .optional()
          .default('photorealistic'),
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3-pro-image']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'
      if (model === 'gemini-3-pro-image' && !userApiKey) {
        model = 'gemini-2.5-flash-image'
      }

      if (!isImageGenerationAvailable(userApiKey, model, false)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Image generation is not available.',
        })
      }

      const promptResult = await suggestImagePrompt(input.videoIntent, userApiKey)
      await recordAiUsageEvent(ctx.prisma, {
        userId: ctx.user.id,
        provider: 'gemini',
        model: 'gemini-2.5-flash-image',
        operation: 'image.suggestPrompt',
        source: 'trpc.image.quickGenerate',
        usedOwnKey: !!userApiKey,
      })

      if (!promptResult.success || !promptResult.prompt) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create prompt from intent',
        })
      }

      const imageResult = await generateStartingImage({
        prompt: promptResult.prompt,
        aspectRatio: input.aspectRatio as GenerateImageParams['aspectRatio'],
        style: input.style as GenerateImageParams['style'],
        userApiKey,
        model,
        allowPlatformKeyForPro: false,
      })

      await recordAiUsageEvent(ctx.prisma, {
        userId: ctx.user.id,
        provider: 'gemini',
        model: imageResult.image?.model ?? model,
        operation: 'image.generate',
        source: 'trpc.image.quickGenerate',
        usedOwnKey: !!imageResult.usedOwnKey,
        metadata: { aspectRatio: input.aspectRatio, style: input.style },
      })

      if (!imageResult.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: imageResult.error || 'Failed to generate image',
        })
      }

      return {
        success: true,
        usedOwnKey: imageResult.usedOwnKey,
        suggestedPrompt: promptResult.prompt,
        image: {
          base64: imageResult.image!.base64,
          mimeType: imageResult.image!.mimeType,
          prompt: imageResult.image!.prompt,
          enhancedPrompt: imageResult.image!.enhancedPrompt,
          model: imageResult.image!.model,
        },
      }
    }),
})
