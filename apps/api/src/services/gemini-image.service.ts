import { GoogleGenAI, Modality } from '@google/genai'

// =============================================================================
// Platform API Key(s)
// - Flash model: platform key or BYOK
// - Pro model: BYOK by default; platform key only when explicitly allowed
//
// NOTE: Shared throttling is typically applied per *project*. Multiple keys in
// the same Google project may NOT increase quota. For best results, use keys
// from multiple projects (each with billing enabled) and provide them as a pool.
// =============================================================================

function parseKeyPool(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const platformApiKeySingle = process.env.GOOGLE_GEMINI_API_KEY
const platformApiKeyPool = parseKeyPool(process.env.GOOGLE_GEMINI_API_KEYS)
const platformApiKeys = platformApiKeyPool.length > 0 ? platformApiKeyPool : platformApiKeySingle ? [platformApiKeySingle] : []

if (platformApiKeys.length === 0) {
  console.warn('⚠️ GOOGLE_GEMINI_API_KEY (or GOOGLE_GEMINI_API_KEYS) is not set - platform image generation will be unavailable')
} else {
  console.log(`✅ Platform Gemini key(s) configured: ${platformApiKeys.length}`)
}

type PlatformClientEntry = {
  apiKey: string
  client: GoogleGenAI
  cooldownUntil: number
}

const platformClients: PlatformClientEntry[] = platformApiKeys.map((apiKey) => ({
  apiKey,
  client: new GoogleGenAI({ apiKey }),
  cooldownUntil: 0,
}))

let platformRoundRobinIndex = 0

function getPlatformClient(): { client: GoogleGenAI | null; platformKeyIndex: number | null } {
  if (platformClients.length === 0) return { client: null, platformKeyIndex: null }

  const now = Date.now()
  const start = platformRoundRobinIndex

  // Prefer a client that is not in cooldown.
  for (let i = 0; i < platformClients.length; i++) {
    const idx = (start + i) % platformClients.length
    const entry = platformClients[idx]
    if (entry.cooldownUntil <= now) {
      platformRoundRobinIndex = (idx + 1) % platformClients.length
      return { client: entry.client, platformKeyIndex: idx }
    }
  }

  // All keys are in cooldown; pick the one that becomes available the soonest.
  let bestIdx = 0
  let bestUntil = platformClients[0]!.cooldownUntil
  for (let i = 1; i < platformClients.length; i++) {
    const until = platformClients[i]!.cooldownUntil
    if (until < bestUntil) {
      bestUntil = until
      bestIdx = i
    }
  }

  platformRoundRobinIndex = (bestIdx + 1) % platformClients.length
  return { client: platformClients[bestIdx]!.client, platformKeyIndex: bestIdx }
}

function cooldownPlatformKey(platformKeyIndex: number, ms: number) {
  if (!Number.isFinite(platformKeyIndex)) return
  const entry = platformClients[platformKeyIndex]
  if (!entry) return
  entry.cooldownUntil = Math.max(entry.cooldownUntil, Date.now() + ms)
}

// =============================================================================
// Model Configuration
// =============================================================================

export const GEMINI_IMAGE_MODELS = {
  'gemini-2.5-flash-image': {
    name: 'Gemini 2.5 Flash (Nano Banana)',
    description: 'Fast and efficient. Default choice for quick image generation.',
    tier: 'free' as const,
    supportsThinking: false,
    supports4K: false,
    supportsSearchGrounding: false,
    maxImages: 3, // Max images that can be combined
  },
  'gemini-3.1-flash-image-preview': {
    name: 'Gemini 3.1 Flash (Nano Banana 2)',
    description: 'Thinking, Google Search grounding, 512p output.',
    tier: 'pro' as const,
    supportsThinking: true,
    supports4K: false, // 512p max
    supportsSearchGrounding: true,
    maxImages: 14,
  },
  'gemini-3-pro-image-preview': {
    name: 'Gemini 3 Pro (Nano Banana Pro)',
    description: 'Thinking capabilities, Google Search grounding, 2K/4K output.',
    tier: 'pro' as const,
    supportsThinking: true,
    supports4K: true,
    supportsSearchGrounding: true, // Can use real-time web data
    maxImages: 14, // Can mix up to 14 images
  },
} as const

export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS
const DEFAULT_MODEL: GeminiImageModel = 'gemini-2.5-flash-image'

// =============================================================================
// Types
// =============================================================================

export interface GenerateImageParams {
  prompt: string
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  style?: 'photorealistic' | 'cinematic' | 'anime' | 'illustration' | 'concept-art'
  negativePrompt?: string
  // Support multiple reference images (up to 4 for now, Gemini Pro supports up to 14)
  referenceImages?: Array<{
    base64: string
    mimeType: string
  }>
  // User API key configuration
  userApiKey?: string | null
  model?: GeminiImageModel
  // Pro model features
  enableThinking?: boolean
  enableSearchGrounding?: boolean // Use Google Search for real-time data (Pro only)
  outputResolution?: 'standard' | '2k' | '4k'
  /**
   * When true, the service may use the platform API key even for the Pro image model.
   * This must only be enabled by trusted server-side code after verifying entitlement.
   */
  allowPlatformKeyForPro?: boolean
}

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string // Original user prompt
  enhancedPrompt?: string // AI-optimized Nano Banana prompt
  rawPromptAnalysis?: { // Debug info about prompt transformation
    wasKeywordList: boolean
    hadPhotographyTerms: boolean
    wasEnhanced: boolean
  }
  thinking?: string // Thought process from Pro model
  model: string
}

