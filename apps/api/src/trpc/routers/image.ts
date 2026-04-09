import { z } from 'zod'
import { router, protectedProcedure, publicProcedure } from '../trpc'
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
import { getYouTubeMetadata, createThumbnailPromptFromMetadata } from '../../services/youtube.service'
import { getTikTokMetadata, isTikTokUrl } from '../../services/tiktok.service'

function decryptApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null
  // AES-256-GCM format (new)
  if (encrypted.startsWith('aes:')) {
    const { createDecipheriv } = require('crypto')
    const keyStr = process.env.ENCRYPTION_KEY
    if (!keyStr) return null
    const key = Buffer.from(keyStr, 'hex')
    const parts = encrypted.slice(4).split(':')
    if (parts.length !== 3) return null
    const [ivHex, tagHex, ctHex] = parts
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8')
  }
  // Legacy base64 format
  if (!encrypted.startsWith('enc:')) return encrypted
  return Buffer.from(encrypted.slice(4), 'base64').toString('utf8')
}

// Allowed MIME types for reference images
const referenceImageSchema = z.object({
  base64: z.string().max(15_000_000), // ~11 MB decoded
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

async function getContext(ctx: { prisma: any; user?: { id: string } | null }) {
  const userRecord = ctx.user
    ? await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { geminiApiKey: true, useOwnGemini: true, geminiModel: true },
      })
    : null

  const userApiKey =
    userRecord?.useOwnGemini && userRecord?.geminiApiKey
      ? decryptApiKey(userRecord.geminiApiKey)
      : null

  // Pro model = BYOK only (no paid subscription required)
  const hasByok = !!userApiKey

  return { user: userRecord, userApiKey, hasByok }
}

