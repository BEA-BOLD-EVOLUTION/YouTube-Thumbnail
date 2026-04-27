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
// Timeout helper
// - Gemini's SDK does not expose per-request timeouts, so a slow/stalled call
//   will hold the HTTP connection and (on the platform key) eat into the
//   hourly rate limit. Race the SDK promise against a timer and surface a
//   consistent error when we give up.
// =============================================================================

const IMAGE_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS ?? '90000')
const TEXT_TIMEOUT_MS = Number(process.env.GEMINI_TEXT_TIMEOUT_MS ?? '30000')

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
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
const TEXT_MODEL = 'gemini-2.5-flash'

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
  /**
   * When true, skip prepending STYLE_PROMPTS to the prompt.
   * Use this when the prompt already contains its own style instructions
   * (e.g. YouTube template prompts that specify "2D digital illustration").
   */
  skipStylePrefix?: boolean
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
  
  'illustration': `A bold, high-energy 2D cartoon illustration with thick clean outlines and cel-shading. 
    Hyper-saturated, candy-colored palette with neon accents and dramatic contrast. 
    Every element has depth: 3D extruded text, glossy highlights, glowing auras, and radial light bursts. 
    Dynamic gradient background with energy — radial bursts, floating color orbs, or diagonal light streaks. 
    Scattered floating details: sparkles, tiny stars, speed lines, confetti, and emoji-style icons for visual density. 
    The overall feel is explosive, premium, and impossible to scroll past — like a top-tier YouTube thumbnail.`,
  
  'concept-art': `A detailed concept art piece suitable for film or game production. 
    The scene features atmospheric perspective with rich environmental storytelling. 
    Painted with bold, confident brushstrokes that convey both form and mood. 
    The lighting is dramatic and emphasizes the focal point of the composition.`,
}

// =============================================================================
// Intelligent Prompt Enhancement (Based on Official Gemini Documentation)
// =============================================================================

/** Style-aware openers used by the local fallback prompt enhancement. */
const STYLE_FALLBACK_OPENERS: Record<string, { opener: string; closer: string }> = {
  'photorealistic': {
    opener: 'A photorealistic, high-resolution photograph of',
    closer: 'Captured with professional camera equipment, emphasizing sharp detail and rich textures.',
  },
  'cinematic': {
    opener: 'A cinematic still frame depicting',
    closer: 'Shot with anamorphic lenses featuring dramatic shadows, rich color grading, and film-like grain.',
  },
  'anime': {
    opener: 'A vibrant anime-style illustration of',
    closer: 'Features clean bold outlines, expressive character design, saturated harmonious colors with soft cel-shading.',
  },
  'illustration': {
    opener: 'A bold, high-energy 2D cartoon illustration of',
    closer: 'Features thick clean outlines, cel-shading, hyper-saturated candy-colored palette with neon accents, glossy highlights, and 3D extruded text with drop shadows.',
  },
  'concept-art': {
    opener: 'A detailed concept art piece depicting',
    closer: 'Painted with bold, confident brushstrokes featuring atmospheric perspective and dramatic lighting.',
  },
}

/**
 * Transforms poorly-worded prompts into professional Nano Banana prompts.
 * Respects the selected style — never defaults to photorealistic when another style is active.
 */
