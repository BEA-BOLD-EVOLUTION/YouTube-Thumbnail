/**
 * TikTok metadata extraction service
 * Extracts video title and author for AI-powered thumbnail generation
 */

interface TikTokMetadata {
  videoId: string
  title: string
  authorName: string
  thumbnailUrl?: string
}

/**
 * Extract video ID from various TikTok URL formats
 * Supports:
 *   - https://www.tiktok.com/@user/video/1234567890
 *   - https://vm.tiktok.com/ZMxxxxxx/
 *   - https://www.tiktok.com/t/ZMxxxxxx/
 */
export function extractTikTokVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url)

    // tiktok.com/@user/video/ID
    const videoMatch = urlObj.pathname.match(/\/video\/(\d+)/)
    if (videoMatch) return videoMatch[1]

    // vm.tiktok.com or tiktok.com/t/ short links — we can't resolve the
    // numeric ID without following the redirect, but we still recognise
    // the URL as valid. Return the short code so we can pass the full URL
    // to the oEmbed API (which follows redirects itself).
    if (urlObj.hostname === 'vm.tiktok.com') {
      const code = urlObj.pathname.replace(/\//g, '')
      if (code) return code
    }
    if (urlObj.pathname.startsWith('/t/')) {
      const code = urlObj.pathname.split('/t/')[1]?.replace(/\//g, '')
      if (code) return code
    }

    return null
  } catch {
    return null
  }
}

/**
 * Detect whether a URL is a TikTok link
 */
export function isTikTokUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return (
      urlObj.hostname.includes('tiktok.com') ||
      urlObj.hostname === 'vm.tiktok.com'
    )
  } catch {
    return false
  }
}

/**
 * Fetch TikTok video metadata using oEmbed API (no API key required)
 */
export async function getTikTokMetadata(url: string): Promise<TikTokMetadata | null> {
  const videoId = extractTikTokVideoId(url)
  if (!videoId) {
    throw new Error('Invalid TikTok URL')
  }

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    const response = await fetch(oembedUrl)

    if (!response.ok) {
      throw new Error('Failed to fetch TikTok metadata')
    }

    const data = (await response.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }

    return {
      videoId,
      title: data.title || 'Untitled TikTok',
      authorName: data.author_name || 'Unknown Creator',
      thumbnailUrl: data.thumbnail_url,
    }
  } catch (error) {
    console.error('Failed to fetch TikTok metadata:', error)
    return {
      videoId,
      title: 'TikTok Video',
      authorName: '',
      thumbnailUrl: undefined,
    }
  }
}
