# YouTube Thumbnail Generator

An AI-powered thumbnail generator for BEA training videos. Built as a full-stack monorepo with a Next.js web app and an Express/tRPC API backend.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| Backend | Express, tRPC, Prisma ORM |
| Auth | Supabase (email/password, invite-only) |
| AI | Google Gemini (Flash & Pro) via `@google/genai` |
| Database | Supabase (PostgreSQL) |
| Monorepo | Turborepo |

---

## Project Structure

```
apps/
  web/    # Next.js frontend (port 3000)
  api/    # Express + tRPC backend (port 4000)
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- npm >= 9.8.1

### Environment Variables

**`apps/api/.env`**
```env
DATABASE_URL=
DIRECT_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GOOGLE_GEMINI_API_KEY=
GOOGLE_GEMINI_API_KEYS=   # optional: comma-separated key rotation
PORT=4000
```

**`apps/web/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Install & Run

```bash
# Install dependencies
npm install

# Run both apps in dev mode
npm run dev

# Or run individually
cd apps/web && npm run dev   # http://localhost:3000
cd apps/api && npm run dev   # http://localhost:4000
```

### Database

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database (dev)
npm run db:migrate    # Create and run migrations
npm run db:studio     # Open Prisma Studio
```

---

## Features

- **4 generation modes:** Prompt, Reference (upload up to 4 images), Intent (describe your video), Video Link (YouTube/TikTok URL)
- **Prompt templates:** Subject + Context, Technical Guide, Do This; Not That
- **AI prompt enhancement** using Gemini text models
- **Aspect ratios:** 16:9, 9:16, 1:1
- **Styles:** Photo, Cinematic, Anime, Illustration, Concept
- **BYOK (Bring Your Own Key):** Users can supply their own Gemini API key
- **Model selection:** Gemini Flash (fast) or Gemini Pro (higher quality)
- **Invite-only access** — public sign-ups are disabled

---

## User Management

Access is restricted to authorized users only. See [USER_MANAGEMENT.md](USER_MANAGEMENT.md) for how to create and manage accounts via the Supabase Dashboard.

---

## User Guide

See [WALKTHROUGH.md](WALKTHROUGH.md) for a full walkthrough of all generation modes, templates, and best practices.

---

## Build & Deploy

```bash
npm run build    # Build all apps
npm run lint     # Lint all apps
npm run clean    # Clean build artifacts
```

The API is deployable to Railway; the web app is deployable to Vercel.
