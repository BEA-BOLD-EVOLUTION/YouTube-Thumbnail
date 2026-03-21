# YouTube Thumbnail Generator – User Walkthrough

A step-by-step guide to creating AI-powered YouTube thumbnails.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Generation Modes](#generation-modes)
   - [Prompt Mode](#prompt-mode)
   - [Reference Mode](#reference-mode)
   - [Intent Mode](#intent-mode)
   - [Video Link Mode](#video-link-mode)
3. [Prompt Templates](#prompt-templates)
   - [Subject + Context](#subject--context)
   - [Technical Guide](#technical-guide)
   - [Do This; Not That](#do-this-not-that)
4. [Aspect Ratio & Style](#aspect-ratio--style)
5. [Settings & API Key](#settings--api-key)
6. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### 1. Sign In
Open the app and sign in with your authorized email and password.

### 2. Explore the Generator
After signing in you'll see the main **Thumbnail Generator** panel with:
- **Mode tabs** (Prompt, Reference, Intent, Video Link) at the top
- **Aspect Ratio** selector (16:9, 9:16, 1:1)
- **Style** selector (Photo, Cinematic, Anime, Illustration, Concept)
- **Generate Thumbnail** button

### 3. Need Help?
Click the **❓** icon in the header to open the in-app Help page at any time.

---

## Generation Modes

### Prompt Mode
> ✏️ Best when you know exactly what you want.

1. Select the **✏️ Prompt** tab.
2. Type a detailed description of the thumbnail (colors, layout, text, objects).
3. *(Optional)* Click **📋 Templates** to start from a pre-built template.
4. *(Optional)* Click **✨ Enhance** to let AI expand your description.
5. Choose an aspect ratio and style.
6. Click **🎨 Generate Thumbnail**.

**Example prompt:**
> A bold, high-contrast YouTube thumbnail with a cartoon-style microphone in the center, the text "PERFECT AUDIO" in massive yellow 3D block letters at the top, vibrant purple gradient background, thick outlines on everything.

---

### Reference Mode
> 🖼️ Best when you have example thumbnails or images for inspiration.

1. Select the **🖼️ Reference** tab.
2. **Upload up to 4 reference images** (PNG, JPG, or WebP, max 10 MB each) by clicking the upload area.
3. Write a prompt describing how you want the AI to use the references — e.g., "Create a similar style thumbnail but for a cooking video."
4. *(Optional)* Click **✨ Enhance Prompt** to refine your description.
5. Choose aspect ratio and style, then generate.

---

### Intent Mode
> 🎬 Best for brainstorming — describe your video and let AI design the thumbnail.

1. Select the **🎬 Intent** tab.
2. Describe your video idea in plain language — e.g., "A tutorial video about building a gaming PC on a budget."
3. The AI will generate both a prompt and the image in one step.
4. Choose aspect ratio and style, then generate.

---

### Video Link Mode
> 🔗 Best for auto-generating thumbnails from an existing YouTube or TikTok video.

1. Select the **🔗 Video Link** tab.
2. **Choose a template style:**
   - **✅ Technical Guide** — Single-panel "success outcome" style
   - **⚖️ Do This; Not That** — Split-screen comparison style
3. **Paste a YouTube or TikTok URL** (e.g., `https://youtube.com/watch?v=abc123` or `https://tiktok.com/@user/video/1234567890`).
4. Click **🎨 Generate Thumbnail**.
5. The AI extracts the video title, builds a prompt using your chosen template, and generates a bold cartoon-style thumbnail.

> **Note:** Video Link Mode automatically sets the style to **Illustration** for the best results. TikTok links default to **9:16** (vertical) aspect ratio; YouTube links default to **16:9**.

---

## Prompt Templates

Templates are available in **Prompt Mode** (via the 📋 button) and are used automatically in **Video Link Mode**.

### Subject + Context
**📌 Best for:** Informational or educational videos.

Fill in:
| Field | Example |
|-------|---------|
| **Subject** | TikTok LIVE Compliance |
| **Context** | Low-Quality and Interactive Streaming Standards |
| **Visual Style** *(optional)* | modern gradient background, tech-themed icons |

**Result:** A thumbnail with bold 3D block text and cartoon supporting icons on a vibrant background.

---

### Technical Guide
**✅ Best for:** How-to tutorials and guides.

Fill in:
| Field | Example |
|-------|---------|
| **Solution Object** | A sleek silver studio microphone with a "PERFECT AUDIO" tag |
| **Success Indicators** | Glowing sound wave patterns and a thumbs-up icon |
| **Main Headline** | HOW TO GET PERFECT AUDIO |

**Result:** A richly detailed cartoon illustration of the solution object surrounded by success indicators, with a massive headline.

---

### Do This; Not That
**⚖️ Best for:** Comparison videos, mistakes to avoid, do vs. don't content.

Fill in:
| Field | Example |
|-------|---------|
| **Wrong Way (Left)** | A tangled mess of cheap white headphones with crackly sound waves |
| **Right Way (Right)** | A sleek professional silver studio microphone with clean sound waves |
| **Dull Color (Left)** | Muted Blue |
| **Vibrant Color (Right)** | Emerald Green |

**Result:** A vertical split-screen with the video title in massive 3D text at the top, detailed cartoon illustrations on each side (wrong with red X, right with green checkmark), and "DO THIS; NOT THAT" text at the bottom.

---

## Aspect Ratio & Style

### Aspect Ratios
| Ratio | Use Case |
|-------|----------|
| **16:9** 🖥️ | Standard YouTube thumbnail (1280×720) |
| **9:16** 📱 | YouTube Shorts, TikTok, mobile-first |
| **1:1** ⬜ | Square format for social media |

### Styles
| Style | Description |
|-------|-------------|
| **Photo** | Photorealistic look — product shots, documentary |
| **Cinematic** | Dramatic, movie-poster feel with moody lighting |
| **Anime** | Japanese animation style — gaming, entertainment |
| **Illustration** | Bold cartoon with thick outlines — best for YouTube templates |
| **Concept** | Concept art aesthetic — tech, design, futuristic |

> **Recommendation:** The **Illustration** style produces the best results for YouTube thumbnails, especially with the built-in templates.

---

## Settings & API Key

Click the **⚙️** gear icon in the header to open Settings.

### Bring Your Own Key (BYOK)
1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Paste it in the **API Key** field and click **Save**.
3. Toggle **"Use my own key"** on/off to switch between your key and the platform key.

### Model Selection
- **Gemini Flash** — Fastest generation, good quality.
- **Gemini Pro** — Higher quality, slightly longer generation time.

Settings are saved to your account and persist between sessions.

---

## Tips & Best Practices

### Writing Better Prompts
- **Be specific** about colors, layout, and text placement.
- **Mention the style** explicitly (e.g., "bold 2D cartoon illustration with thick outlines").
- **Describe text** with placement: "large bold text at the top reading..."
- **Use ✨ Enhance** to expand short prompts into detailed descriptions.

### Getting the Best Results
- **Regenerate** — Each generation is unique. If the first result isn't perfect, click Generate again.
- **Try both video link templates** to see which fits your video content better.
- **Use Reference Mode** with thumbnails you admire as inspiration.
- **Keep text short** — Thumbnails work best with 3–5 words of headline text.
- **Use high contrast** and saturated colors — the Illustration style is optimized for this.

### Iterating
- Tweak the prompt and regenerate without starting over.
- Use **✨ Enhance** to refine a prompt that's close but not right.
- Download multiple versions and compare side by side.
