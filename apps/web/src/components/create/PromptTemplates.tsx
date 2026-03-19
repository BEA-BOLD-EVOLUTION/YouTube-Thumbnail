'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type TemplateId = 'subject-context' | 'technical-guide' | 'do-this-not-that'

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
    generate: (values) => `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines. The composition is a single, centered panel focusing exclusively on the successful final outcome (the 'AFTER' state). Central to the image is ${values.solutionObject}, drawn in a bold cartoon style with thick outlines and flat vibrant colors. Floating around the main object are ${values.successIndicators}, all as cartoon-style icons with clean outlines. At the top, massive, bold 3D block text with black outlines reads '${values.mainHeadline}' in yellow. Highly vibrant saturated colors, clean bold outlines, flat color fills, optimized for mobile screens. No 'Before' steps, no arrows, just the final result. NO photorealism, NO photography — pure bold cartoon illustration.`,
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
    generate: (values) => `A bold, high-contrast YouTube thumbnail in a 2D cartoon illustration style with thick clean outlines and a vertical split-screen design. Centered over the split is large, bold 3D block text with black outlines that reads 'DO THIS; NOT THAT' in yellow and white. On the left side (the 'Not That' side), use a ${values.dullColor} background with a large red circle-with-X icon over ${values.badThing}, drawn in cartoon style with thick outlines. On the right side (the 'Do This' side), use a ${values.vibrantColor} background with a large green circle-with-checkmark icon next to ${values.goodThing}, drawn in cartoon style with thick outlines. Clean bold outlines on everything, flat color fills, all text must be large and highly visible with 3D block letter styling. NO photorealism, NO photography — pure bold cartoon illustration.`,
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
