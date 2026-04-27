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

type TemplateType = 'technical-guide' | 'do-this-not-that' | 'subject-context' | 'bold-headline'

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
  } else if (templateType === 'bold-headline') {
    return createBoldHeadlinePrompt(title, description)
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
- Vibrant, saturated colors with strong contrast, optimized for tiny mobile screens
- Large bold 3D extruded "YouTube-style" headline text with black outlines and a colored drop shadow, slight perspective tilt
- Every object should feel 3-dimensional with cel-shaded highlights and a slight glossy sheen
- NO photorealism, NO photography, NO camera effects — pure cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

THEME COHERENCE (most important):
First, identify the SPECIFIC subject matter of the video from its title. Every visual element in the
thumbnail must be drawn from that subject's real-world iconography. The decoration is NOT generic —
it IS the topic. For example:
  • "US Creator Taxes" → 1040/W-9 forms, calculator, stack of dollar bills, IRS-style envelope, pen, magnifying glass over a tax form, percent symbol, receipts. NO generic checkmarks/confetti.
  • "Best Lighting for YouTube" → ring light, softbox, LED panel, camera, brightness sliders.
  • "How to Get Sponsors" → handshake, brand logos on a contract, dollar signs, email envelope, phone showing DMs.
  • "Beat the Algorithm" → stylized graph trending up, play button, view counter, retention curve, click cursor.

INSTRUCTIONS:
Analyze the title and design a thumbnail with:
1. A LARGE, detailed central cartoon object (or a tight cluster of 2–3 related objects) that literally depicts the topic — pulled from the iconography list you derived above. Give it depth, cel-shading, and a glossy sheen.
2. 2–4 supporting cartoon props arranged around the hero object — also drawn from the topic's iconography. They should feel like part of the scene, not floating decoration.
3. MASSIVE 3D extruded headline derived from the title in chunky block letters with a black outline and a single colored drop shadow. Slight perspective tilt is fine; do not over-stylize.
4. A clean gradient background in 1–2 colors that match the topic's mood (e.g. green/gold for money topics, blue/white for tech, warm orange for cooking). It can have soft directional light or a subtle vignette, but NOT a high-contrast radial burst behind the subject.
5. Optional accents ONLY when they reinforce the theme — e.g. a couple of small green checkmarks for a "how to" success topic, a few coin sparkles for a money topic. If accents do not reinforce the topic, omit them entirely.

STRICTLY AVOID:
- Generic radial light bursts, sun-ray fans, or explosion lines behind the subject when they do not belong to the topic
- Confetti, party streamers, or celebration particles unless the video is literally about a celebration
- Random floating sparkles, stars, speed lines, hearts, or emoji clutter used as filler
- Repeating the same decoration set across unrelated topics — every thumbnail should look distinctly tied to its title

The goal: a viewer should be able to guess the video's exact topic from the imagery alone, before reading the headline.`
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
- Clean gradient background tied to the topic's mood — NOT a generic radial burst or sparkle field
- Main subject in MASSIVE, bold 3D extruded block text with black outlines and a colored drop shadow, slight perspective tilt
- Cartoon supporting icons and visual elements with cel-shaded depth and glossy highlights
- NO photorealism, NO photography, NO camera effects — pure cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

THEME COHERENCE (most important):
Identify the specific subject of the video and choose iconography that REAL viewers of that topic
would recognize. The supporting visuals must come from the topic itself, not from a generic
"YouTube thumbnail" decoration kit.

INSTRUCTIONS:
1. Display the main subject phrase from the title in MASSIVE 3D extruded block text with a black outline and one colored drop shadow.
2. Surround the headline with 2–4 detailed cartoon objects pulled directly from the topic's real-world iconography (props, devices, symbols viewers of this exact subject would recognize). No abstract decoration.
3. Use a calm gradient background in 1–2 colors matching the topic's mood (money → green/gold, tech → blue, food → warm orange, etc.). Optional subtle directional light, but NOT a radial sun-burst behind the subject.
4. Keep all elements high-contrast and clearly readable on a small mobile screen.
5. Add floating accents ONLY when they reinforce the theme; otherwise leave the negative space clean. Do not fill empty space with random sparkles, speed lines, or confetti.

STRICTLY AVOID:
- Generic radial light bursts, sun-ray fans, sparkle clouds, confetti, or speed lines used as filler
- Decoration that would look identical across unrelated topics
- Anything that draws attention away from the topic-specific objects

The finished thumbnail should look distinctly like a thumbnail for THIS video — recognizable from imagery alone.`
}

/**
 * Create Bold Headline + Icons style prompt (side-by-side headline and icon cluster)
 */
function createBoldHeadlinePrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Bold Headline + Icons" side-by-side style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines and cel-shading
- SIDE-BY-SIDE split composition: one half is dominated by MASSIVE stacked headline text, the other half is a well-arranged cluster of themed cartoon icons and illustrations
- The headline text should be in MASSIVE, bold 3D extruded block text with black outlines, colored drop shadows, and mixed yellow/white coloring — stacked vertically to fill the entire half
- Some words in the headline should use a different highlight color (e.g., one word in italic or a contrasting color) for emphasis
- The icon cluster side features richly detailed cartoon illustrations related to the video topic — drawn with thick outlines, cel-shading, glossy highlights, and depth
- Small floating accents scattered sparingly on the icon side: sparkles, arrows, hearts, stars, engagement emoji icons
- Platform branding elements (e.g., TikTok LIVE badge, streaming UI elements) can be integrated into the icon cluster if relevant to the topic
- The two halves should have dramatically different background colors for strong visual contrast (e.g., deep purple vs warm cream, bold red vs light blue)
- Backgrounds should be clean — solid colors or simple gradients, NO radial bursts, NO light rays, NO explosion effects
- Optionally include a smartphone or device frame showing a live stream or social media interface as part of the icon cluster
- NO photorealism, NO photography, NO camera effects — pure bold cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Analyze the video title and create a side-by-side thumbnail:
1. ONE HALF — HEADLINE: Extract a short, punchy headline from the video title (2-4 words max). Display it in MASSIVE stacked 3D extruded block text filling the entire half. Use mixed colors (yellow for emphasis words, white for others) with black outlines and colored drop shadows. The text should be bold and highly legible.
2. OTHER HALF — ICON CLUSTER: Create a well-arranged cluster of detailed cartoon icons and illustrations that visually represent the video's topic. Draw them with thick outlines, cel-shading, glossy highlights, and depth — not simple flat icons. Include 4-8 varied, richly illustrated objects.
3. BACKGROUND: Use dramatically contrasting solid colors or simple gradients for each half — one bold/saturated, one lighter/warmer. Keep backgrounds clean with no radial bursts or light rays.
4. ACCENTS: Add small sparkles, arrows, hearts, or stars sparingly around the icon cluster to fill gaps — do not overload with floating details.
5. If the video topic involves social media, streaming, or content creation, include platform branding elements (badges, logos, chat bubbles) naturally within the icon cluster.
6. The overall composition should feel like a polished magazine cover or bold social media graphic — clean, confident, and eye-catching.

The thumbnail should feel bold and confident — a clean two-panel visual with massive text impact on one side and a rich cluster of themed cartoon icons on the other.`
}
