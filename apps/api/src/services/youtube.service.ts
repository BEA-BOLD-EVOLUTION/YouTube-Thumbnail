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
- Bold, high-contrast 2D cartoon illustration with thick clean outlines
- Single-panel composition showing the successful final outcome (AFTER state)
- Vibrant, saturated flat colors optimized for mobile screens
- Large bold 3D "YouTube-style" text with black outlines and drop shadows for the headline
- Cartoon-style icons, symbols, and success indicators
- NO photorealism, NO photography, NO camera effects — pure illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Analyze the video title and create a thumbnail featuring:
1. A central cartoon-style object or visual that represents the successful solution
2. Glowing success indicators, checkmarks, or positive visual elements around it
3. Large, bold headline text extracted from the video title in 3D block letters
4. High contrast, clean bold outlines, flat color fills
5. Focus only on the final positive result - no "before" states or comparisons

The thumbnail should clearly communicate achievement and success in a bold cartoon illustration style.`
}

/**
 * Create Do This; Not That style prompt (comparison focus)
 */
function createDoThisNotThatPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Do This; Not That" comparison style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines — same rich detail level as a Technical Guide thumbnail
- Vertical split-screen design with strong color contrast between sides
- The VIDEO TITLE must be the LARGEST, most prominent text — displayed across the top in massive bold 3D block letters with black outlines and drop shadows
- The words "DO THIS; NOT THAT" appear SMALLER at the bottom of the image as a subtitle/label in yellow and white
- Left side: muted/dull color background with large red circle-X icon (WRONG way)
- Right side: vibrant color background with large green circle-checkmark icon (RIGHT way)
- Both sides feature DETAILED, richly drawn cartoon objects and devices related to the topic — not simple flat icons, but fully illustrated cartoon graphics with depth, shading, and personality (e.g. cartoon phones with screens showing content, cartoon microphones with sound waves, cartoon laptops with UI elements, cartoon game controllers with buttons and details)
- NO photorealism, NO photography, NO camera effects — pure cartoon illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

TEXT HIERARCHY (most important):
1. TOP — Video title headline in MASSIVE bold 3D block letters (biggest text in the image)
2. BOTTOM — "DO THIS; NOT THAT" in smaller but still bold text as a category label

INSTRUCTIONS:
Analyze the video title and create a comparison thumbnail:
1. TOP: Display a short, punchy headline derived from the video title in the LARGEST 3D block text
2. LEFT SIDE (Wrong Way): Create DETAILED cartoon illustrations of the wrong approach — draw fully rendered cartoon objects/devices/tools related to the topic that look broken, messy, outdated, or low-quality. Add a large red circle-X icon. Use muted blue/gray/purple background.
3. RIGHT SIDE (Right Way): Create DETAILED cartoon illustrations of the right approach — draw the same type of objects but looking polished, modern, high-quality, and professional. Add a large green circle-checkmark icon. Use vibrant teal/green/emerald background.
4. BOTTOM: Place "DO THIS; NOT THAT" in smaller bold text centered at the bottom
5. The cartoon objects on each side should be as detailed and richly illustrated as a Technical Guide thumbnail — with thick outlines, vibrant colors, small decorative details (sparkles, hearts, arrows, emojis), and visual personality
6. Make the contrast between the wrong side (dull, broken, messy) and right side (clean, polished, successful) visually striking

The thumbnail should immediately communicate a clear wrong/right comparison with rich, detailed cartoon illustrations.`
}

/**
 * Create Subject + Context style prompt (informational focus)
 */
function createSubjectContextPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Subject + Context" informational style:

STYLE REQUIREMENTS:
- Bold, high-contrast 2D cartoon illustration with thick clean outlines
- Modern gradient background with vibrant, saturated colors
- Main subject in large, bold 3D block text with black outlines and drop shadows
- Cartoon-style supporting icons and visual elements with thick outlines
- Flat color fills, no gradients on objects — clean graphic design
- NO photorealism, NO photography, NO camera effects — pure illustration

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Create a professional informational thumbnail:
1. Display the main subject from the title in large, bold 3D block text at the top/center
2. Add cartoon-style supporting visual elements (icons, symbols, or metaphors) that represent the context
3. Use modern gradient background with professional styling
4. Ensure high contrast and legibility with thick outlines on all elements
5. Create a balanced composition that draws attention to the subject first

The thumbnail should clearly communicate the topic in a bold cartoon illustration style.`
}
