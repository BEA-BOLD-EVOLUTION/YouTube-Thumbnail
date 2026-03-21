/**
 * YouTube metadata extraction service
 * Extracts video title, description, and thumbnail for AI-powered thumbnail generation
 */

interface YouTubeMetadata {
  videoId: string
  title: string
  description: string
  channelTitle: string
  thumbnailUrl?: string
}

type TemplateType = 'technical-guide' | 'do-this-not-that' | 'subject-context'

interface TemplateAnalysis {
  templateType: TemplateType
  extractedData: Record<string, string>
  confidence: number
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url)
    
    // youtube.com/watch?v=...
    if (urlObj.hostname.includes('youtube.com')) {
      const videoId = urlObj.searchParams.get('v')
      if (videoId) return videoId
    }
    
    // youtu.be/...
    if (urlObj.hostname === 'youtu.be') {
      const videoId = urlObj.pathname.slice(1)
      if (videoId) return videoId
    }
    
    // youtube.com/embed/...
    if (urlObj.pathname.includes('/embed/')) {
      const videoId = urlObj.pathname.split('/embed/')[1]?.split('?')[0]
      if (videoId) return videoId
    }

    // youtube.com/shorts/...
    if (urlObj.pathname.includes('/shorts/')) {
      const videoId = urlObj.pathname.split('/shorts/')[1]?.split('?')[0]
      if (videoId) return videoId
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Fetch YouTube video metadata using oEmbed API (no API key required)
 * Falls back to basic metadata extraction
 */
export async function getYouTubeMetadata(url: string): Promise<YouTubeMetadata | null> {
  const videoId = extractVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  try {
    // Try oEmbed API first (no key required, but limited data)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const response = await fetch(oembedUrl)
    
    if (!response.ok) {
      throw new Error('Failed to fetch video metadata')
    }
    
    const data = (await response.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    
    return {
      videoId,
      title: data.title || 'Untitled Video',
      description: '', // oEmbed doesn't provide description
      channelTitle: data.author_name || 'Unknown Channel',
      thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    }
  } catch (error) {
    // Fallback: return basic metadata
    console.error('Failed to fetch YouTube metadata:', error)
    return {
      videoId,
      title: 'Video',
      description: '',
      channelTitle: '',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    }
  }
}

/**
 * Generate a thumbnail prompt from YouTube video metadata using specific template
 */
export function createThumbnailPromptFromMetadata(
  metadata: YouTubeMetadata,
  templateType: TemplateType = 'technical-guide'
): string {
  const { title, description, channelTitle } = metadata
  
  if (templateType === 'technical-guide') {
    return createTechnicalGuidePrompt(title, description)
  } else if (templateType === 'do-this-not-that') {
    return createDoThisNotThatPrompt(title, description)
  } else {
    return createSubjectContextPrompt(title, description)
  }
}

/**
 * Create Technical Guide style prompt (success outcome focus)
 */
function createTechnicalGuidePrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Technical Guide" style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines and cel-shading
- Single-panel composition showing the successful final outcome (AFTER state)
- Vibrant, HYPER-saturated colors with neon accents optimized for tiny mobile screens
- Large bold 3D extruded "YouTube-style" text with black outlines AND colorful drop shadows, slight perspective tilt for dynamism
- Cartoon-style icons, symbols, and success indicators rendered with depth and dimension
- Dramatic radial light burst or glow emanating from the central object
- Floating decorative elements: sparkles, stars, speed lines, small emoji-style icons, confetti particles
- Subtle gradient background (NOT flat) with energy — radial gradients, bokeh-style color orbs, or diagonal light streaks
- Every object should feel 3-dimensional with highlights, shading, and a slight glossy sheen
- NO photorealism, NO photography, NO camera effects — pure high-energy cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Analyze the video title and create a thumbnail featuring:
1. A LARGE, detailed central cartoon object that represents the successful solution — give it depth, glossy highlights, and a glowing aura or backlight
2. Radiating success indicators: glowing checkmarks, upward arrows, sparkle bursts, light rays fanning out from the center
3. MASSIVE, bold headline text extracted from the video title in chunky 3D extruded block letters with colored shadows and a slight arc or perspective tilt
4. A dynamic gradient background with energy (radial burst, diagonal streaks, or floating color orbs) — never a plain flat color
5. Scattered floating micro-details: tiny stars, sparkles, speed lines, emoji-like icons that fill empty space and add visual density
6. Focus only on the final positive result — no "before" states or comparisons

The thumbnail should feel EXPLOSIVE, energetic, and impossible to scroll past — like a candy-colored comic book panel bursting with light and detail.`
}

/**
 * Create Do This; Not That style prompt (comparison focus)
 */
function createDoThisNotThatPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Do This; Not That" comparison style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines and cel-shading — same rich detail level as a Technical Guide thumbnail
- Vertical split-screen design with DRAMATIC color contrast between sides
- The VIDEO TITLE must be the LARGEST, most prominent text — displayed across the top in massive bold 3D extruded block letters with black outlines, colored drop shadows, and slight perspective tilt
- The words "DO THIS; NOT THAT" appear SMALLER at the bottom of the image as a subtitle/label in yellow and white
- Left side: desaturated/gloomy background with dark vignette, large red circle-X icon with glow, red-tinted lighting, visual "broken" energy (cracks, frown emojis, static lines)
- Right side: vibrant glowing background with radiant light burst, large green circle-checkmark icon with sparkle glow, green-tinted lighting, visual "success" energy (sparkles, stars, upward arrows)
- Both sides feature DETAILED, richly drawn cartoon objects and devices related to the topic — not simple flat icons, but fully illustrated cartoon graphics with depth, shading, glossy highlights, and personality (e.g. cartoon phones with screens showing content, cartoon microphones with sound waves, cartoon laptops with UI elements)
- Floating micro-details on both sides: sparkles, emoji icons, particle effects, speed lines
- NO photorealism, NO photography, NO camera effects — pure high-energy cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

TEXT HIERARCHY (most important):
1. TOP — Video title headline in MASSIVE bold 3D extruded block letters with colored shadow (biggest text in the image)
2. BOTTOM — "DO THIS; NOT THAT" in smaller but still bold text as a category label

INSTRUCTIONS:
Analyze the video title and create a comparison thumbnail:
1. TOP: Display a short, punchy headline derived from the video title in the LARGEST 3D extruded block text with colored drop shadow and slight arc or tilt for dynamism
2. LEFT SIDE (Wrong Way): Create DETAILED cartoon illustrations of the wrong approach — draw fully rendered cartoon objects/devices/tools related to the topic that look broken, messy, outdated, or low-quality. Add a large red circle-X icon with a red glow. Use muted blue/gray/purple background with dark vignette. Scatter sad/broken micro-details (cracks, frown emojis, downward arrows, static lines).
3. RIGHT SIDE (Right Way): Create DETAILED cartoon illustrations of the right approach — draw the same type of objects but looking polished, modern, high-quality, and glowing with success. Add a large green circle-checkmark icon with sparkle aura. Use vibrant teal/green/emerald background with radial light burst. Scatter success micro-details (sparkles, stars, upward arrows, heart emojis).
4. BOTTOM: Place "DO THIS; NOT THAT" in smaller bold text centered at the bottom
5. The cartoon objects on each side should be lavishly detailed — with thick outlines, cel-shading, glossy highlights, and tons of floating decorative elements that fill the space
6. Make the contrast between sides EXTREME — the wrong side should feel dark, gloomy, and broken while the right side should feel radiant, glowing, and energetic

The thumbnail should feel like two different worlds colliding — impossible to scroll past, with explosive visual density and dramatic contrast.`
}

/**
 * Create Subject + Context style prompt (informational focus)
 */
function createSubjectContextPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Subject + Context" informational style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines and cel-shading
- Dynamic gradient background with hyper-saturated colors, neon accents, and radial energy (light bursts, floating color orbs, diagonal streaks)
- Main subject in MASSIVE, bold 3D extruded block text with black outlines, colored drop shadows, and slight perspective tilt
- Cartoon-style supporting icons and visual elements with depth, glossy highlights, and glowing auras
- Every element has dimension: cel-shading, glossy sheen, subtle shadows
- Floating micro-details fill the space: sparkles, tiny stars, speed lines, confetti, emoji-style icons
- NO photorealism, NO photography, NO camera effects — pure high-energy cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Create a professional informational thumbnail:
1. Display the main subject from the title in MASSIVE, bold 3D extruded block text at the top/center with colored drop shadows and slight perspective tilt
2. Add fully detailed cartoon supporting visual elements (icons, devices, symbols, or metaphors) with depth, glossy highlights, and glowing auras — not simple flat shapes
3. Use a dynamic gradient background with energy: radial burst, diagonal light streaks, or floating neon color orbs — never a plain flat color
4. Ensure high contrast and legibility with thick outlines and cel-shading on all elements
5. Scatter floating micro-details throughout: sparkles, tiny stars, speed lines, emoji-style icons, confetti particles to fill empty space
6. Every element should have depth and dimensionality — glossy sheen, highlights, subtle shadows

The thumbnail should feel energetic and premium — like a candy-colored comic book cover bursting with light and visual density. Impossible to scroll past.`
}