function intelligentPromptEnhancement(rawPrompt: string, style?: string): {
  isKeywordList: boolean
  hasStyleTerms: boolean
  enhanced: string
} {
  const prompt = rawPrompt.trim()
  const effectiveStyle = style || 'photorealistic'
  const styleFallback = STYLE_FALLBACK_OPENERS[effectiveStyle] || STYLE_FALLBACK_OPENERS['photorealistic']
  
  // Detect keyword lists (comma-separated, short phrases)
  const hasCommas = prompt.includes(',')
  const words = prompt.split(/[\s,]+/)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length
  const isKeywordList = hasCommas && avgWordLength < 8 && words.length > 3
  
  // Detect if already has style-related terms (photography or illustration terms)
  const styleTerms = [
    'shot', 'lens', 'lighting', 'camera', 'focus', 'bokeh', 'depth of field',
    'exposure', 'composition', 'frame', 'angle', 'perspective', 'photograph',
    'illuminated', 'captured', 'cinematic', 'wide-angle', 'macro', 'portrait',
    'close-up', 'studio-lit', 'softbox', 'natural light', 'golden hour',
    'illustration', 'cartoon', 'cel-shading', 'outlines', 'anime', 'concept art',
    'painted', 'brushstrokes', 'drawing',
  ]
  const hasStyleTerms = styleTerms.some(term => 
    prompt.toLowerCase().includes(term)
  )
  
  if (isKeywordList) {
    const keywords = prompt.split(',').map(k => k.trim()).filter(k => k)
    
    const subject = keywords[0] || 'subject'
    const remainingKeywords = keywords.slice(1)
    
    const environmentKeywords = ['beach', 'mountain', 'forest', 'city', 'studio', 'room', 'outdoor', 'indoor']
    const environment = remainingKeywords.find(k => 
      environmentKeywords.some(e => k.toLowerCase().includes(e))
    ) || 'a dynamic setting'
    
    const moodKeywords = ['sunset', 'sunrise', 'dramatic', 'soft', 'moody', 'bright', 'dark', 'vibrant', 'bold']
    const mood = remainingKeywords.find(k => 
      moodKeywords.some(m => k.toLowerCase().includes(m))
    ) || 'compelling'
    
    let narrative = `${styleFallback.opener} ${subject}, `
    narrative += `set in ${environment}, with a ${mood} atmosphere. `
    narrative += `${styleFallback.closer} `
    
    const otherDescriptors = remainingKeywords.filter(k => 
      k !== environment && k !== mood
    )
    if (otherDescriptors.length > 0) {
      narrative += `Key characteristics include: ${otherDescriptors.join(', ')}. `
    }
    
    return {
      isKeywordList: true,
      hasStyleTerms: false,
      enhanced: narrative
    }
  }
  
  if (!hasStyleTerms && prompt.length < 100) {
    let enhanced = `${styleFallback.opener} ${prompt.toLowerCase()}. `
    enhanced += `${styleFallback.closer}`
    
    return {
      isKeywordList: false,
      hasStyleTerms: false,
      enhanced
    }
  }
  
  // Already well-formed with style terms - return as is
  return {
    isKeywordList: false,
    hasStyleTerms: true,
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
  hasReference?: boolean,
  skipStylePrefix?: boolean
): string {
  // When skipStylePrefix is set, the prompt already contains its own style
  // (e.g. YouTube template output from suggestImagePrompt). Don't rewrite it.
  if (skipStylePrefix) {
    let enhanced = prompt
    
    if (aspectRatio === '16:9') {
      enhanced += '\n\nThe composition is wide, utilizing the horizontal frame for maximum impact.'
    } else if (aspectRatio === '9:16') {
      enhanced += '\n\nThe composition is vertical, optimized for portrait orientation.'
    } else if (aspectRatio === '1:1') {
      enhanced += '\n\nThe composition is balanced and centered in a square format.'
    }
    
    return enhanced
  }

  // Step 1: Intelligent enhancement (transform poor prompts per official guidance)
  const { enhanced: smartPrompt } = intelligentPromptEnhancement(prompt, style)
  
  let enhanced = ''
  
  // Step 2: Add style-specific guidance (narrative descriptions)
  // Skip when the prompt already embeds its own style (e.g. YouTube templates)
  if (!skipStylePrefix && style && STYLE_PROMPTS[style]) {
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
  const { enhanced: smartUserPrompt, isKeywordList } = intelligentPromptEnhancement(userPrompt, style)
  
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
          const analysis = intelligentPromptEnhancement(params.prompt, params.style)
          rawPromptAnalysis = {
            wasKeywordList: analysis.isKeywordList,
            hadPhotographyTerms: analysis.hasStyleTerms,
            wasEnhanced: analysis.enhanced !== params.prompt
          }
          return enhancePromptForImageGeneration(params.prompt, params.style, params.aspectRatio, false, params.skipStylePrefix)
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
      const response = await withTimeout(
        genai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: contentParts }],
          config,
          tools: [{ google_search: {} }]
        } as any),
        IMAGE_TIMEOUT_MS,
        `Gemini image+search (${model})`
      )
      
      const parts = response.candidates?.[0]?.content?.parts || []
      
      let imageData: { base64: string; mimeType: string } | null = null
      let thinking: string | undefined
      
      for (const part of parts) {
        if (part.inlineData?.data) {
          imageData = {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
          }
        } else if (part.thought) {
          thinking = part.text
        }
      }

      if (imageData && imageData.base64.length > 0) {
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
    
    const response = await withTimeout(
      genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: contentParts }],
        config,
      } as any),
      IMAGE_TIMEOUT_MS,
      `Gemini image (${model})`
    )

    const parts = response.candidates?.[0]?.content?.parts || []
    const finishReason = (response.candidates?.[0] as any)?.finishReason

    let imageData: { base64: string; mimeType: string } | null = null
    let thinking: string | undefined
    let textFeedback = ''

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageData = {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      } else if ((part as any).thought) {
        thinking = (part as any).thought
      } else if ((part as any).text) {
        textFeedback += (part as any).text
      }
    }

    if (imageData && imageData.base64.length > 0) {
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

    // No usable image — surface what we actually got so the user isn't left with
    // a broken "failed to load" image tag.
    console.warn('[ImageGen] No image in response', {
      model,
      finishReason,
      partCount: parts.length,
      hadEmptyInlineData: !!imageData && imageData.base64.length === 0,
      textFeedback: textFeedback.slice(0, 500),
    })

    let errorMsg = 'No image was generated.'
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      errorMsg = 'The prompt was blocked by safety filters. Try rephrasing — avoid explicit content, real-person likenesses, or sensitive topics.'
    } else if (finishReason === 'RECITATION') {
      errorMsg = 'The model refused to generate this image (possible copyright concern). Try a more original prompt.'
    } else if (textFeedback.trim()) {
      errorMsg = `The model responded with text instead of an image: "${textFeedback.trim().slice(0, 200)}". Try making the prompt more visual and specific.`
    } else {
      errorMsg = 'The model did not return an image. Try simplifying or rephrasing the prompt.'
    }

    return { success: false, error: errorMsg }
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

    if (normalized.includes('timed out')) {
      errorMessage = 'Image generation took too long and was cancelled. The model may be under load — please try again in a moment.'
    } else if (errorMessage.includes('API key')) {
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

// =============================================================================
// Style-Aware Enhance Prompt Builder
// =============================================================================

const STYLE_ENHANCE_INSTRUCTIONS: Record<string, { description: string; template: string; rules: string }> = {
  'photorealistic': {
    description: 'a photorealistic photograph',
    template: `"A photorealistic [shot type] of [subject], [action or expression], set in [environment]. The scene is illuminated by [lighting description], creating a [mood] atmosphere. Captured with a [camera/lens details], emphasizing [key textures and details]."`,
    rules: `- Use photographic terms: camera angle, lens type, lighting setup, depth of field, bokeh
- Describe realistic textures, materials, and natural lighting
- Write like a film set description: specific, tangible, physical`,
  },
  'cinematic': {
    description: 'a cinematic still frame from a high-budget film',
    template: `"A cinematic [shot type] of [subject], [action or expression], set in [environment]. The scene features dramatic, moody lighting with [lighting details]. Shot with anamorphic lenses creating [visual characteristics]. The color grading is [mood/tone] with [color details]."`,
    rules: `- Use cinematic terms: anamorphic, color grading, film grain, dramatic shadows, lens flare
- Emphasize mood, atmosphere, and storytelling through visual composition
- Write like a screenplay scene description`,
  },
  'anime': {
    description: 'a vibrant anime-style illustration',
    template: `"A vibrant anime-style illustration of [subject], [action or expression], in [environment]. The art features [line work details] with [color palette]. The mood is [atmosphere] with [background details]."`,
    rules: `- Use anime/manga art terms: cel-shading, clean outlines, expressive eyes, dynamic poses
- NO camera terms, NO lens types, NO bokeh, NO depth of field, NO "photograph"
- Describe art style: line weight, color palette, shading technique, background style
- Reference anime aesthetic: saturated colors, dramatic expressions, atmospheric effects`,
  },
  'illustration': {
    description: 'a bold, high-energy 2D cartoon illustration',
    template: `"A bold, high-energy 2D cartoon illustration of [subject], [action or visual concept], with [style details]. The design features [text/headline treatment]. The background is [background style]. Scattered [decorative details]."`,
    rules: `- Use illustration terms: thick outlines, cel-shading, flat color fills, neon accents, 3D extruded text
- NO camera terms, NO lens types, NO "photograph", NO "photorealistic", NO photography language
- Describe: bold outlines, glossy highlights, glow effects, radial light bursts, floating sparkles
- Text should be described as MASSIVE 3D block letters with drop shadows and glowing edges
- The feel should be EXPLOSIVE and PREMIUM — like a top-tier YouTube thumbnail`,
  },
  'concept-art': {
    description: 'a detailed concept art piece for film or game production',
    template: `"A detailed concept art piece depicting [subject], [action or scene], in [environment]. Painted with [brush/technique details], featuring [lighting and atmosphere]. The composition emphasizes [focal point and mood]."`,
    rules: `- Use concept art terms: painterly brushstrokes, atmospheric perspective, environmental storytelling
- NO photography language — this is a painting, not a photograph
- Describe painted qualities: brush confidence, color mood, composition drama
- Emphasize world-building and visual narrative`,
  },
}

function buildStyleAwareEnhancePrompt(videoIntent: string, style: string, aspectRatio?: string): string {
  const styleInfo = STYLE_ENHANCE_INSTRUCTIONS[style] || STYLE_ENHANCE_INSTRUCTIONS['photorealistic']

  let prompt = `You are an expert at creating image generation prompts optimized for Gemini's native image generation.

The user wants to create ${styleInfo.description}.

Their concept: "${videoIntent}"

YOUR TASK: Rewrite this into a detailed, NARRATIVE image prompt that will produce a HIGH-QUALITY ${styleInfo.description}.

STYLE-SPECIFIC TEMPLATE:
${styleInfo.template}

STYLE RULES:
${styleInfo.rules}

GENERAL RULES:
1. DESCRIBE THE SCENE as a narrative paragraph — NOT a list of keywords
2. BE HYPER-SPECIFIC with visual details: colors, materials, textures, spatial relationships
3. Match the art style EXACTLY — do not default to photorealistic unless that is the selected style
4. Use SEMANTIC POSITIVE descriptions — describe what you WANT, not what you don't want`

  if (aspectRatio) {
    prompt += `\n5. The output should be composed for a ${aspectRatio} aspect ratio`
  }

  prompt += `\n\nRespond with ONLY the enhanced image prompt, no explanations.`
  return prompt
}

export async function suggestImagePrompt(
  videoIntent: string,
  userApiKey?: string | null,
  referenceImages?: Array<{ base64: string; mimeType: string }>,
  options?: { preserveStyleInstructions?: boolean; style?: string; aspectRatio?: string }
): Promise<{ success: boolean; prompt?: string; error?: string; usedFallback?: boolean }> {
  // Always prepare a local fallback so the UX stays functional even if:
  // - the platform key is missing during deploy/restart
  // - the provider is temporarily rate limited
  // - the SDK errors in unexpected ways
  const hasImages = referenceImages && referenceImages.length > 0
  const imageCount = referenceImages?.length || 0
  const effectiveStyle = options?.style || 'cinematic'
  const fallbackPrompt = hasImages
    ? buildReferencePrompt(videoIntent, effectiveStyle, imageCount)
    : options?.preserveStyleInstructions
      ? videoIntent  // YouTube templates already contain style; don't rewrite
      : enhancePromptForImageGeneration(videoIntent, effectiveStyle)

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
      : options?.preserveStyleInstructions
      ? `You are an expert at creating EXPLOSIVE, eye-catching YouTube thumbnail image prompts that POP off the screen.

The user has provided a structured thumbnail brief with specific STYLE REQUIREMENTS and INSTRUCTIONS.
Your job is to expand this into a hyper-detailed, vivid image generation prompt while STRICTLY preserving
the style requirements described. Do NOT convert illustration/cartoon styles into photorealistic.
AMPLIFY the visual energy — make everything bolder, more vibrant, more dynamic.

Here is the brief:
"""${videoIntent}"""

YOUR TASK:
1. KEEP the exact art style described (2D cartoon illustration, thick outlines, cel-shading, etc.)
2. Analyze the video title in the brief and design THEME-SPECIFIC visual elements drawn from the
   real-world iconography of the topic. Every supporting object must be something a viewer of that
   exact topic would recognize. Do NOT use generic decoration as filler.
3. Describe each visual element in concrete detail — specific objects, colors, materials, sheen.
4. Write the prompt as one cohesive paragraph describing the final thumbnail image.
5. Include the specific text/headlines as MASSIVE 3D extruded block letters with a black outline
   and one colored drop shadow, slight tilt is fine.
6. Describe the background as a clean gradient (1–2 colors) tied to the topic's mood — NOT a
   high-contrast radial burst behind the subject and NOT a sparkle/confetti field.
7. Leave negative space clean. Only add small accents (e.g. a checkmark, a coin sparkle) when they
   directly reinforce the topic.

STRICTLY AVOID injecting any of the following unless the topic literally calls for it:
- Radial light bursts, sun-ray fans, explosion lines behind the subject
- Confetti, party streamers, celebration particles
- Floating sparkles, stars, speed lines, hearts, or emoji clutter used as filler
- Generic "every YouTube thumbnail" decoration that would look identical across unrelated videos

IMPORTANT:
- The output must describe a 2D cartoon illustration, NOT a photograph
- NO camera terms, NO lens types, NO lighting setups, NO bokeh, NO depth of field
- YES: bold outlines, cel-shading, glossy highlights, 3D extruded text with a colored shadow,
  topic-specific cartoon objects rendered with depth
- The final thumbnail should be instantly recognizable as being about THIS specific video — a
  viewer should be able to guess the topic from the imagery alone, before reading the headline.

Respond with ONLY the enhanced image prompt, no explanations.`
      : buildStyleAwareEnhancePrompt(videoIntent, effectiveStyle, options?.aspectRatio)
    
    contentParts.push({ text: promptText })

    const response = await withTimeout(
      genai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{
          role: 'user',
          parts: contentParts,
        }],
      }),
      TEXT_TIMEOUT_MS,
      `Gemini text (${TEXT_MODEL})`
    )

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

    const response = await withTimeout(
      genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: contentParts }],
      } as any),
      TEXT_TIMEOUT_MS,
      `Gemini lens-prompt (${model})`
    )

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
