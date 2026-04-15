'use client'

import { useState, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PromptTemplateDialog, TemplateButton } from './PromptTemplates'

type AspectRatio = '16:9' | '9:16' | '1:1'
type Style = 'photorealistic' | 'cinematic' | 'anime' | 'illustration' | 'concept-art'

// Must match the API's `referenceImageSchema` in apps/api/src/trpc/routers/image.ts.
type AllowedMime = 'image/png' | 'image/jpeg' | 'image/webp'
const ALLOWED_MIMES: readonly AllowedMime[] = ['image/png', 'image/jpeg', 'image/webp']
function isAllowedMime(m: string): m is AllowedMime {
  return (ALLOWED_MIMES as readonly string[]).includes(m)
}

interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
  enhancedPrompt?: string
}

interface ThumbnailGeneratorProps {
  onImageGenerated?: (imageDataUrl: string, prompt: string) => void
  className?: string
}

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: string; note?: string }[] = [
  { value: '16:9', label: '16:9', icon: '🖥️', note: 'YouTube standard' },
  { value: '9:16', label: '9:16', icon: '📱', note: 'Shorts' },
  { value: '1:1', label: '1:1', icon: '⬜', note: 'Square' },
]

const STYLES: { value: Style; label: string; description: string }[] = [
  { value: 'photorealistic', label: 'Photo', description: 'Realistic photography' },
  { value: 'cinematic', label: 'Cinematic', description: 'Movie-like, dramatic' },
  { value: 'anime', label: 'Anime', description: 'Japanese animation style' },
  { value: 'illustration', label: 'Illustration', description: 'Digital art' },
  { value: 'concept-art', label: 'Concept', description: 'Concept art style' },
]

