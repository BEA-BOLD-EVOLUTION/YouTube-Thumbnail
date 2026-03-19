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
    
    const data = await response.json()
    
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
- High-contrast 2D digital illustration style
- Single-panel composition showing the successful final outcome (AFTER state)
- Clean, vibrant colors optimized for mobile screens
- Bold yellow 3D "YouTube-style" text for the headline
- Success indicators and positive visual elements

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Analyze the video title and create a thumbnail featuring:
1. A central object or visual that represents the successful solution
2. Glowing success indicators, checkmarks, or positive visual elements around it
3. Large, bold headline text extracted from the video title at the top
4. High contrast, clean bold lines
5. Focus only on the final positive result - no "before" states or comparisons

The thumbnail should clearly communicate achievement and success.`
}

/**
 * Create Do This; Not That style prompt (comparison focus)
 */
function createDoThisNotThatPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Do This; Not That" comparison style:

STYLE REQUIREMENTS:
- High-contrast 2D digital illustration with vertical split-screen design
- Large, bold 3D text "DO THIS; NOT THAT" centered over the split in yellow and white
- Left side: muted/dull color background with red circle-X icon (WRONG way)
- Right side: vibrant color background with green circle-checkmark icon (RIGHT way)
- Clean lines, professional graphic design
- All text must be large and highly visible

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Analyze the video title and create a comparison thumbnail:
1. LEFT SIDE (Wrong Way): Show the problem, mistake, or inefficient method with a muted blue/gray background and large red X
2. RIGHT SIDE (Right Way): Show the solution, correct method, or optimal approach with a vibrant green/emerald background and large green checkmark
3. Center the text "DO THIS; NOT THAT" in bold 3D letters overlapping both sides
4. Make the contrast between wrong and right visually striking
5. Use relevant visual metaphors or icons that represent the video's topic

The thumbnail should immediately communicate a clear before/after or wrong/right comparison.`
}

/**
 * Create Subject + Context style prompt (informational focus)
 */
function createSubjectContextPrompt(title: string, description: string): string {
  return `Create a YouTube thumbnail in the "Subject + Context" informational style:

STYLE REQUIREMENTS:
- Professional, high-impact digital illustration
- Modern gradient background with vibrant colors
- Main subject in large, bold, eye-catching 3D text
- Supporting context through relevant icons and visual elements
- High contrast, balanced composition
- Optimized for mobile viewing

VIDEO CONTEXT:
Title: "${title}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}

INSTRUCTIONS:
Create a professional informational thumbnail:
1. Display the main subject from the title in large, bold 3D text at the top/center
2. Add supporting visual elements (icons, symbols, or metaphors) that represent the context
3. Use modern gradient background with professional styling
4. Ensure high contrast and legibility
5. Create a balanced composition that draws attention to the subject first

The thumbnail should clearly communicate the topic in a professional, informative way.`
}
