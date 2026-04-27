# YouTube Thumbnail Generator

An AI-powered thumbnail generator. Built as a full-stack monorepo with a Next.js frontend and an Express/tRPC API backend, using Google Gemini for image generation.

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| Backend | Express, tRPC, Prisma ORM |
| Auth | Supabase (email/password) |
| AI | Google Gemini (Flash & Pro) |
| Database | Supabase (PostgreSQL) |
| Monorepo | Turborepo |

---

## Project Structure

```text
apps/
  web/    # Next.js frontend (port 3000)
  api/    # Express + tRPC backend (port 4000)
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- npm >= 9.8.1
- A [Supabase](https://supabase.com) project
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### Environment Variables

**`apps/api/.env`**

```env
DATABASE_URL=
DIRECT_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GOOGLE_GEMINI_API_KEY=
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
npm install
npm run dev
```

The web app runs at `http://localhost:3000` and the API at `http://localhost:4000`.

### Database

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database (dev)
npm run db:migrate    # Create and run migrations
npm run db:studio     # Open Prisma Studio
```

---

## Features

- **4 generation modes:** Prompt, Reference (upload images), Intent (describe your video), Video Link (YouTube/TikTok URL)
- **Prompt templates:** Subject + Context, Technical Guide, Do This; Not That
- **AI prompt enhancement** via Gemini text models
- **Aspect ratios:** 16:9, 9:16, 1:1
- **Styles:** Photo, Cinematic, Anime, Illustration, Concept
- **BYOK (Bring Your Own Key):** Users can supply their own Gemini API key
- **Model selection:** Gemini Flash or Gemini Pro

---

## Build

```bash
npm run build    # Build all apps
npm run lint     # Lint all apps
npm run clean    # Clean build artifacts
```