export interface ImageGenerationResult {
  success: boolean
  image?: GeneratedImage
  error?: string
  usedOwnKey?: boolean
}

// =============================================================================
// Style Prompts (Narrative, descriptive - per Gemini best practices)
// =============================================================================

const STYLE_PROMPTS: Record<string, string> = {
  'photorealistic': `A photorealistic, high-resolution photograph with professional studio lighting. 
    The image features sharp focus, natural skin textures, and accurate color reproduction. 
    Captured with professional camera equipment, resulting in crisp details and natural bokeh.`,
  
  'cinematic': `A cinematic still frame from a high-budget film production. 
    The scene features dramatic, moody lighting with rich shadows and highlights. 
    Shot with anamorphic lenses creating a characteristic wide aspect and subtle lens flare. 
    The color grading is sophisticated with deep blacks and film-like grain.`,
  
  'anime': `A vibrant anime-style illustration inspired by Studio Ghibli and modern Japanese animation. 
    Features clean, bold outlines with expressive character design. 
    The color palette is saturated and harmonious with soft cel-shading. 
    The overall mood is warm and inviting with attention to atmospheric details.`,
  
  'illustration': `A polished digital illustration with clean, professional linework. 
    The style blends modern concept art techniques with vibrant, well-balanced colors. 
    Features subtle gradients and thoughtful composition that guides the viewer's eye.`,
  
  'concept-art': `A detailed concept art piece suitable for film or game production. 
    The scene features atmospheric perspective with rich environmental storytelling. 
    Painted with bold, confident brushstrokes that convey both form and mood. 
    The lighting is dramatic and emphasizes the focal point of the composition.`,
}

// =============================================================================
// Intelligent Prompt Enhancement (Based on Official Gemini Documentation)
// =============================================================================

/**
 * Transforms poorly-worded prompts into professional Nano Banana prompts.
 * Following official Gemini best practice: "Describe the scene, don't just list keywords."
 * 
 * Official Template for Photorealistic Scenes:
 * "A photorealistic [shot type] of [subject], [action or expression], set in
 * [environment]. The scene is illuminated by [lighting description], creating
 * a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
 * [key textures and details]. The image should be in a [aspect ratio] format."
 * 
 * @see https://ai.google.dev/gemini-api/docs/image-generation#prompting-guide
 */
function intelligentPromptEnhancement(rawPrompt: string): {
  isKeywordList: boolean
  hasPhotographyTerms: boolean
  enhanced: string
} {
  const prompt = rawPrompt.trim()
  
  // Detect keyword lists (comma-separated, short phrases)
  const hasCommas = prompt.includes(',')
  const words = prompt.split(/[\s,]+/)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length
  const isKeywordList = hasCommas && avgWordLength < 8 && words.length > 3
  
  // Detect if already has photography terms (per official guidance)
  const photographyTerms = [
    'shot', 'lens', 'lighting', 'camera', 'focus', 'bokeh', 'depth of field',
    'exposure', 'composition', 'frame', 'angle', 'perspective', 'photograph',
    'illuminated', 'captured', 'cinematic', 'wide-angle', 'macro', 'portrait',
    'close-up', 'studio-lit', 'softbox', 'natural light', 'golden hour'
  ]
  const hasPhotographyTerms = photographyTerms.some(term => 
    prompt.toLowerCase().includes(term)
  )
  
  if (isKeywordList) {
    // Official Guidance: "Describe the scene, don't just list keywords"
    // Transform: "cat, sunset, beach" → Narrative description
    const keywords = prompt.split(',').map(k => k.trim()).filter(k => k)
    
    // Parse keywords into structured elements
    const subject = keywords[0] || 'subject'
    const remainingKeywords = keywords.slice(1)
    
    // Identify environment/setting keywords
    const environmentKeywords = ['beach', 'mountain', 'forest', 'city', 'studio', 'room', 'outdoor', 'indoor']
    const environment = remainingKeywords.find(k => 
      environmentKeywords.some(e => k.toLowerCase().includes(e))
    ) || 'natural setting'
    
    // Identify lighting/mood keywords
    const lightingKeywords = ['sunset', 'sunrise', 'dramatic', 'soft', 'moody', 'bright', 'dark']
    const lighting = remainingKeywords.find(k => 
      lightingKeywords.some(l => k.toLowerCase().includes(l))
    ) || 'natural lighting'
    
    // Build using official template structure
    let narrative = `A photorealistic, high-resolution photograph of ${subject}, `
    narrative += `set in ${environment}. `
    narrative += `The scene is illuminated by ${lighting}, creating a compelling atmosphere. `
    narrative += `Captured with professional camera equipment, emphasizing sharp detail and rich textures. `
    
    // Add remaining descriptors as characteristics
    const otherDescriptors = remainingKeywords.filter(k => 
      k !== environment && k !== lighting
    )
    if (otherDescriptors.length > 0) {
      narrative += `Key characteristics include: ${otherDescriptors.join(', ')}. `
    }
    
    return {
      isKeywordList: true,
      hasPhotographyTerms: false,
      enhanced: narrative
    }
  }
  
  if (!hasPhotographyTerms && prompt.length < 100) {
    // Official Guidance: Add photography terms for realistic images
    // Template: Mention camera angles, lens types, lighting
    let enhanced = `A photorealistic, high-resolution photograph of ${prompt.toLowerCase()}. `
    enhanced += 'The scene is captured with professional studio lighting, '
    enhanced += 'featuring sharp focus and natural depth of field. '
    enhanced += 'The composition emphasizes the subject with clean, professional framing '
    enhanced += 'and accurate color reproduction.'
    
    return {
      isKeywordList: false,
      hasPhotographyTerms: false,
      enhanced
    }
  }
  
  // Already well-formed with photography terms - return as is
  return {
    isKeywordList: false,
    hasPhotographyTerms: true,
    enhanced: prompt
  }
}