export function ThumbnailGenerator({ onImageGenerated, className }: ThumbnailGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [style, setStyle] = useState<Style>('photorealistic')
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null)
  const [mode, setMode] = useState<'prompt' | 'intent' | 'reference' | 'video'>('prompt')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTemplate, setVideoTemplate] = useState<'technical-guide' | 'do-this-not-that' | 'bold-headline' | 'none'>('none')
  const [videoCustomPrompt, setVideoCustomPrompt] = useState('')
  const [uploadedImages, setUploadedImages] = useState<
    { dataUrl: string; file: File; mimeType: AllowedMime }[]
  >([])
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const MAX_REFERENCE_IMAGES = 4
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generateMutation = trpc.image.generate.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.image) {
        setGeneratedImage(data.image)
        const dataUrl = `data:${data.image.mimeType};base64,${data.image.base64}`
        onImageGenerated?.(dataUrl, data.image.prompt)
      }
    },
  })

  const quickGenerateMutation = trpc.image.quickGenerate.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.image) {
        setGeneratedImage(data.image)
        setPrompt(data.suggestedPrompt || '')
        const dataUrl = `data:${data.image.mimeType};base64,${data.image.base64}`
        onImageGenerated?.(dataUrl, data.image.prompt)
      }
    },
  })

  const youtubeGenerateMutation = trpc.image.generateFromYouTube.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.image) {
        setGeneratedImage(data.image)
        const dataUrl = `data:${data.image.mimeType};base64,${data.image.base64}`
        onImageGenerated?.(dataUrl, data.image.prompt)
      }
    },
  })

  const tiktokGenerateMutation = trpc.image.generateFromTikTok.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.image) {
        setGeneratedImage(data.image)
        const dataUrl = `data:${data.image.mimeType};base64,${data.image.base64}`
        onImageGenerated?.(dataUrl, data.image.prompt)
      }
    },
  })

  const suggestPromptMutation = trpc.image.suggestPrompt.useMutation({
    onSuccess: (data: any) => {
      if (data.success && data.suggestedPrompt) {
        setEnhancedPrompt(data.suggestedPrompt)
      }
      setIsEnhancing(false)
    },
    onError: () => setIsEnhancing(false),
  })

  const isLoading = generateMutation.isPending || quickGenerateMutation.isPending || youtubeGenerateMutation.isPending || tiktokGenerateMutation.isPending
  const error = generateMutation.error || quickGenerateMutation.error || youtubeGenerateMutation.error || tiktokGenerateMutation.error

  const handleEnhancePrompt = (customText?: string) => {
    const text = customText || prompt
    if (!text.trim()) return
    setIsEnhancing(true)
    const referenceImages =
      uploadedImages.length > 0
        ? uploadedImages.map((img) => ({
            base64: img.dataUrl.split(',')[1],
            mimeType: img.mimeType,
          }))
        : undefined
    suggestPromptMutation.mutate({ videoIntent: text, referenceImages, style, aspectRatio })
  }

  const handleApplyTemplate = (generatedPrompt: string) => {
    setPrompt(generatedPrompt)
    setEnhancedPrompt('')
  }

  const isTikTokUrl = (url: string) => {
    try {
      const parsed = new URL(url)
      return parsed.hostname.includes('tiktok.com') || parsed.hostname === 'vm.tiktok.com'
    } catch { return false }
  }

  const handleGenerate = () => {
    if (mode === 'video' && !videoUrl.trim()) return
    if (mode !== 'video' && !prompt.trim()) return

    if (mode === 'video') {
      const templateType = videoTemplate === 'none' ? 'none' as const : videoTemplate
      const customPrompt = videoTemplate === 'none' ? (enhancedPrompt || videoCustomPrompt).trim() || undefined : undefined
      if (isTikTokUrl(videoUrl)) {
        tiktokGenerateMutation.mutate({ tiktokUrl: videoUrl, aspectRatio, style, templateType, customPrompt })
      } else {
        youtubeGenerateMutation.mutate({ youtubeUrl: videoUrl, aspectRatio, style, templateType, customPrompt })
      }
      return
    }
    if (mode === 'intent') {
      quickGenerateMutation.mutate({ videoIntent: prompt, aspectRatio, style })
    } else if (mode === 'reference' && uploadedImages.length > 0) {
      const referenceImages = uploadedImages.map((img) => ({
        base64: img.dataUrl.split(',')[1],
        mimeType: img.mimeType,
      }))
      generateMutation.mutate({ prompt: enhancedPrompt || prompt, aspectRatio, style, referenceImages })
    } else {
      generateMutation.mutate({ prompt, aspectRatio, style })
    }
  }

  const handleDownload = () => {
    if (!generatedImage) return
    const link = document.createElement('a')
    link.href = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`
    link.download = `thumbnail-${Date.now()}.png`
    link.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    if (uploadedImages.length + files.length > MAX_REFERENCE_IMAGES) {
      alert(`You can upload up to ${MAX_REFERENCE_IMAGES} reference images`)
      return
    }

    files.forEach((file) => {
      if (!isAllowedMime(file.type)) {
        alert(`${file.name}: Unsupported format. Please use PNG, JPEG, or WebP.`)
        return
      }
      if (file.size > 10 * 1024 * 1024) { alert(`${file.name}: Must be less than 10MB`); return }
      const mimeType: AllowedMime = file.type
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        setUploadedImages((prev) =>
          [...prev, { dataUrl, file, mimeType }].slice(0, MAX_REFERENCE_IMAGES)
        )
      }
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">🎨</span>
        <div>
          <h3 className="font-semibold">Thumbnail Generator</h3>
          <p className="text-xs text-muted-foreground">AI-powered YouTube thumbnail creator</p>
        </div>
      </div>

      <input
        id="reference-file-upload"
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Mode Toggle */}
      <div className="grid grid-cols-4 gap-2">
        {(['prompt', 'reference', 'intent', 'video'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m)
              if (m === 'video') setStyle('illustration')
            }}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-all',
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            )}
          >
            {m === 'prompt' ? '✏️ Prompt' : m === 'reference' ? '🖼️ Reference' : m === 'intent' ? '🎬 Intent' : '🔗 Video Link'}
          </button>
        ))}
      </div>

      {/* Reference Mode */}
      {mode === 'reference' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="reference-file-upload" className="text-sm font-medium">1. Upload Reference Images</label>
              {uploadedImages.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {uploadedImages.length}/{MAX_REFERENCE_IMAGES}
                </span>
              )}
            </div>
            {uploadedImages.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 hover:border-primary/50 hover:bg-muted/50 transition-all"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span className="text-3xl">🖼️</span>
                  <span className="text-sm font-medium">Click to upload references (up to {MAX_REFERENCE_IMAGES})</span>
                  <span className="text-xs">PNG, JPG, WebP up to 10MB each</span>
                </div>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.dataUrl} alt={`Ref ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => setUploadedImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                  ))}
                  {uploadedImages.length < MAX_REFERENCE_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center hover:border-primary/50"
                    >
                      <span className="text-2xl text-muted-foreground">+</span>
                    </button>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setUploadedImages([])}>
                    Clear all
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="reference-prompt" className="text-sm font-medium">2. Describe what you want</label>
            <Textarea
              id="reference-prompt"
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setEnhancedPrompt('') }}
              placeholder="e.g., Transform into a dramatic YouTube thumbnail style..."
              className="min-h-20 resize-none"
              disabled={isLoading}
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => handleEnhancePrompt()} disabled={!prompt.trim() || isEnhancing || isLoading}>
                {isEnhancing ? '✨ Enhancing...' : '✨ Enhance Prompt'}
              </Button>
            </div>
          </div>

          {enhancedPrompt && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-green-500">3. Enhanced Prompt</span>
              <div className="p-3 bg-muted/50 border border-green-500/30 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{enhancedPrompt}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Video Link Mode (YouTube + TikTok) */}
      {mode === 'video' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">1. Template Style (optional)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setVideoTemplate('none')}
                disabled={isLoading}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  videoTemplate === 'none'
                    ? 'border-primary bg-primary/10'
                    : 'border-muted hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">✏️</span>
                  <span className="font-semibold text-sm">Custom</span>
                </div>
                <p className="text-xs text-muted-foreground">Write your own prompt</p>
              </button>
              <button
                type="button"
                onClick={() => setVideoTemplate('technical-guide')}
                disabled={isLoading}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  videoTemplate === 'technical-guide'
                    ? 'border-primary bg-primary/10'
                    : 'border-muted hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">✅</span>
                  <span className="font-semibold text-sm">Technical Guide</span>
                </div>
                <p className="text-xs text-muted-foreground">Single-panel success outcome style</p>
              </button>
              <button
                type="button"
                onClick={() => setVideoTemplate('do-this-not-that')}
                disabled={isLoading}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  videoTemplate === 'do-this-not-that'
                    ? 'border-primary bg-primary/10'
                    : 'border-muted hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">⚖️</span>
                  <span className="font-semibold text-sm">Do This; Not That</span>
                </div>
                <p className="text-xs text-muted-foreground">Split-screen comparison style</p>
              </button>
              <button
                type="button"
                onClick={() => setVideoTemplate('bold-headline')}
                disabled={isLoading}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  videoTemplate === 'bold-headline'
                    ? 'border-primary bg-primary/10'
                    : 'border-muted hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🔥</span>
                  <span className="font-semibold text-sm">Bold Headline</span>
                </div>
                <p className="text-xs text-muted-foreground">Headline + icon cluster style</p>
              </button>
            </div>
          </div>

          {videoTemplate === 'none' && (
            <div className="space-y-2">
              <label htmlFor="video-custom-prompt" className="text-sm font-medium">2. Describe the thumbnail</label>
              <Textarea
                id="video-custom-prompt"
                value={videoCustomPrompt}
                onChange={(e) => { setVideoCustomPrompt(e.target.value); setEnhancedPrompt('') }}
                placeholder="e.g., A dramatic face reaction with bold text, bright colors, high contrast..."
                className="min-h-20 resize-none"
                disabled={isLoading}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground flex-1">
                  Your prompt will be combined with the video's title for context
                </p>
                <Button variant="outline" size="sm" onClick={() => handleEnhancePrompt(videoCustomPrompt)} disabled={!videoCustomPrompt.trim() || isEnhancing || isLoading}>
                  {isEnhancing ? '✨ Enhancing...' : '✨ Enhance'}
                </Button>
              </div>
              {enhancedPrompt && (
                <div className="space-y-1 mt-2">
                  <span className="text-xs font-medium text-green-500">Enhanced Prompt</span>
                  <div className="p-2 bg-muted/50 border border-green-500/30 rounded-lg">
                    <p className="text-xs whitespace-pre-wrap">{enhancedPrompt}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="video-url" className="text-sm font-medium">{videoTemplate === 'none' ? '3' : '2'}. Video URL</label>
            <Input
              id="video-url"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste a YouTube or TikTok link..."
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {videoTemplate === 'none'
                ? "Supports YouTube and TikTok links — we'll use the video's title as context for your prompt"
                : `Supports YouTube and TikTok links — we'll analyze the video and create a ${videoTemplate === 'technical-guide' ? 'Technical Guide' : videoTemplate === 'bold-headline' ? 'Bold Headline + Icons' : 'Do This; Not That'} style thumbnail`}
            </p>
          </div>
        </div>
      )}

      {/* Prompt / Intent Mode */}
      {(mode === 'prompt' || mode === 'intent') && (
        <div className="space-y-2">
          <label htmlFor="prompt-textarea" className="text-sm font-medium">
            {mode === 'intent' ? 'Describe your video idea' : 'Describe the thumbnail'}
          </label>
          <Textarea
            id="prompt-textarea"
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setEnhancedPrompt('') }}
            placeholder={
              mode === 'intent'
                ? 'e.g., A tutorial video about cooking pasta for beginners...'
                : 'e.g., A dramatic face reaction with bold text, bright colors, high contrast...'
            }
            className="min-h-24 resize-none"
            disabled={isLoading}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              {mode === 'intent'
                ? "We'll create a thumbnail concept for your video"
                : 'Describe exactly what you want in the thumbnail'}
            </p>
            <div className="flex gap-2">
              {mode === 'prompt' && (
                <TemplateButton
                  onClick={() => setTemplateDialogOpen(true)}
                  disabled={isLoading}
                />
              )}
              <Button variant="outline" size="sm" onClick={() => handleEnhancePrompt()} disabled={!prompt.trim() || isEnhancing || isLoading}>
                {isEnhancing ? '✨ Enhancing...' : '✨ Enhance'}
              </Button>
            </div>
          </div>

          {enhancedPrompt && (
            <div className="space-y-1 mt-2">
              <span className="text-xs font-medium text-green-500">Enhanced Prompt</span>
              <div className="p-2 bg-muted/50 border border-green-500/30 rounded-lg">
                <p className="text-xs whitespace-pre-wrap">{enhancedPrompt}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aspect Ratio */}
      <div className="space-y-2" role="group" aria-label="Aspect Ratio">
        <span className="text-xs text-muted-foreground">Aspect Ratio</span>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar.value}
              type="button"
              onClick={() => setAspectRatio(ar.value)}
              disabled={isLoading}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                aspectRatio === ar.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              )}
              title={ar.note}
            >
              {ar.icon} {ar.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="space-y-2" role="group" aria-label="Style">
        <span className="text-xs text-muted-foreground">Style</span>
        <div className="grid grid-cols-3 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStyle(s.value)}
              disabled={isLoading}
              title={s.description}
              className={cn(
                'px-2 py-2 rounded-lg text-xs font-medium transition-all text-center',
                style === s.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isLoading || (mode === 'video' ? !videoUrl.trim() : !prompt.trim()) || (mode === 'reference' && uploadedImages.length === 0)}
        className="w-full"
      >
        {isLoading ? (
          <><span className="animate-spin mr-2">🎨</span>Generating...</>
        ) : (
          '🎨 Generate Thumbnail'
        )}
      </Button>

      {/* Error */}
      {error && (() => {
        const msg = error.message || ''
        const lower = msg.toLowerCase()
        const isNetworkError =
          lower.includes('failed to fetch') ||
          lower.includes('network') ||
          lower.includes('load failed') ||
          lower.includes('networkerror')
        const friendlyMessage = isNetworkError
          ? "Can't reach the image service. Check your internet connection, or try again in a moment."
          : msg
        return (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
            {friendlyMessage}
            {lower.includes('api key') && (
              <div className="mt-2 text-xs text-red-500/90">
                Add your Gemini API key in Settings (⚙️ icon) to enable image generation.
              </div>
            )}
          </div>
        )
      })()}

      {/* Generated Image */}
      {generatedImage && (
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Generated Thumbnail</span>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              ⬇️ Download
            </Button>
          </div>

          <div className="relative rounded-lg overflow-hidden border bg-muted/50">
            {generatedImage.base64 ? (
              <img
                src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`}
                alt="Generated thumbnail"
                className="w-full h-auto object-contain"
              />
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                The model returned no image data. Please try again with a different prompt.
              </div>
            )}
          </div>

          {generatedImage.enhancedPrompt && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Prompt used:</div>
              <div className="text-xs font-mono">{generatedImage.enhancedPrompt}</div>
            </div>
          )}
        </div>
      )}

      {!generatedImage && uploadedImages.length === 0 && (
        <div className="text-xs text-muted-foreground italic text-center pt-2">
          💡 Describe your thumbnail, upload reference images, or paste a video link to get started
        </div>
      )}

      <PromptTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  )
}
