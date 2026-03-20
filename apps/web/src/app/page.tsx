'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ThumbnailGenerator } from '@/components/create/ThumbnailGenerator'
import { ApiKeySettings } from '@/components/settings/ApiKeySettings'
import { useAuth } from '@/hooks/useAuth'

export default function Home() {
  const { user, loading, isAuthenticated, signInWithEmail, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const result = await signInWithEmail(email, password)
      
      if (result?.error) {
        console.error('Login error:', result.error)
        let errorMessage = result.error.message
        
        // Provide helpful error messages
        if (errorMessage.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials.'
        } else if (errorMessage.includes('Email not confirmed')) {
          errorMessage = 'Please confirm your email address. Check your inbox or contact admin to confirm your account.'
        }
        
        setAuthError(errorMessage)
      }
    } catch (error: any) {
      console.error('Auth error:', error)
      setAuthError(error.message || 'An unexpected error occurred')
    } finally {
      setAuthLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-3">🎨</div>
            <h1 className="text-2xl font-bold">YouTube Thumbnail Generator</h1>
            <p className="text-muted-foreground mt-2">
              AI-powered thumbnail creator using Google Gemini
            </p>
          </div>

          <div className="border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-center">Sign In</h2>

            <form onSubmit={handleAuth} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="sr-only">Email</label>
                <input
                  id="login-email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={authLoading}
                  className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password" className="sr-only">Password</label>
                <input
                  id="login-password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={authLoading}
                  className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  required
                />
              </div>
              {authError && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-start gap-2">
                  <span className="text-base">⚠️</span>
                  <span>{authError}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {authLoading && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {authLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Access restricted to authorized users only
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎨</span>
          <span className="font-semibold">YouTube Thumbnail Generator</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Link
            href="/help"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Help & Walkthrough"
          >
            ❓
          </Link>
          <ApiKeySettings />
          <button
            onClick={() => signOut()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Generate Thumbnail</h1>
            <p className="text-muted-foreground mt-1">
              Create eye-catching YouTube thumbnails with AI
            </p>
          </div>

          <div className="border rounded-xl p-6">
            <ThumbnailGenerator
              onImageGenerated={(dataUrl, prompt) => setGeneratedImage(dataUrl)}
            />
          </div>

          {generatedImage && (
            <div className="border rounded-xl p-4 space-y-3">
              <h2 className="font-medium">Your Thumbnail</h2>
              <img
                src={generatedImage}
                alt="Generated thumbnail"
                className="w-full rounded-lg border"
              />
              <p className="text-xs text-muted-foreground">
                Right-click the image to save, or use the Download button above.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
