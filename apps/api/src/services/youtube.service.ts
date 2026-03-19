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
 * Generate a thumbnail prompt from YouTube video metadata
 */
export function createThumbnailPromptFromMetadata(metadata: YouTubeMetadata): string {
  const { title, description, channelTitle } = metadata
  
  let context = `Video title: "${title}"`
  
  if (description) {
    // Limit description length
    const shortDesc = description.slice(0, 500)
    context += `\nVideo description: "${shortDesc}${description.length > 500 ? '...' : ''}"`
  }
  
  if (channelTitle) {
    context += `\nChannel: ${channelTitle}`
  }
  
  return `Create a professional, eye-catching YouTube thumbnail for this video:\n\n${context}\n\nThe thumbnail should be high-impact, with bold text and vibrant colors optimized for mobile viewing.`
}
