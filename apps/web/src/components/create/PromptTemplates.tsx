'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type TemplateId = 'subject-context' | 'technical-guide' | 'do-this-not-that' | 'bold-headline'

interface TemplateField {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'textarea'
}

interface Template {
  id: TemplateId
  name: string
  icon: string
  description: string
  fields: TemplateField[]
  generate: (values: Record<string, string>) => string
}

export const PROMPT_TEMPLATES: Template[] = [
  {
    id: 'subject-context',
    name: 'Subject + Context',
    icon: '📌',
    description: 'Professional informational thumbnail with subject line and supporting context',
    fields: [
      { key: 'subject', label: 'Subject', placeholder: 'e.g., TikTok LIVE Compliance', type: 'text' },
      { key: 'context', label: 'Context', placeholder: 'e.g., Low-Quality and Interactive Streaming Standards', type: 'textarea' },
      { key: 'visualStyle', label: 'Visual Style (optional)', placeholder: 'e.g., modern gradient background, tech-themed icons, professional layout', type: 'textarea' },
    ],
    generate: (values) => {
      const visualStyle = values.visualStyle || 'modern gradient background with vibrant saturated colors, cartoon-style icons and visual elements with thick outlines'
      return `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines and ${visualStyle}. The main subject '${values.subject}' is displayed in large, bold 3D block text with black outlines and drop shadows at the top or center of the composition. Below or around it, supporting context about '${values.context}' is represented through cartoon-style icons, symbols, or visual metaphors with thick outlines and flat color fills that clearly communicate the topic. The design uses high contrast, vibrant saturated colors optimized for mobile viewing, with a balanced composition that draws the eye to the subject first, then the supporting context. All text is large, bold, and highly legible with 3D block letter styling. NO photorealism, NO photography — pure bold cartoon illustration.`
    },
  },
  {
    id: 'technical-guide',
    name: 'Technical Guide',
    icon: '✅',
    description: 'Single-panel "AFTER" style showing the successful outcome',
    fields: [
      { key: 'solutionObject', label: 'Solution Object', placeholder: 'e.g., A sleek silver studio microphone with a "PERFECT AUDIO" tag', type: 'textarea' },
      { key: 'successIndicators', label: 'Success Indicators', placeholder: 'e.g., Glowing, smooth sound wave patterns and a thumbs-up icon', type: 'textarea' },
      { key: 'mainHeadline', label: 'Main Headline', placeholder: 'e.g., HOW TO GET PERFECT AUDIO', type: 'text' },
    ],
    generate: (values) => `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines and cel-shading. Single-panel composition focused on the successful outcome. Central to the image is ${values.solutionObject}, drawn as a detailed cartoon object with depth, cel-shading, and a glossy sheen. Around the central object, include 2-3 supporting cartoon props that come directly from the topic's real-world iconography (objects a viewer of this specific topic would recognize) — described here as ${values.successIndicators}. At the top, massive 3D extruded block text with a black outline and one colored drop shadow reads '${values.mainHeadline}' in yellow. Use a clean gradient background in 1-2 colors that match the topic's mood; do NOT add a radial light burst behind the subject. Keep negative space clean — do NOT fill empty areas with generic sparkles, confetti, speed lines, or random emoji clutter. Only add a small accent (like a single checkmark or coin sparkle) if it directly reinforces the topic. The thumbnail should be instantly recognizable as being about this specific subject — a viewer should be able to guess the topic from the imagery alone. NO photorealism, NO photography — pure bold cartoon illustration.`,
  },
  {
    id: 'do-this-not-that',
    name: 'Do This; Not That',
    icon: '⚖️',
    description: 'Split-screen comparison with good vs bad examples',
    fields: [
      { key: 'badThing', label: 'Wrong Way (Left)', placeholder: 'e.g., A tangled mess of cheap white headphones with crackly sound waves', type: 'textarea' },
      { key: 'goodThing', label: 'Right Way (Right)', placeholder: 'e.g., A sleek, professional silver studio microphone with clean, smooth sound waves', type: 'textarea' },
      { key: 'dullColor', label: 'Dull Color (Left)', placeholder: 'e.g., Muted Blue', type: 'text' },
      { key: 'vibrantColor', label: 'Vibrant Color (Right)', placeholder: 'e.g., Emerald Green', type: 'text' },
    ],
    generate: (values) => `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines and a vertical split-screen design, with the same rich detail level as a Technical Guide thumbnail. At the TOP of the image, display the main headline in MASSIVE bold 3D block text with black outlines and drop shadows — this is the largest, most prominent text. At the BOTTOM, smaller but still bold text reads 'DO THIS; NOT THAT' in yellow and white as a category label. On the left side (the 'Not That' side), use a ${values.dullColor} background with DETAILED, richly drawn cartoon illustrations of ${values.badThing} — fully rendered cartoon objects with depth, thick outlines, and visual personality, plus a large red circle-with-X icon. On the right side (the 'Do This' side), use a ${values.vibrantColor} background with DETAILED, richly drawn cartoon illustrations of ${values.goodThing} — fully rendered cartoon objects looking polished and professional, plus a large green circle-with-checkmark icon. Both sides should have richly illustrated cartoon graphics with small decorative details (sparkles, arrows, emojis). The video title headline at top must be significantly larger than the 'DO THIS; NOT THAT' text at bottom. NO photorealism, NO photography — pure bold cartoon illustration.`,
  },
  {
    id: 'bold-headline',
    name: 'Bold Headline + Icons',
    icon: '🔥',
    description: 'Side-by-side layout with massive headline text on one side and a cluster of themed cartoon icons on the other',
    fields: [
      { key: 'topic', label: 'Topic', placeholder: 'e.g., Master Storytelling for TikTok LIVE', type: 'text' },
      { key: 'visualStyle', label: 'Visual Style (optional)', placeholder: 'e.g., gaming theme with controllers, bookish cozy vibe, tech-forward with devices', type: 'textarea' },
    ],
    generate: (values) => {
      const visualHint = values.visualStyle ? ` The icon cluster should reflect this visual direction: ${values.visualStyle}.` : ''
      return `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines. The layout is a clean SIDE-BY-SIDE split composition about '${values.topic}'. On ONE side, display a short punchy headline (2-4 words derived from the topic) in MASSIVE, stacked, bold 3D extruded block text with black outlines, colored drop shadows, and mixed yellow/white coloring — the text should dominate that entire half and be highly legible. On the OTHER side, create a well-arranged cluster of detailed cartoon icons and illustrations that visually represent the topic — richly drawn with thick outlines, cel-shading, glossy highlights, and depth. Add small floating accents (sparkles, arrows, hearts, stars) around the icon cluster sparingly to fill gaps. If the topic involves social media or streaming, include relevant platform branding elements (badges, logos, chat bubbles) naturally within the icon cluster.${visualHint} Use dramatically contrasting background colors for each half — one bold/saturated, one lighter/warmer. Keep backgrounds clean — solid or simple gradients, no radial bursts or light rays. The overall composition should feel like a polished magazine cover or bold social media graphic — clean, confident, and eye-catching. NO photorealism, NO photography — pure bold cartoon illustration.`
    },
  },
]