/**
 * Main prompt enhancement function with intelligent preprocessing.
 * Based on official Gemini best practices for image generation.
 * 
 * @see https://ai.google.dev/gemini-api/docs/image-generation#best-practices
 */
function enhancePromptForImageGeneration(
  prompt: string, 
  style?: string,
  aspectRatio?: string,
  hasReference?: boolean
): string {
  // Step 1: Intelligent enhancement (transform poor prompts per official guidance)
  const { enhanced: smartPrompt } = intelligentPromptEnhancement(prompt)
  
  let enhanced = ''
  
  // Step 2: Add style-specific guidance (narrative descriptions)
  if (style && STYLE_PROMPTS[style]) {
    enhanced = STYLE_PROMPTS[style] + '\n\n'
  }
  
  // Step 3: Add the enhanced prompt
  enhanced += smartPrompt
  
  // Step 4: Add aspect ratio composition notes (per official guidance)
  // Official: Use specific composition language for different ratios
  if (aspectRatio === '16:9') {
    enhanced += '\n\nThe composition is wide and cinematic, utilizing the horizontal frame to create a sense of scope and grandeur.'
  } else if (aspectRatio === '9:16') {
    enhanced += '\n\nThe composition is vertical, optimized for portrait orientation with the subject prominently positioned in the frame.'
  } else if (aspectRatio === '1:1') {
    enhanced += '\n\nThe composition is balanced and centered, utilizing the square format for maximum impact.'
  }
  
  // Step 5: Add video-ready framing note (project-specific enhancement)
  enhanced += '\n\nThe scene features a clear focal point with good separation from the background, making it ideal as a starting frame for video animation.'
  
  return enhanced
}

/**
 * Smart prompt enhancement for multi-image composition.
 * Transforms vague user requests into ultra-detailed 7-section Nano Banana prompts.
 */
function buildReferencePrompt(
  userPrompt: string,
  style?: string,
  referenceCount: number = 1,
  aspectRatio?: GenerateImageParams['aspectRatio']
): string {
  // Following official Gemini templates for image editing/combining
  
  // Step 1: Enhance the user's prompt if it's poorly worded
  const { enhanced: smartUserPrompt, isKeywordList } = intelligentPromptEnhancement(userPrompt)
  
  // Step 2: Provide guidance if prompt is too vague
  let clarifiedPrompt = smartUserPrompt
  if (isKeywordList || userPrompt.length < 20) {
    clarifiedPrompt = `Transform the subject to incorporate the following elements: ${smartUserPrompt}`
  }
  
  let prompt = ''
  
  if (referenceCount === 1) {
    // Single image editing - use official "Adding/removing elements" template
    prompt = `Using the provided image, ${clarifiedPrompt}. `
    prompt += `Preserve the exact environment and context from the reference image: same location, same time of day, same weather/season, and the same lighting direction and mood. `
    prompt += `Ensure that the features of the subject remain completely unchanged unless specifically instructed. `
    prompt += `Preserve the exact facial features, expression, body proportions, and pose from the reference. `
    prompt += `Do not replace the background. If additional space is needed at the edges, extend/outpaint the existing background seamlessly to match the reference. `

    if (aspectRatio) {
      prompt += `The output must fit a ${aspectRatio} frame. If the aspect ratio differs from the reference framing, solve it by extending or cropping the existing scene minimally — do NOT change the setting, time of day, or lighting to fill space. `
    }
  } else {
    // Multiple images - ultra-detailed composition (inspired by Nano Banana Pro)
    prompt = `MULTI-IMAGE COMPOSITION TASK\n`
    prompt += `Images provided in order: Image 1 (base subject), Image 2+ (reference elements)\n\n`
    
    prompt += `USER REQUEST:\n${clarifiedPrompt}\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `CRITICAL IDENTITY RULES\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `• The person/subject from Image 1 must remain FULLY RECOGNIZABLE\n`
    prompt += `• Keep realistic human features: skin texture, pores, wrinkles, natural lighting\n`
    prompt += `• Maintain exact face, hair color, body type, and proportions from Image 1\n`
    prompt += `• Do NOT anime-stylize, cartoonify, or alter the person's identity\n`
    prompt += `• Face must look like a real photograph of the actual person\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `ELEMENT TRANSFER FROM IMAGE 2\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `• Extract the pose, action, props, costume elements, or character features from Image 2\n`
    prompt += `• If transferring character elements (masks, weapons, armor, etc):\n`
    prompt += `  - Make them PHOTOREALISTIC and grounded in reality\n`
    prompt += `  - Use real materials: worn metal, weathered leather, industrial textures\n`
    prompt += `  - Add realistic details: scratches, dirt, oil stains, wear and tear\n`
    prompt += `  - Elements should look practical and physically plausible\n`
    prompt += `• Props and costume pieces integrate naturally with Image 1's clothing\n`
    prompt += `• Show realistic interaction: tears in fabric, attachment points, natural shadows\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `WARDROBE & CLOTHING\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `• Preserve Image 1's clothing with real fabric textures and details\n`
    prompt += `• If modifications needed: show subtle, realistic tears or adjustments\n`
    prompt += `• Maintain clothing wrinkles, folds, and natural draping\n`
    prompt += `• Keep original color palette and style from Image 1\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `POSE, BODY LANGUAGE & ENERGY\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `• Apply the dynamic pose and body positioning from Image 2\n`
    prompt += `• Transfer the energy, attitude, and character essence\n`
    prompt += `• Ensure natural anatomy: correct joint angles, muscle tension, weight distribution\n`
    prompt += `• Body language should be powerful, clear, and intentional\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `PHOTOGRAPHY & STYLE\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `• ULTRA-REALISTIC live-action cinematic photography\n`
    prompt += `• Professional movie-quality lighting with natural depth of field\n`
    prompt += `• Sharp focus, high detail, photographic grain\n`
    prompt += `• Match the lighting style from Image 1's environment\n`
    prompt += `• Natural shadows, realistic reflections, proper color grading\n\n`
    
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `ABSOLUTE PROHIBITIONS\n`
    prompt += `═══════════════════════════════════════════════════\n`
    prompt += `❌ NO cartoon or anime style whatsoever\n`
    prompt += `❌ NO illustration, digital art, or stylized rendering\n`
    prompt += `❌ NO smooth plastic skin or fake-looking textures\n`
    prompt += `❌ NO exaggerated proportions or distorted anatomy\n`
    prompt += `❌ NO extra limbs, fingers, or body parts\n`
    prompt += `❌ NO blurry details, low resolution, or AI artifacts\n`
    prompt += `❌ NO text, logos, watermarks, or UI elements\n`
    prompt += `❌ NO face alterations that make the person unrecognizable\n\n`
    
    prompt += `FINAL OUTPUT: A single photorealistic image that looks like it was shot on a real camera, `
    prompt += `combining Image 1's recognizable subject with Image 2's creative elements, `
    prompt += `seamlessly integrated as if this transformation actually exists in reality.\n`
  }
  
  if (style && STYLE_PROMPTS[style]) {
    const styleDesc = STYLE_PROMPTS[style].split('.')[0].toLowerCase()
    prompt += `\n\nSTYLE NOTE: Apply ${styleDesc} aesthetic while maintaining photorealism. `
  }
  
  return prompt
}

