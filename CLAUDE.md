# CLAUDE.md

## Project Overview

AI-powered YouTube thumbnail generator for BEA training videos. Users can generate thumbnails via four modes: direct prompt, reference images, intent description, or video link (YouTube/TikTok). Built as a full-stack TypeScript monorepo with end-to-end type safety via tRPC.

## Repository Structure

```
youtube-thumbnail/            # Turborepo monorepo root
├── apps/
│   ├── web/                  # Next.js 16 frontend (React 19)
│   │   └── src/
│   │       ├── app/          # App Router (auth/, help/, page.tsx, layout.tsx)
│   │       ├── components/
│   │       │   ├── create/   # ThumbnailGenerator, PromptTemplates
│   │       │   ├── settings/ # ApiKeySettings (BYOK)
│   │       │   ├── ui/       # Radix UI wrappers (button, dialog, input, etc.)
│   │       │   └── Providers.tsx  # tRPC + QueryClient providers
│   │       ├── hooks/        # useAuth
│   │       └── lib/          # supabase-client, trpc, utils
│   └── api/                  # Express + tRPC backend
│       ├── prisma/           # Schema and migrations
│       └── src/
│           ├── env.ts        # Fail-fast environment validation
│           ├── index.ts      # Express server entry point
│           ├── lib/          # prisma.ts, supabase.ts clients
│           ├── services/     # Business logic
│           │   ├── gemini-image.service.ts  # AI image generation (core service)
│           │   ├── youtube.service.ts       # YouTube metadata extraction
│           │   ├── tiktok.service.ts        # TikTok URL parsing
│           │   └── ai-usage.service.ts      # Cost tracking
│           └── trpc/
│               ├── context.ts   # Auth context (Supabase token → user)
│               ├── trpc.ts      # tRPC init + middleware
│               ├── router.ts    # Root router
│               └── routers/     # imageRouter, settingsRouter
├── turbo.json                # Turborepo pipeline config
├── package.json              # Workspace root
└── .env.example              # All required/optional env vars
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, Radix UI, TanStack React Query
- **Backend:** Express.js, tRPC v11, Zod v4
- **Database:** PostgreSQL (Supabase-hosted), Prisma ORM 5.22
- **Auth:** Supabase Auth (SSR on web, service key on API)
- **AI:** Google Gemini (`@google/genai`) for image generation and text
- **Monorepo:** Turborepo with npm workspaces
- **Runtime:** Node.js >= 20.9.0, npm >= 9.8.1

## Common Commands

```bash
# Development (runs both web + api via Turbo)
npm run dev

# Build all apps
npm run build

# Lint (web only — uses next lint)
npm run lint

# Database operations (from repo root)
npm run db:generate    # Regenerate Prisma client
npm run db:push        # Push schema changes (dev only)
npm run db:migrate     # Create + run migration
npm run db:studio      # Open Prisma Studio GUI
```

Individual app commands from their directories:
```bash
# Web (apps/web) — port 3000
npm run dev            # Next.js dev server
npm run build          # Production build
npm run lint           # ESLint

# API (apps/api) — port 4000
npm run dev            # tsx watch with hot reload
npm run build          # prisma generate + tsc
npm run start          # Run compiled dist/index.js
```

## Environment Variables

Copy `.env.example` to set up. Required variables:

**API (apps/api/.env):**
- `DATABASE_URL` — Pooled PostgreSQL connection (pgbouncer)
- `DIRECT_URL` — Direct PostgreSQL connection (for migrations)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Supabase auth
- `GOOGLE_GEMINI_API_KEY` — Platform Gemini key for image generation
- `ENCRYPTION_KEY` — 64 hex chars for AES-256-GCM BYOK key encryption

**Web (apps/web/.env.local):**
- `NEXT_PUBLIC_API_URL` — Backend URL (http://localhost:4000 for dev)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Client Supabase

The API validates all required env vars at startup and exits immediately if any are missing (`apps/api/src/env.ts`).

## Architecture Patterns

### tRPC End-to-End Type Safety
The API exposes tRPC routers (`imageRouter`, `settingsRouter`) that the web app calls via `@trpc/react-query`. Types flow from Zod schemas on the API through to the React components — no manual type syncing.

### Authentication Flow
1. Web app gets Supabase session token
2. Token sent via `Authorization` header in tRPC requests
3. API validates token via Supabase service key in tRPC context
4. User resolved/created in Prisma from auth metadata

### Gemini Key Management
- Platform key (`GOOGLE_GEMINI_API_KEY`) used by default
- Optional multi-key pool (`GOOGLE_GEMINI_API_KEYS`) with round-robin + cooldown
- Users can bring their own key (BYOK) — encrypted with AES-256-GCM at rest

### Database Models (Prisma)
- `User` — Auth metadata, role (USER/MODERATOR/ADMIN/SUPER_ADMIN), BYOK settings
- `AiUsageEvent` — Every AI call logged with tokens, cost, model, metadata

### Security Middleware (API)
- Helmet for security headers
- CORS with dynamic allowlist (env-configured)
- Rate limiting: 200 req/15min global, 30 req/hour for image generation
- Body size limit: 50MB (for base64 image uploads)

## Conventions

### Commit Messages
Follow conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs:`, `style:`
- Scopes: `web`, `api`, or omit for cross-cutting changes
- Examples: `fix(web): unblock build — narrow reference-image MIME`, `feat(api): stability — fail-fast env, Gemini timeouts`

### Code Style
- TypeScript strict mode across both apps
- Zod for all runtime validation (tRPC inputs, env vars)
- Services layer for business logic, tRPC routers for request handling
- Radix UI primitives wrapped in `components/ui/` with CVA + tailwind-merge for styling
- `cn()` utility from `lib/utils.ts` for conditional class names

### File Naming
- React components: PascalCase (`ThumbnailGenerator.tsx`)
- Services: kebab-case with `.service.ts` suffix (`gemini-image.service.ts`)
- Utilities/lib: kebab-case (`supabase-client.ts`)

## Deployment

- **API:** Railway with Docker (`apps/api/Dockerfile` — multi-stage node:20-alpine)
- **Web:** Vercel (standard Next.js deployment)
- **Database:** Supabase managed PostgreSQL

## Testing

No test framework is currently configured. When adding tests:
- Use the framework appropriate for the app (e.g., Vitest for both apps)
- tRPC routers can be tested by calling procedures directly with a mock context
- Service functions can be unit tested independently
