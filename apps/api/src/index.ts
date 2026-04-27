import './env'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router'
import { createContext } from './trpc/context'
import { prisma } from './lib/prisma'

const app = express()
const PORT = Number(process.env.PORT) || 4000
const HOST = process.env.HOST || '0.0.0.0'

// -----------------------------------------------------------------------------
// Fail-fast environment validation.
// Missing any of these leaves the service in a broken state where healthchecks
// pass but every request dies on first DB/auth touch. Exit with code 1 so the
// orchestrator (Railway/docker) surfaces the misconfiguration and restarts.
// -----------------------------------------------------------------------------
const requiredEnvVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '))
  console.error('   The API cannot start without these. Set them and redeploy.')
  process.exit(1)
}

console.log('🔧 Environment check:')
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ set' : '❌ missing')
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ missing')
console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ set' : '❌ missing')
console.log('   GOOGLE_GEMINI_API_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? '✅ set' : '❌ missing (image generation)')
console.log('   ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? '✅ set' : '⚠️  missing (BYOK keys will use legacy encoding)')
console.log('   ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS ? `✅ ${process.env.ALLOWED_ORIGINS}` : '(none — using defaults)')

// Security headers — relax CORP so the API can be consumed cross-origin
// NOTE: registered AFTER cors below so preflight short-circuits first.
const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
})

const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// Extra origins provided at runtime via env var, e.g.
//   ALLOWED_ORIGINS="https://my-app.vercel.app,https://staging.example.com"
// This lets new frontend URLs be allowed without a code change/redeploy.
const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:3000',
  'http://localhost:3001',
  // Any *.vercel.app — covers production and preview deployments for this
  // project regardless of the project's exact slug (e.g. youtube-thumbnail-*,
  // you-tube-thumbnail-web, etc.). If you need to lock this down to a single
  // project later, set ALLOWED_ORIGINS explicitly and remove this regex.
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i,
  ...envAllowedOrigins,
  ...envOrigins,
]

function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.some((allowed) =>
    typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
  )
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Non-browser / same-origin requests have no Origin header — allow.
    if (!origin) return callback(null, true)
    if (!isOriginAllowed(origin)) {
      console.warn(`CORS blocked request from: ${origin}`)
      // Returning false (instead of an Error) responds without CORS headers
      // and a clean 204/200 — the browser will block, but we won't 500.
      return callback(null, false)
    }
    callback(null, true)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-trpc-source',
    'trpc-batch-mode',
    'trpc-accept',
  ],
  maxAge: 86400,
  optionsSuccessStatus: 204,
})

// 1. CORS first — must run before helmet/rate-limit/body-parser so that
//    preflight responses always carry valid CORS headers and a 2xx status.
app.use(corsMiddleware)

// 2. Bulletproof preflight short-circuit. Some upstream proxies (Railway's
//    edge) return 415 if OPTIONS bodies/content-type confuse downstream
//    middleware. Answer every OPTIONS here and return 204 immediately.
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next()
  const origin = req.headers.origin
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    )
    const reqHeaders =
      (req.headers['access-control-request-headers'] as string | undefined) ||
      'Content-Type, Authorization, x-trpc-source, trpc-batch-mode, trpc-accept'
    res.setHeader('Access-Control-Allow-Headers', reqHeaders)
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  res.status(204).end()
})

// 3. Now apply security/rate-limit middleware to non-preflight traffic.
app.use(helmetMiddleware)

// Rate limiting — global
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    // Don't rate-limit CORS preflight — a 429 here would strip CORS headers
    // and cause the browser to block the actual request.
    skip: (req) => req.method === 'OPTIONS',
    message: { error: 'Too many requests, please try again later.' },
  })
)

// Rate limiting — image generation (expensive AI calls)
app.use(
  '/trpc/image.generate',
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: { error: 'Generation limit reached, please try again in an hour.' },
  })
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

app.get('/', (_, res) => res.json({ status: 'ok' }))

// Liveness: the process is up. Cheap. Don't add DB/external checks here or
// orchestrators will kill the container on every transient DB blip.
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Readiness: the process can actually serve requests. Railway/k8s should gate
// traffic on this. Checks DB connectivity; returns 503 if unreachable.
app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}
  let allOk = true

  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    allOk = false
    checks.database = {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  })
})

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`tRPC error on ${path}:`, error.message)
      }
      // Forward unexpected (non-client) errors to Sentry so we see real bugs
      // without the noise of e.g. BAD_REQUEST validation failures.
      if (process.env.SENTRY_DSN && error.code === 'INTERNAL_SERVER_ERROR') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Sentry = require('@sentry/node')
          Sentry.captureException(error, { tags: { trpcPath: path || 'unknown' } })
        } catch {
          /* Sentry missing — already warned at boot */
        }
      }
    },
  })
)

// Sentry's Express error handler must be registered AFTER all routes/middleware.
// No-op when SENTRY_DSN isn't set.
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node')
    Sentry.setupExpressErrorHandler(app)
  } catch {
    /* already warned at boot */
  }
}

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 API server running on ${HOST}:${PORT}`)
})

async function shutdown(signal: string) {
  console.log(`🛑 Received ${signal}. Shutting down...`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
