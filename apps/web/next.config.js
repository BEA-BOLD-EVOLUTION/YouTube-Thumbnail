/** @type {import('next').NextConfig} */

// Strip trailing slash so we can safely concatenate paths.
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Same-origin proxy to the API. Browser hits /api-proxy/* on the Vercel
  // domain, Vercel's edge forwards it to the Railway backend server-side.
  // This eliminates CORS entirely (no preflight, no Origin checks).
  async rewrites() {
    if (!apiOrigin) return []
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${apiOrigin}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
