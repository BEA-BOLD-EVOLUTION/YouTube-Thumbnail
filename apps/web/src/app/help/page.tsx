'use client'

import { useState } from 'react'
import Link from 'next/link'

type Section = 'overview' | 'modes' | 'templates' | 'settings' | 'tips'

const sections: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'modes', label: 'Generation Modes', icon: '🎛️' },
  { id: 'templates', label: 'Prompt Templates', icon: '📋' },
  { id: 'settings', label: 'Settings & API Key', icon: '⚙️' },
  { id: 'tips', label: 'Tips & Best Practices', icon: '💡' },
]

export default function HelpPage() {
  const [active, setActive] = useState<Section>('overview')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📖</span>
          <span className="font-semibold">Help & Walkthrough</span>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Generator
        </Link>
      </header>

      <div className="max-w-4xl mx-auto p-6 flex gap-8">
        {/* Sidebar nav */}
        <nav className="hidden md:block w-48 shrink-0 space-y-1 sticky top-6 self-start">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                active === s.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </nav>

        {/* Mobile tab bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background z-50 flex overflow-x-auto px-2 py-1 gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs transition-all ${
                active === s.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {s.icon}
              <span className="sr-only">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {active === 'overview' && <OverviewSection />}
          {active === 'modes' && <ModesSection />}
          {active === 'templates' && <TemplatesSection />}
          {active === 'settings' && <SettingsSection />}
          {active === 'tips' && <TipsSection />}
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section Components                                                 */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold mb-4">{children}</h2>
}

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold mb-1">{title}</h4>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function InfoBox({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 font-semibold">
        <span className="text-lg">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function OverviewSection() {
  return (
    <div className="space-y-6">
      <SectionTitle>Welcome to YouTube Thumbnail Generator</SectionTitle>

      <p className="text-muted-foreground leading-relaxed">
        This tool uses Google Gemini AI to create eye-catching thumbnails
        in seconds. You can generate thumbnails from text prompts, video ideas,
        reference images, or directly from a YouTube or TikTok URL.
      </p>

      <div className="border rounded-xl p-5 bg-muted/30 space-y-4">
        <h3 className="font-semibold text-lg">Quick Start</h3>
        <div className="space-y-5">
          <StepCard step={1} title="Sign In">
            Log in with your authorized email and password on the home page.
          </StepCard>
          <StepCard step={2} title="Choose a Mode">
            Pick one of the four generation modes at the top of the generator:
            <strong> Prompt</strong>, <strong>Reference</strong>,{' '}
            <strong>Intent</strong>, or <strong>Video Link</strong>.
          </StepCard>
          <StepCard step={3} title="Provide Input">
            Enter a description, upload reference images, or paste a YouTube/TikTok
            URL depending on the mode you chose.
          </StepCard>
          <StepCard step={4} title="Pick Aspect Ratio & Style">
            Select <strong>16:9</strong> (standard), <strong>9:16</strong>{' '}
            (Shorts), or <strong>1:1</strong> (square), and choose a visual
            style like Illustration, Cinematic, or Photo.
          </StepCard>
          <StepCard step={5} title="Generate & Download">
            Click <strong>Generate Thumbnail</strong>, wait a few seconds, then
            download or right-click the image to save it.
          </StepCard>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ModesSection() {
  return (
    <div className="space-y-6">
      <SectionTitle>Generation Modes</SectionTitle>

      <p className="text-muted-foreground leading-relaxed">
        The generator offers four different modes, each suited to a different
        starting point. Switch between them using the tab bar at the top of the
        generator.
      </p>

      <div className="space-y-4">
        <InfoBox icon="✏️" title="Prompt Mode">
          <p>
            Write an exact description of the thumbnail you want. This gives you
            the most control over the final result.
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Type a detailed description in the text area.</li>
            <li>
              Use the <strong>📋 Templates</strong> button to start from a
              pre-built template (Subject + Context, Technical Guide, or Do
              This; Not That).
            </li>
            <li>
              Click <strong>✨ Enhance</strong> to have AI expand and improve
              your prompt before generating.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🖼️" title="Reference Mode">
          <p>
            Upload up to 4 reference images and describe how you want the AI to
            transform or be inspired by them.
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              Click the upload area or the <strong>+</strong> button to add
              images (PNG, JPG, or WebP, up to 10 MB each).
            </li>
            <li>
              Write a prompt describing the desired output &mdash; e.g.,
              &quot;Transform into a dramatic YouTube thumbnail with bold
              text.&quot;
            </li>
            <li>
              Use <strong>✨ Enhance Prompt</strong> to let AI refine your
              description using the references as context.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🎬" title="Intent Mode">
          <p>
            Describe your video idea in plain language and let the AI design a
            thumbnail concept for you.
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              Write what your video is about &mdash; e.g., &quot;A tutorial
              about cooking pasta for beginners.&quot;
            </li>
            <li>
              The AI generates both a prompt and the image in one step, so you
              don&apos;t need to think about visual details.
            </li>
            <li>
              Great for brainstorming when you&apos;re not sure what the
              thumbnail should look like.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🔗" title="Video Link Mode">
          <p>
            Paste a YouTube or TikTok URL and the AI will analyze the video
            title to generate a thumbnail automatically.
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              <strong>Step 1:</strong> Choose a template style &mdash;{' '}
              <em>Technical Guide</em> (single-panel success outcome) or{' '}
              <em>Do This; Not That</em> (split-screen comparison).
            </li>
            <li>
              <strong>Step 2:</strong> Paste a YouTube or TikTok URL (e.g.,{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                https://youtube.com/watch?v=...
              </code>{' '}
              or{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                https://tiktok.com/@user/video/...
              </code>
              ).
            </li>
            <li>
              The AI extracts the video title, builds a tailored prompt using
              your chosen template, and generates a bold cartoon-style
              thumbnail.
            </li>
            <li>
              The style is automatically set to <strong>Illustration</strong>{' '}
              for the best results with video link templates.
            </li>
            <li>
              TikTok links default to <strong>9:16</strong> (vertical) aspect
              ratio; YouTube links default to <strong>16:9</strong>.
            </li>
          </ul>
        </InfoBox>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TemplatesSection() {
  return (
    <div className="space-y-6">
      <SectionTitle>Prompt Templates</SectionTitle>

      <p className="text-muted-foreground leading-relaxed">
        Templates give you a head start by providing a structured prompt format.
        Access them in <strong>Prompt Mode</strong> by clicking the{' '}
        <strong>📋 Templates</strong> button, or they are used automatically in{' '}
        <strong>Video Link Mode</strong>.
      </p>

      <div className="space-y-4">
        <InfoBox icon="📌" title="Subject + Context">
          <p>
            Best for informational or educational videos. Centers on a main
            subject with supporting visual context.
          </p>
          <div className="mt-3 space-y-2">
            <p className="font-medium text-foreground">Fields to fill in:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Subject</strong> &mdash; The main topic (e.g.,
                &quot;TikTok LIVE Compliance&quot;)
              </li>
              <li>
                <strong>Context</strong> &mdash; Supporting details (e.g.,
                &quot;Low-Quality and Interactive Streaming Standards&quot;)
              </li>
              <li>
                <strong>Visual Style</strong> (optional) &mdash; Custom
                background/icon preferences
              </li>
            </ul>
            <p className="mt-2 italic">
              Produces a thumbnail with bold 3D block text and cartoon supporting
              icons on a vibrant background.
            </p>
          </div>
        </InfoBox>

        <InfoBox icon="✅" title="Technical Guide">
          <p>
            A single-panel &quot;success outcome&quot; thumbnail focused on the
            end result. Great for how-to and tutorial content.
          </p>
          <div className="mt-3 space-y-2">
            <p className="font-medium text-foreground">Fields to fill in:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Solution Object</strong> &mdash; The main object shown
                (e.g., &quot;A sleek silver studio microphone with a
                &apos;PERFECT AUDIO&apos; tag&quot;)
              </li>
              <li>
                <strong>Success Indicators</strong> &mdash; Icons floating
                around it (e.g., &quot;Glowing sound wave patterns and a
                thumbs-up icon&quot;)
              </li>
              <li>
                <strong>Main Headline</strong> &mdash; The bold text (e.g.,
                &quot;HOW TO GET PERFECT AUDIO&quot;)
              </li>
            </ul>
            <p className="mt-2 italic">
              Creates a richly detailed cartoon illustration of the solution
              object surrounded by success indicators, with a massive headline.
            </p>
          </div>
        </InfoBox>

        <InfoBox icon="⚖️" title="Do This; Not That">
          <p>
            A split-screen comparison showing wrong vs. right approaches.
            Perfect for &quot;mistakes to
            avoid&quot; or comparison content.
          </p>
          <div className="mt-3 space-y-2">
            <p className="font-medium text-foreground">Fields to fill in:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Wrong Way (Left)</strong> &mdash; What the bad side
                shows (e.g., &quot;A tangled mess of cheap white headphones with
                crackly sound waves&quot;)
              </li>
              <li>
                <strong>Right Way (Right)</strong> &mdash; What the good side
                shows (e.g., &quot;A sleek professional studio microphone with
                clean sound waves&quot;)
              </li>
              <li>
                <strong>Dull Color (Left)</strong> &mdash; Background for the
                wrong side (e.g., &quot;Muted Blue&quot;)
              </li>
              <li>
                <strong>Vibrant Color (Right)</strong> &mdash; Background for
                the right side (e.g., &quot;Emerald Green&quot;)
              </li>
            </ul>
            <p className="mt-2 italic">
              Generates a vertical split-screen with the video title at the top
              in massive 3D text, detailed cartoon illustrations on each side,
              and &quot;DO THIS; NOT THAT&quot; at the bottom.
            </p>
          </div>
        </InfoBox>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SettingsSection() {
  return (
    <div className="space-y-6">
      <SectionTitle>Settings & API Key</SectionTitle>

      <p className="text-muted-foreground leading-relaxed">
        Click the <strong>⚙️</strong> gear icon in the top-right header to
        open the Settings dialog. Here you can manage your Gemini API key and
        model preferences.
      </p>

      <div className="space-y-4">
        <InfoBox icon="🔑" title="Bring Your Own Key (BYOK)">
          <ul className="list-disc list-inside space-y-2">
            <li>
              By default the app uses a shared platform API key. For faster
              generation or higher limits, add your own Google Gemini API key.
            </li>
            <li>
              Get a key from{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-foreground"
              >
                Google AI Studio
              </a>
              .
            </li>
            <li>
              Paste the key in the API Key field and click <strong>Save</strong>.
            </li>
            <li>
              Toggle <strong>&quot;Use my own key&quot;</strong> on/off to switch
              between your key and the platform key.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🤖" title="Model Selection">
          <p>Choose which Gemini model to use for image generation:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              <strong>Gemini Flash</strong> &mdash; Fastest generation, good
              quality.
            </li>
            <li>
              <strong>Gemini Pro</strong> &mdash; Higher quality, takes a bit
              longer.
            </li>
          </ul>
          <p className="mt-2">
            The model setting is saved to your account and persists between
            sessions.
          </p>
        </InfoBox>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TipsSection() {
  return (
    <div className="space-y-6">
      <SectionTitle>Tips & Best Practices</SectionTitle>

      <div className="space-y-4">
        <InfoBox icon="🎯" title="Writing Better Prompts">
          <ul className="list-disc list-inside space-y-2">
            <li>
              Be specific about colors, layout, and text &mdash; the more detail
              you provide, the closer the result matches your vision.
            </li>
            <li>
              Mention the style you want explicitly (e.g., &quot;bold 2D cartoon
              illustration with thick outlines&quot;).
            </li>
            <li>
              Describe text placement: &quot;large bold text at the top
              reading...&quot;
            </li>
            <li>
              Use the <strong>✨ Enhance</strong> button to let AI expand a
              short prompt into a detailed description.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="📐" title="Aspect Ratio Guide">
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>16:9</strong> &mdash; Standard YouTube thumbnail (1280 &times;
              720). Use this for regular videos.
            </li>
            <li>
              <strong>9:16</strong> &mdash; Vertical format for YouTube Shorts,
              TikTok, and mobile-first content.
            </li>
            <li>
              <strong>1:1</strong> &mdash; Square format, useful for social
              media cross-posting.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🎨" title="Style Guide">
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Illustration</strong> &mdash; Bold cartoon style with
              thick outlines. Best for YouTube templates and vibrant thumbnails.
            </li>
            <li>
              <strong>Photo</strong> &mdash; Photorealistic look. Good for
              product shots or documentary-style content.
            </li>
            <li>
              <strong>Cinematic</strong> &mdash; Dramatic, movie-poster feel
              with moody lighting.
            </li>
            <li>
              <strong>Anime</strong> &mdash; Japanese animation style. Great for
              gaming or entertainment channels.
            </li>
            <li>
              <strong>Concept</strong> &mdash; Concept art aesthetic. Works well
              for tech, design, or futuristic content.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="⚡" title="Getting the Best Results">
          <ul className="list-disc list-inside space-y-2">
            <li>
              If the first result isn&apos;t perfect, click{' '}
              <strong>Generate</strong> again &mdash; each generation is
              unique.
            </li>
            <li>
              For Video Link Mode, try both template styles (Technical Guide and
              Do This; Not That) to see which fits your video better.
            </li>
            <li>
              In Reference Mode, upload thumbnails you like as inspiration &mdash;
              the AI will match their energy and composition.
            </li>
            <li>
              Keep text in prompts short and punchy &mdash; thumbnails work best
              with 3&ndash;5 words of headline text.
            </li>
            <li>
              High contrast and saturated colors perform best on YouTube &mdash;
              the Illustration style is optimized for this.
            </li>
          </ul>
        </InfoBox>

        <InfoBox icon="🔄" title="Iterating on Results">
          <ul className="list-disc list-inside space-y-2">
            <li>
              After generating, you can tweak the prompt and regenerate without
              starting from scratch.
            </li>
            <li>
              Use the <strong>✨ Enhance</strong> button to refine a prompt
              that&apos;s close but not quite right.
            </li>
            <li>
              Download multiple versions and compare them side by side to pick
              the best one.
            </li>
          </ul>
        </InfoBox>
      </div>
    </div>
  )
}