interface PromptTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyTemplate: (prompt: string) => void
}

export function PromptTemplateDialog({ open, onOpenChange, onApplyTemplate }: PromptTemplateDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template)
    setValues({})
  }

  const handleApply = () => {
    if (!selectedTemplate) return
    
    const allFilled = selectedTemplate.fields.every((field) => values[field.key]?.trim())
    if (!allFilled) {
      alert('Please fill in all fields')
      return
    }

    const generatedPrompt = selectedTemplate.generate(values)
    onApplyTemplate(generatedPrompt)
    onOpenChange(false)
    setSelectedTemplate(null)
    setValues({})
  }

  const handleBack = () => {
    setSelectedTemplate(null)
    setValues({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedTemplate ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleBack}>← Back</Button>
                <span>{selectedTemplate.icon} {selectedTemplate.name}</span>
              </div>
            ) : (
              '📋 Prompt Templates'
            )}
          </DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a template to maintain consistent branding across your thumbnails
            </p>
            <div className="grid gap-3">
              {PROMPT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="text-left p-4 border rounded-lg hover:border-primary hover:bg-muted/50 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{template.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                    </div>
                    <span className="text-muted-foreground">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            
            <div className="space-y-4">
              {selectedTemplate.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.key}
                      placeholder={field.placeholder}
                      value={values[field.key] || ''}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                      className="min-h-20"
                    />
                  ) : (
                    <Input
                      id={field.key}
                      placeholder={field.placeholder}
                      value={values[field.key] || ''}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleApply} className="flex-1">
                Apply Template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TemplateButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function TemplateButton({ onClick, disabled }: TemplateButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="gap-2"
    >
      📋 Use Template
    </Button>
  )
}