// =============================================================================
// Client Factory
// - Flash model: platform key or BYOK
// - Pro model: BYOK by default; platform key only when explicitly allowed
// =============================================================================

function getClient(
  userApiKey?: string | null,
  model?: GeminiImageModel,
  allowPlatformKeyForPro: boolean = false
): { client: GoogleGenAI | null; usedOwnKey: boolean; platformKeyIndex: number | null } {
  const isPro = model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview'
  
  // User has their own key - always use it
  if (userApiKey) {
    console.log('[Gemini] getClient: using user key', { model, allowPlatformKeyForPro })
    return { client: new GoogleGenAI({ apiKey: userApiKey }), usedOwnKey: true, platformKeyIndex: null }
  }
  
  // Pro model: allow platform key only when explicitly enabled (entitlement checked upstream)
  if (isPro) {
    if (allowPlatformKeyForPro) {
      const { client, platformKeyIndex } = getPlatformClient()
      console.log('[Gemini] getClient: platform key for pro?', { model, platformKeyIndex, hasClient: !!client })
      if (client) return { client, usedOwnKey: false, platformKeyIndex }
    }
    return { client: null, usedOwnKey: false, platformKeyIndex: null }
  }
  
  // Free tier can use platform key
  {
    const { client, platformKeyIndex } = getPlatformClient()
    console.log('[Gemini] getClient: platform key for flash', { model, platformKeyIndex, hasClient: !!client })
    return { client, usedOwnKey: false, platformKeyIndex }
  }
}

// =============================================================================
// Image Generation Service
// =============================================================================

