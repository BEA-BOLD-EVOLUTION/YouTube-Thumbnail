'use client'

import { useState } from 'react'
import { ThumbnailGenerator } from '@/components/create/ThumbnailGenerator'
import { ApiKeySettings } from '@/components/settings/ApiKeySettings'
import { useAuth } from '@/hooks/useAuth'

export default function Home() {
  const { user, loading, isAuthenticated, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const result = authMode === 'signin'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password)
      if (result?.error) setAuthError(result.error.message)
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
            <div className="flex gap-2">
              <button
                onClick={() => setAuthMode('signin')}
                className={`flex-1 py-2 text-sm rounded-md transition-colors ${authMode === 'signin' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 text-sm rounded-md transition-colors ${authMode === 'signup' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
              {authError && <p className="text-sm text-red-500">{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {authLoading ? 'Loading...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <button
              onClick={() => signInWithGoogle()}
              className="w-full py-2 border rounded-md text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Sign in to generate AI-powered YouTube thumbnails
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
