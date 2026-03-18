'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  Key,
  Sparkles,
  Zap,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react'

export function ApiKeySettings() {
  const { isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { data: settings, refetch: refetchSettings } = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  })

  const setGeminiApiKey = trpc.settings.setGeminiApiKey.useMutation({
    onSuccess: () => { refetchSettings(); setApiKey(''); setIsSaving(false) },
    onError: () => setIsSaving(false),
  })
  const removeGeminiApiKey = trpc.settings.removeGeminiApiKey.useMutation({
    onSuccess: () => refetchSettings(),
  })
  const toggleKeySource = trpc.settings.toggleGeminiKeySource.useMutation({
    onSuccess: () => refetchSettings(),
  })
  const setGeminiModel = trpc.settings.setGeminiModel.useMutation({
    onSuccess: () => refetchSettings(),
  })

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) return
    setIsSaving(true)
    setGeminiApiKey.mutate({ apiKey: apiKey.trim() })
  }

  const handleRemoveApiKey = () => {
    if (confirm('Remove your API key? You will use the platform key for image generation.')) {
      removeGeminiApiKey.mutate()
    }
  }

  const hasByok = settings?.gemini.hasApiKey && settings?.gemini.useOwnKey

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="API Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Configure your Gemini API key for image generation. Flash model works with the platform
            key; Pro model requires your own key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Gemini API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Gemini API Key</Label>
                <p className="text-sm text-muted-foreground">
                  Use your own Google AI key for Pro model access
                </p>
              </div>
              {settings?.gemini.hasApiKey && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={settings.gemini.useOwnKey}
                    onCheckedChange={(checked) => toggleKeySource.mutate({ useOwnKey: checked })}
                  />
                  <Label className="text-sm">
                    {settings.gemini.useOwnKey ? 'Using your key' : 'Using platform'}
                  </Label>
                </div>
              )}
            </div>

            {settings?.gemini.hasApiKey ? (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  API Key: {settings.gemini.maskedKey}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-500 hover:text-red-600"
                  onClick={handleRemoveApiKey}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-yellow-700 dark:text-yellow-300">
                    {settings?.platformGeminiConfigured
                      ? 'Platform key active. Add your own key to unlock Pro model.'
                      : 'No API key configured. Image generation unavailable.'}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey">Enter your Gemini API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button onClick={handleSaveApiKey} disabled={!apiKey.trim() || isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  {setGeminiApiKey.error && (
                    <p className="text-sm text-red-500">{setGeminiApiKey.error.message}</p>
                  )}
                </div>

                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                >
                  Get your free API key from Google AI Studio
                  <ExternalLink className="h-3 w-3" />
                </a>

                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <p className="text-xs font-medium">How to get your key:</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Go to aistudio.google.com/apikey</li>
                    <li>Sign in with your Google account</li>
                    <li>Click "Create API Key"</li>
                    <li>Copy the key and paste it above</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Default Model</Label>

            <Select
              value={settings?.gemini.model ?? 'gemini-2.5-flash-image'}
              onValueChange={(value) => {
                if ((value === 'gemini-3-pro-image-preview' || value === 'gemini-3.1-flash-image-preview') && !hasByok) return
                setGeminiModel.mutate({
                  model: value as 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview',
                })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-2.5-flash-image">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Flash</span>
                    <span className="text-muted-foreground">Fast & free</span>
                  </div>
                </SelectItem>
                <SelectItem value="gemini-3.1-flash-image-preview">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Flash 3.1</span>
                    <span className="text-muted-foreground">Thinking + 512p</span>
                    {!hasByok && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">
                        <Lock className="h-2.5 w-2.5" />
                        BYOK
                      </span>
                    )}
                  </div>
                </SelectItem>
                <SelectItem value="gemini-3-pro-image-preview">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">Pro</span>
                    <span className="text-muted-foreground">Thinking + 4K</span>
                    {!hasByok && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-medium">
                        <Lock className="h-2.5 w-2.5" />
                        BYOK
                      </span>
                    )}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium text-sm">Flash</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Fast generation</li>
                  <li>• Mix up to 3 images</li>
                  <li>• Platform key supported</li>
                </ul>
              </div>
              <div className={`p-3 rounded-lg space-y-1 ${hasByok ? 'bg-muted/50' : 'bg-muted/30 opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="font-medium text-sm">Pro</span>
                  {!hasByok && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Thinking capabilities</li>
                  <li>• Mix up to 14 images</li>
                  <li>• 2K / 4K output</li>
                </ul>
              </div>
            </div>

            {!hasByok && (
              <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                <h4 className="font-medium text-sm mb-2">Why bring your own key?</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Unlock Pro model with thinking + 4K output</li>
                  <li>Mix up to 14 reference images</li>
                  <li>Use your own Google quota</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