export async function generateStartingImage(
  params: GenerateImageParams
): Promise<ImageGenerationResult> {
  const model = params.model || DEFAULT_MODEL
  const modelInfo = GEMINI_IMAGE_MODELS[model]
  const isPro = model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview'
  
  const { client: genai, usedOwnKey, platformKeyIndex } = getClient(
    params.userApiKey,
    model,
    !!params.allowPlatformKeyForPro
  )
  
  if (!genai) {
    const errorMsg = isPro 
      ? 'Gemini Pro requires your own API key. Add it in Settings (⚙️ icon in the nav bar).'
      : 'No API key available. Add your own Gemini API key in Settings, or contact support.'
    return {
      success: false,
      error: errorMsg,
    }
  }

  try {
    const referenceCount = params.referenceImages?.length || 0
    const hasReferences = referenceCount > 0
    
    // Track prompt enhancement for debugging
    let rawPromptAnalysis: { wasKeywordList: boolean; hadPhotographyTerms: boolean; wasEnhanced: boolean } | undefined
    
    const enhancedPrompt = hasReferences
      ? buildReferencePrompt(params.prompt, params.style, referenceCount, params.aspectRatio)
      : (() => {
          const analysis = intelligentPromptEnhancement(params.prompt)
          rawPromptAnalysis = {
            wasKeywordList: analysis.isKeywordList,
            hadPhotographyTerms: analysis.hasPhotographyTerms,
            wasEnhanced: analysis.enhanced !== params.prompt
          }
          return enhancePromptForImageGeneration(params.prompt, params.style, params.aspectRatio, false)
        })()

    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

    let promptText = enhancedPrompt
    if (params.negativePrompt) {
      promptText += `\n\n⚠️ NEGATIVE PROMPT - DO NOT INCLUDE:\n${params.negativePrompt}\n\nIMPORTANT: Actively avoid these elements. Focus exclusively on the positive description above and ensure none of these negative elements appear in the final image.`
    }
    
    contentParts.push({ text: promptText })

    // Add all reference images to the content
    if (params.referenceImages && params.referenceImages.length > 0) {
      for (const refImage of params.referenceImages) {
        contentParts.push({
          inlineData: {
            mimeType: refImage.mimeType,
            data: refImage.base64,
          }
        })
      }
    }
    
    console.log('[ImageGen] Start', {
      model,
      aspectRatio: params.aspectRatio,
      referenceCount,
      searchGrounding: !!params.enableSearchGrounding,
      usedOwnKey,
    })
    
    const config: Record<string, any> = {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    }
    
    if (params.aspectRatio) {
      config.imageConfig = { aspectRatio: params.aspectRatio }
      
      if (modelInfo.supports4K && params.outputResolution && params.outputResolution !== 'standard') {
        config.imageConfig.outputResolution = params.outputResolution
      }
    }
    
    if (modelInfo.supportsThinking && params.enableThinking !== false) {
      config.thinkingConfig = { includeThoughts: true }
    }
    
    // Add Google Search grounding for Pro model (real-time data like weather, news, etc.)
    if (modelInfo.supportsSearchGrounding && params.enableSearchGrounding) {
      const response = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: contentParts }],
        config,
        tools: [{ google_search: {} }]
      } as any)
      
      const parts = response.candidates?.[0]?.content?.parts || []
      
      let imageData: { base64: string; mimeType: string } | null = null
      let thinking: string | undefined
      
      for (const part of parts) {
        if (part.inlineData) {
          imageData = {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/png',
          }
        } else if (part.thought) {
          thinking = part.text
        }
      }
      
      if (imageData) {
        return {
          success: true,
          image: {
            base64: imageData.base64,
            mimeType: imageData.mimeType,
            prompt: params.prompt,
            enhancedPrompt,
            rawPromptAnalysis,
            thinking,
            model,
          },
          usedOwnKey,
        }
      } else {
        throw new Error('No image generated with search grounding')
      }
    }
    
    const response = await genai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: contentParts }],
      config,
    } as any)

    const parts = response.candidates?.[0]?.content?.parts || []
    
    let imageData: { base64: string; mimeType: string } | null = null
    let thinking: string | undefined
    
    for (const part of parts) {
      if (part.inlineData) {
        imageData = {
          base64: part.inlineData.data || '',
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
      if ((part as any).thought) {
        thinking = (part as any).thought
      }
    }

    if (imageData) {
      return {
        success: true,
        image: {
          base64: imageData.base64,
          mimeType: imageData.mimeType,
          prompt: params.prompt,
          enhancedPrompt,
          rawPromptAnalysis,
          thinking,
          model,
        },
        usedOwnKey,
      }
    }

    return {
      success: false,
      error: 'No image was generated. The model may not support image generation for this prompt.',
    }
  } catch (error) {
    console.error('Image generation error:', {
      error,
      model,
      aspectRatio: params.aspectRatio,
      referenceCount: params.referenceImages?.length || 0,
      usedOwnKey,
      allowPlatformKeyForPro: params.allowPlatformKeyForPro,
    })
    
    let errorMessage = error instanceof Error ? error.message : 'Unknown error during image generation'

    const normalized = errorMessage.toLowerCase()
    
    if (errorMessage.includes('API key')) {
      errorMessage = usedOwnKey 
        ? 'Your API key appears to be invalid. Please check it in Settings.'
        : 'Platform API key error. Please try adding your own API key in Settings.'
    } else if (
      // The @google/genai SDK may retry internally and then throw messages like
      // "Request failed after X attempts". Treat these as rate/limit errors.
      normalized.includes('quota') ||
      normalized.includes('rate') ||
      normalized.includes('429') ||
      normalized.includes('too many request') ||
      normalized.includes('resource_exhausted') ||
      normalized.includes('resource exhausted') ||
      normalized.includes('exhausted') ||
      normalized.includes('retry') ||
      normalized.includes('attempt')
    ) {
      if (usedOwnKey) {
        errorMessage = 'You have reached your API quota. Check your Google AI Studio billing.'
      } else {
        // Put the key on cooldown so the pool can try another key.
        if (platformKeyIndex !== null) {
          cooldownPlatformKey(platformKeyIndex, 60_000)
        }

        // This is the shared platform key path (often confused with the user's own Google quota).
        // Pro subscribers may still see transient throttling if the shared key is busy.
        const isUsingPlatformKeyForPro = isPro && !!params.allowPlatformKeyForPro
        errorMessage = isUsingPlatformKeyForPro
          ? 'Platform rate limit reached (shared). As a Pro subscriber, please retry in 30–60 seconds, or add your own Gemini API key in Settings to bypass shared limits.'
          : 'Platform rate limit reached (shared). Add your own API key in Settings to use your personal quota.'
      }
    }
    
    return {
      success: false,
      error: errorMessage,
    }
  }
}