export const imageRouter = router({
  isAvailable: protectedProcedure.query(async ({ ctx }) => {
    const { userApiKey } = await getContext(ctx)
    const flashAvailable = isImageGenerationAvailable(userApiKey, 'gemini-2.5-flash-image', false)
    const flash31Available = isImageGenerationAvailable(userApiKey, 'gemini-3.1-flash-image-preview', false)
    const proAvailable = isImageGenerationAvailable(userApiKey, 'gemini-3-pro-image-preview', false)
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
        referenceImage: referenceImageSchema.optional(),
        referenceImages: z.array(referenceImageSchema).max(14).optional(),
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3-pro-image-preview']).optional(),
        enableThinking: z.boolean().optional(),
        outputResolution: z.enum(['standard', '2k', '4k']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'

      // Pro models require BYOK
      if ((model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview') && !userApiKey) {
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
          model = 'gemini-3.1-flash-image-preview'
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

  // Allow prompt enhancement without requiring auth so users can try the feature
  suggestPrompt: publicProcedure
    .input(
      z.object({
        videoIntent: z.string().min(1).max(1000),
        referenceImages: z.array(referenceImageSchema).max(14).optional(),
        style: z
          .enum(['photorealistic', 'cinematic', 'anime', 'illustration', 'concept-art'])
          .optional(),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1'])
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log('suggestPrompt input:', input)
      const { userApiKey } = await getContext(ctx)

      const result = await suggestImagePrompt(input.videoIntent, userApiKey, input.referenceImages, { style: input.style, aspectRatio: input.aspectRatio })

      if (!result.usedFallback) {
        try {
          await recordAiUsageEvent(ctx.prisma, {
            userId: ctx.user?.id ?? null,
            provider: 'gemini',
            model: 'gemini-2.5-flash-image',
            operation: 'image.suggestPrompt',
            source: 'trpc.image.suggestPrompt',
            usedOwnKey: !!userApiKey,
          })
        } catch (err) {
          console.warn('[suggestPrompt] Failed to record AI usage event (non-blocking):', err)
        }
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
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'
      if ((model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview') && !userApiKey) {
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

  generateFromYouTube: protectedProcedure
    .input(
      z.object({
        youtubeUrl: z.string().url(),
        templateType: z.enum(['technical-guide', 'do-this-not-that', 'subject-context', 'bold-headline', 'none']).optional().default('technical-guide'),
        customPrompt: z.string().max(2000).optional(),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1', '4:3', '3:4'])
          .optional()
          .default('16:9'),
        style: z
          .enum(['photorealistic', 'cinematic', 'anime', 'illustration', 'concept-art'])
          .optional()
          .default('photorealistic'),
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'
      if ((model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview') && !userApiKey) {
        model = 'gemini-2.5-flash-image'
      }

      if (!isImageGenerationAvailable(userApiKey, model, false)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Image generation is not available.',
        })
      }

      // Fetch YouTube metadata
      const metadata = await getYouTubeMetadata(input.youtubeUrl)
      if (!metadata) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to fetch YouTube video metadata. Please check the URL.',
        })
      }

      // When using custom prompt with no template, combine user prompt with video context
      const useCustomPrompt = input.templateType === 'none' && input.customPrompt?.trim()

      let finalPrompt: string
      let skipStylePrefix: boolean

      if (useCustomPrompt) {
        // Custom prompt mode: combine user's prompt with video metadata context
        finalPrompt = `Create a YouTube thumbnail based on the following instructions:\n\n${input.customPrompt}\n\nVideo context — Title: "${metadata.title}"${metadata.channelTitle ? `, Channel: "${metadata.channelTitle}"` : ''}`
        skipStylePrefix = false
      } else {
        // Template mode: use the structured template system
        const templateType = input.templateType === 'none' ? 'technical-guide' : input.templateType
        const videoIntent = createThumbnailPromptFromMetadata(metadata, templateType)
        const promptResult = await suggestImagePrompt(videoIntent, userApiKey, undefined, { preserveStyleInstructions: true })
        await recordAiUsageEvent(ctx.prisma, {
          userId: ctx.user.id,
          provider: 'gemini',
          model: 'gemini-2.5-flash-image',
          operation: 'image.suggestPrompt',
          source: 'trpc.image.generateFromYouTube',
          usedOwnKey: !!userApiKey,
        })

        if (!promptResult.success || !promptResult.prompt) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create prompt from YouTube video',
          })
        }
        finalPrompt = promptResult.prompt
        skipStylePrefix = true
      }

      // Generate the thumbnail
      const imageResult = await generateStartingImage({
        prompt: finalPrompt,
        aspectRatio: input.aspectRatio as GenerateImageParams['aspectRatio'],
        style: input.style as GenerateImageParams['style'],
        userApiKey,
        model,
        allowPlatformKeyForPro: false,
        skipStylePrefix,
      })

      await recordAiUsageEvent(ctx.prisma, {
        userId: ctx.user.id,
        provider: 'gemini',
        model: imageResult.image?.model ?? model,
        operation: 'image.generate',
        source: 'trpc.image.generateFromYouTube',
        usedOwnKey: !!imageResult.usedOwnKey,
        metadata: { aspectRatio: input.aspectRatio, style: input.style, youtubeVideoId: metadata.videoId, templateType: input.templateType },
      })

      if (!imageResult.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: imageResult.error || 'Failed to generate thumbnail',
        })
      }

      return {
        success: true,
        usedOwnKey: imageResult.usedOwnKey,
        videoMetadata: {
          title: metadata.title,
          channelTitle: metadata.channelTitle,
        },
        suggestedPrompt: finalPrompt,
        image: {
          base64: imageResult.image!.base64,
          mimeType: imageResult.image!.mimeType,
          prompt: imageResult.image!.prompt,
          enhancedPrompt: imageResult.image!.enhancedPrompt,
          model: imageResult.image!.model,
        },
      }
    }),

  generateFromTikTok: protectedProcedure
    .input(
      z.object({
        tiktokUrl: z.string().url(),
        templateType: z.enum(['technical-guide', 'do-this-not-that', 'subject-context', 'bold-headline', 'none']).optional().default('technical-guide'),
        customPrompt: z.string().max(2000).optional(),
        aspectRatio: z
          .enum(['16:9', '9:16', '1:1', '4:3', '3:4'])
          .optional()
          .default('9:16'),
        style: z
          .enum(['photorealistic', 'cinematic', 'anime', 'illustration', 'concept-art'])
          .optional()
          .default('illustration'),
        model: z.enum(['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { user, userApiKey } = await getContext(ctx)

      let model: GeminiImageModel =
        input.model || (user?.geminiModel as GeminiImageModel) || 'gemini-2.5-flash-image'
      if ((model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview') && !userApiKey) {
        model = 'gemini-2.5-flash-image'
      }

      if (!isImageGenerationAvailable(userApiKey, model, false)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Image generation is not available.',
        })
      }

      if (!isTikTokUrl(input.tiktokUrl)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Please provide a valid TikTok URL.',
        })
      }

      const metadata = await getTikTokMetadata(input.tiktokUrl)
      if (!metadata) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to fetch TikTok video metadata. Please check the URL.',
        })
      }

      // When using custom prompt with no template, combine user prompt with video context
      const useCustomPrompt = input.templateType === 'none' && input.customPrompt?.trim()

      let finalPrompt: string
      let skipStylePrefix: boolean

      if (useCustomPrompt) {
        finalPrompt = `Create a YouTube thumbnail based on the following instructions:\n\n${input.customPrompt}\n\nVideo context — Title: "${metadata.title}"${metadata.authorName ? `, Creator: "${metadata.authorName}"` : ''}`
        skipStylePrefix = false
      } else {
        const templateType = input.templateType === 'none' ? 'technical-guide' : input.templateType
        const videoIntent = createThumbnailPromptFromMetadata(
          {
            videoId: metadata.videoId,
            title: metadata.title,
            description: '',
            channelTitle: metadata.authorName,
          },
          templateType
        )

        const promptResult = await suggestImagePrompt(videoIntent, userApiKey, undefined, { preserveStyleInstructions: true })
        await recordAiUsageEvent(ctx.prisma, {
          userId: ctx.user.id,
          provider: 'gemini',
          model: 'gemini-2.5-flash-image',
          operation: 'image.suggestPrompt',
          source: 'trpc.image.generateFromTikTok',
          usedOwnKey: !!userApiKey,
        })

        if (!promptResult.success || !promptResult.prompt) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create prompt from TikTok video',
          })
        }
        finalPrompt = promptResult.prompt
        skipStylePrefix = true
      }

      const imageResult = await generateStartingImage({
        prompt: finalPrompt,
        aspectRatio: input.aspectRatio as GenerateImageParams['aspectRatio'],
        style: input.style as GenerateImageParams['style'],
        userApiKey,
        model,
        allowPlatformKeyForPro: false,
        skipStylePrefix,
      })

      await recordAiUsageEvent(ctx.prisma, {
        userId: ctx.user.id,
        provider: 'gemini',
        model: imageResult.image?.model ?? model,
        operation: 'image.generate',
        source: 'trpc.image.generateFromTikTok',
        usedOwnKey: !!imageResult.usedOwnKey,
        metadata: { aspectRatio: input.aspectRatio, style: input.style, tiktokVideoId: metadata.videoId, templateType: input.templateType },
      })

      if (!imageResult.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: imageResult.error || 'Failed to generate thumbnail',
        })
      }

      return {
        success: true,
        usedOwnKey: imageResult.usedOwnKey,
        videoMetadata: {
          title: metadata.title,
          authorName: metadata.authorName,
        },
        suggestedPrompt: finalPrompt,
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
