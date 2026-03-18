import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YouTube Thumbnail Generator',
  description: 'AI-powered YouTube thumbnail generator using Google Gemini',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  )
}