export async function suggestImagePrompt(
  videoIntent: string,
  userApiKey?: string | null,
  referenceImages?: Array<{ base64: string; mimeType: string }>
): Promise<{ success: boolean; prompt?: string; error?: string; usedFallback?: boolean }> {
  // Always prepare a local fallback so the UX stays functional even if:
  // - the platform key is missing during deploy/restart
  // - the provider is temporarily rate limited
  // - the SDK errors in unexpected ways
  const hasImages = referenceImages && referenceImages.length > 0
  const imageCount = referenceImages?.length || 0
  const fallbackPrompt = hasImages
    ? buildReferencePrompt(videoIntent, 'cinematic', imageCount)
    : enhancePromptForImageGeneration(videoIntent, 'cinematic')

  const { client: genai, usedOwnKey } = getClient(userApiKey)

  if (!genai) {
    return { success: true, prompt: fallbackPrompt, usedFallback: true }
  }

  try {
    // Build content parts - include images if provided
    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []
    
    // Add the images first so the AI can "see" them before reading the instructions
    if (hasImages) {
      for (const img of referenceImages!) {
        contentParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          }
        })
      }
    }
    
    // Build the prompt based on whether we have reference images
    // Following official Gemini best practices: describe scenes narratively, not keywords
    const promptText = hasImages 
      ? `You are an expert at creating image generation prompts for Gemini's native image generation.

I've uploaded ${imageCount} reference image${imageCount > 1 ? 's' : ''}.

The user's request is: "${videoIntent}"

YOUR TASK: Generate a detailed, NARRATIVE prompt following Gemini's official best practices.

MULTI-IMAGE USE CASES (understand the user's intent):
- Multiple characters: combine people from different images into one scene
- Product highlight: place a product onto a model or into a setting
- Background swap: take subject from one image, background from another
- Style transfer: apply the style/aesthetic of one image to another's content

GEMINI PROMPTING RULES:
1. DESCRIBE THE SCENE - write a narrative paragraph, NOT a list of keywords
2. BE HYPER-SPECIFIC - instead of "fantasy armor," describe "ornate elven plate armor, etched with silver leaf patterns"
3. PROVIDE CONTEXT AND INTENT - explain the purpose of the image
4. USE SEMANTIC POSITIVE DESCRIPTIONS - describe what you WANT, not what you don't want
5. CONTROL THE CAMERA - use photographic terms: wide-angle shot, macro shot, low-angle perspective

FOR COMBINING MULTIPLE IMAGES (Official Gemini Template):
"Create a new image by combining the elements from the provided images. Take the [element from image 1] and place it with/on the [element from image 2]. The final image should be a [description of the final scene]."

FOR HIGH-FIDELITY PRESERVATION (Official Gemini Template):
"Using the provided images, place [element from image 2] onto [element from image 1]. Ensure that the features of [element from image 1] remain completely unchanged."

CRITICAL - PRESERVE DETAILS:
- Describe the subject's exact features that must be preserved (face, hair, clothing, pose)
- Maintain exact anatomy and proportions - do NOT add or remove limbs/fingers
- Do NOT morph or distort unless explicitly requested
- For faces: preserve "the exact facial features, expression, and proportions"

Now analyze the uploaded image${imageCount > 1 ? 's' : ''} and generate a prompt that:
1. Uses the official Gemini template format above
2. Explicitly states which elements come from which image (Image 1, Image 2, etc.)
3. Describes preserved features in detail so they remain unchanged
4. Ends with style, lighting, and quality descriptors

Respond with ONLY the enhanced prompt, no explanations.`
      : `You are an expert at creating starting images for AI video generation.

Given this video intent/concept: "${videoIntent}"

Generate a detailed, NARRATIVE image prompt following Gemini's official best practices.

GEMINI PROMPTING RULES:
1. DESCRIBE THE SCENE as a narrative paragraph - NOT keywords
2. BE HYPER-SPECIFIC with details about subject, environment, lighting
3. CONTROL THE CAMERA - mention shot type, lens, camera angle
4. Include: subject's pose/expression, environment details, lighting description, mood/atmosphere

TEMPLATE FOR PHOTOREALISTIC:
"A photorealistic [shot type] of [subject], [action or expression], set in [environment]. The scene is illuminated by [lighting description], creating a [mood] atmosphere. Captured with a [camera/lens details], emphasizing [key textures and details]."

The prompt should read like a scene description from a screenplay.

Respond with ONLY the image prompt, no explanations.`
    
    contentParts.push({ text: promptText })

    const response = await genai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{
        role: 'user',
        parts: contentParts,
      }],
    })

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text

    console.log('[SuggestPrompt] success', {
      hasImages,
      imageCount,
      usedOwnKey,
      usedFallback: !text,
    })

    if (text) {
      return { success: true, prompt: text.trim(), usedFallback: false }
    }

    // If the provider returns no text, fall back locally instead of failing.
    return { success: true, prompt: fallbackPrompt, usedFallback: true }
  } catch (error) {
    console.error('Prompt suggestion error:', {
      error,
      hasImages,
      imageCount,
      usedOwnKey,
    })

    // When rate-limited or erroring, fall back locally instead of breaking the button.
    // We intentionally do not surface provider error details here to avoid confusing
    // users with transient platform/quota issues when they can still proceed.
    return { success: true, prompt: fallbackPrompt, usedFallback: true }
  }
}

// =============================================================================
// Cinematic Lens (14-perspective prompt generator)
// =============================================================================

export interface CinematicLensPromptItem {
  index: number // 1-14
  title: string
  prompt: string // starts with "Using the attached image as reference,"
}

function parseNumberedPromptItems(text: string): CinematicLensPromptItem[] {
  const items: CinematicLensPromptItem[] = []
  const re = /^\s*(\d{1,2})\.\s*(.+?)\s*$/gm
  const matches: Array<{ index: number; title: string; start: number; end: number }> = []

  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1])
    if (!Number.isFinite(idx)) continue
    matches.push({
      index: idx,
      title: (m[2] || '').trim(),
      start: m.index,
      end: re.lastIndex,
    })
  }

  if (matches.length === 0) return items

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!
    const next = matches[i + 1]
    const body = text
      .slice(cur.end, next ? next.start : text.length)
      .trim()

    if (!body) continue
    items.push({
      index: cur.index,
      title: cur.title || `Perspective ${cur.index}`,
      prompt: body,
    })
  }

  return items
}

export async function generateCinematicLensPrompts(params: {
  referenceImage: { base64: string; mimeType: string }
  userApiKey?: string | null
  model?: GeminiImageModel
  allowPlatformKeyForPro?: boolean
}): Promise<{ success: boolean; usedOwnKey?: boolean; items?: CinematicLensPromptItem[]; rawText?: string; error?: string }> {
  const model = params.model || DEFAULT_MODEL
  const isPro = model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview'
  const { client: genai, usedOwnKey } = getClient(
    params.userApiKey,
    model,
    !!params.allowPlatformKeyForPro
  )

  if (!genai) {
    if (isPro && !params.userApiKey && !params.allowPlatformKeyForPro) {
      return {
        success: false,
        error: 'Gemini Pro requires your own API key. Add it in Settings (⚙️ icon in the nav bar).',
      }
    }
    return {
      success: false,
      error: 'No API key available. Configure GOOGLE_GEMINI_API_KEY(S) on the API server, or add your own Gemini API key in Settings.',
    }
  }

  const perspectives = [
    {
      name: 'Overhead + Top-Down',
      description: `Regenerate the same scene shot directly from above looking straight down. Show the subject from a bird’s-eye view with their full body or upper body visible from directly overhead. Include only the real surfaces and objects that are actually present in the reference (tables, cups, plates, utensils, condiments, etc) — do not invent new items. Keep the same environment visible as a flat, design-focused composition that reveals spatial patterns and symmetry that are not visible from eye level.`,
    },
    {
      name: 'Reverse POV',
      description: `Regenerate the scene as if viewed through the subject’s own eye. The entire scene should appear inside a giant human eyeball — with iris, pupil, veins, and eyelashes framing the image. The subject should be visible as a reflection in the eye, sitting in the same environment as the reference. Keep the underlying environment identical to the reference; the eyeball is a surreal framing device, not a new location.`,
    },
    {
      name: 'Voyeur',
      description: `Regenerate the scene as if shot through a narrow gap between two people standing in the foreground. The foreground figures should be dark silhouettes or wearing dark clothing and out of focus, creating a slit-like opening that frames the subject in the background. The subject should be partially obscured and appear to notice the viewer, creating tension and the feeling the viewer is watching something they shouldn’t. Do not change the location, props, lighting, or time of day — only the viewpoint and foreground occlusion changes.`,
    },
    {
      name: 'Mirror POV',
      description: `Regenerate the scene with the subject looking into a cracked, broken mirror. Show the back of the subject’s head and shoulder in the foreground, with their fragmented reflection staring back through the shattered glass. The cracks should split the reflection into multiple pieces at slightly different angles, creating a fractured identity effect. Keep the same environment visible within the mirror’s reflected background (same room, lighting, and mood), not a new scene.`,
    },
    {
      name: 'Extreme Macro',
      description: `Regenerate the scene as an extreme close-up focused on one eye of the subject. Fill the frame with the area around a single eye, capturing real micro-texture and detail without inventing scars, makeup, or features that aren’t present in the reference. The second eye should be barely visible at the edge of the frame. Keep the mood, lighting direction, and color tone consistent with the reference image.`,
    },
    {
      name: 'Ultra-Wide Environmental',
      description: `Regenerate the scene as a wide establishing view where the environment dominates and the subject appears small but clearly identifiable. Reveal as much of the real space as possible: architecture, people (if present), windows, fixtures, and the overall layout as it exists in the reference. If the wider framing needs more background, extend/outpaint only what is already there — do not add new locations, signage, text, or props. Keep the same time of day, lighting, and mood.`,
    },
    {
      name: 'Tracking Side Profile',
      description: `Regenerate the scene with the subject shown in full side profile as if the camera is moving alongside them. The subject should be walking or standing in profile, looking toward one side of the frame, with a sense of lateral motion. Suggest movement with soft background blur or subtle streaking, while keeping the subject’s identity and clothing consistent. Do not change the environment — keep it as the same place captured from a different moving viewpoint.`,
    },
    {
      name: '1st Person POV',
      description: `Regenerate the scene from the subject’s own eyes looking outward. Show what the subject sees, with the subject’s hands and forearms visible near the bottom of the frame interacting naturally with whatever surface/objects exist in the reference. The environment should stretch out in front of them, with other people and objects included only if they are present in the reference. Keep the same lighting, mood, and setting; only the viewpoint changes.`,
    },
    {
      name: 'Tight Profile Close-Up',
      description: `Regenerate the scene as a tight close-up of the subject’s face from the side in clean profile. Only one side of the face should be visible in sharp detail (ear, jawline, cheekbone, one eye, nose), emphasizing real texture that matches the reference. The background should be very dark or black to isolate the profile, but the subject’s identity and wardrobe must remain consistent. Keep the emotional tone aligned with the reference image.`,
    },
    {
      name: 'Periscope/Probe Lens',
      description: `Regenerate the scene from an extremely low angle at table/surface level. The camera should feel like it is sitting on the surface looking across, making near-surface objects appear large in the foreground if they exist in the reference (utensils, cups, napkins, condiments, etc). The subject’s face should be cut off or barely visible above, creating a curious, creature-like viewpoint. Do not invent new table items or props — only enlarge what is already there via perspective.`,
    },
    {
      name: 'Upside-Down',
      description: `Regenerate the exact same scene but flip the entire image upside down. Keep all details, lighting, and composition identical, only inverted so the ceiling becomes the floor and the subject is inverted. Do not introduce new elements or change the environment; this is a pure orientation inversion. Preserve the subject’s identity and clothing exactly.`,
    },
    {
      name: 'Stranger POV',
      description: `Regenerate the scene as if photographed from a nearby table or position by another person in the same environment. Include an out-of-focus foreground person (shoulder, arm, or back of head) as a framing element, with the subject visible in the middle distance. Include only real environmental details and tabletop objects that exist in the reference (menus, mugs, bottles, etc) — do not invent new items. The mood should feel observational and slightly uneasy, like candid surveillance.`,
    },
    {
      name: 'Forced-Foreground Low-Angle',
      description: `Regenerate the scene from a low angle with the subject’s hand reaching directly toward the viewer, appearing massive and distorted in the extreme foreground. The hand should dominate the lower portion of the frame while the subject’s face and body appear smaller behind it. Keep the subject’s identity, clothing, and the environment consistent with the reference; do not change the location or add new props. The forced perspective should create dramatic scale distortion and a sense of dominance or threat.`,
    },
    {
      name: 'Extreme Low Angle + Wide Lens',
      description: `Regenerate the scene shot from the floor looking sharply upward at the subject with exaggerated perspective. The subject should feel towering, with stretched perspective and dramatic convergence of ceiling/walls/fixtures above them if those elements exist in the reference. Keep the same environment, lighting, and mood; only the viewpoint changes. Do not add new architectural features — extend/outpaint only what is already there if needed.`,
    },
  ] as const

  const instruction = `Name: Cinematic Lens

You are CinemaLens — a cinematic perspective prompt generator for AI image generation.

When the user uploads an image, analyze the scene carefully — the subject, environment, lighting, mood, colors, clothing, and context.

Then generate 14 cinematic perspective prompts, each one tailored specifically to the uploaded image. Each prompt should be ready to copy and paste directly into Nano Banana Pro with the same image attached.

RULES:
1) Every prompt must start with "Using the attached image as reference," followed by the perspective instruction.
2) Every prompt must be specifically tailored to what you see in the uploaded image — describe the actual subject, their clothing, setting, mood, and details you observe.
3) Write in plain natural language — no JSON, no technical camera specs, no f-stop or focal length numbers.
4) Each prompt should be 3-5 sentences max.
5) Number each prompt clearly 1-14 with the perspective name as a header.
6) Maintain the same subject identity, clothing, and environment across all 14 prompts — only the camera perspective changes.
7) Do NOT change the environment, location, time of day, weather, or season. If a different framing/aspect ratio needs more background, EXTEND/OUTPAINT the existing background — do not replace it.
8) Only pull environment details from what is actually visible in the reference image. Do not invent set dressing.
9) These prompts are CAMERA ANGLES RELATIVE TO THE SUBJECT. The camera/framing changes — NOT the scene, NOT the subject’s identity.

ANTI-HALLUCINATION RULES:
- Keep the subject’s identity consistent (same person/creature, same wardrobe, same hair, same overall look).
- Keep the setting consistent (same location, same time of day, same lighting, same mood).
- When describing the environment, only mention elements that are actually present in the reference image.
- Do NOT invent new signage, readable text, logos, watermarks, UI overlays, brands, or extra props.
- You MAY add only the framing elements explicitly required by the perspective (e.g., eyeball framing, cracked mirror, foreground silhouettes, a foreground observer, forced-perspective reaching hand). Treat these as framing devices while keeping the underlying scene/environment unchanged.

PERSPECTIVES:
${perspectives.map((p, i) => `${i + 1}. ${p.name}\n${p.description}`).join('\n\n')}

Output format (strict):
1. Overhead + Top-Down\nUsing the attached image as reference, ...\n\n2. Reverse POV\nUsing the attached image as reference, ...\n\n... through 14.
Respond with ONLY the 14 numbered prompts. Each prompt must be a single paragraph (no extra bullet points).`

  try {
    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        inlineData: {
          mimeType: params.referenceImage.mimeType,
          data: params.referenceImage.base64,
        },
      },
      { text: instruction },
    ]

    const response = await genai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: contentParts }],
    } as any)

    const rawText = response.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n')?.trim()
    if (!rawText) {
      return { success: false, error: 'No prompts generated' }
    }

    const items = parseNumberedPromptItems(rawText)
      .filter(i => i.index >= 1 && i.index <= 14)
      .sort((a, b) => a.index - b.index)

    if (items.length < 10) {
      // If parsing failed badly, still return raw text so the UI can show something useful.
      return {
        success: false,
        error: 'Failed to parse prompts reliably',
        rawText,
      }
    }

    // Ensure each prompt starts with the required prefix (best-effort enforcement)
    const normalized = items.map(it => {
      const trimmed = it.prompt.trim()
      const required = 'Using the attached image as reference,'
      const prompt = trimmed.toLowerCase().startsWith(required.toLowerCase())
        ? trimmed
        : `${required} ${trimmed}`
      return { ...it, prompt }
    })

    return { success: true, usedOwnKey, items: normalized, rawText }
  } catch (error) {
    console.error('Cinematic Lens prompt generation error:', error)
    return { success: false, usedOwnKey, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function isImageGenerationAvailable(
  userApiKey?: string | null,
  model?: GeminiImageModel,
  allowPlatformKeyForPro: boolean = false
): boolean {
  const isPro = model === 'gemini-3-pro-image-preview' || model === 'gemini-3.1-flash-image-preview'

  // Pro model: BYOK by default; platform key only when explicitly allowed
  if (isPro) {
    return !!userApiKey || (allowPlatformKeyForPro && platformClients.length > 0)
  }

  // Flash model: user key OR platform key
  return platformClients.length > 0 || !!userApiKey
}

export function getAvailableModels(): typeof GEMINI_IMAGE_MODELS {
  return GEMINI_IMAGE_MODELS
}
