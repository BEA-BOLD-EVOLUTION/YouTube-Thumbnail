import './env'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router'
import { createContext } from './trpc/context'

const app = express()
const PORT = Number(process.env.PORT) || 4000
const HOST = process.env.HOST || '0.0.0.0'

// Environment validation
const requiredEnvVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '))
}

console.log('🔧 Environment check:')
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ set' : '❌ missing')
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ missing')
console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ set' : '❌ missing')
console.log('   GOOGLE_GEMINI_API_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? '✅ set' : '❌ missing (image generation)')
console.log('   ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? '✅ set' : '⚠️  missing (BYOK keys will use legacy encoding)')
console.log('   ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS ? `✅ ${process.env.ALLOWED_ORIGINS}` : '(none — using defaults)')

// Security headers
app.use(helmet())

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
  /https:\/\/youtube-thumbnail.*\.vercel\.app$/,
  // Match Vercel preview deployments for this project: "*-thumbnail-web-*.vercel.app"
  // (covers truncated hostnames like "…bnail-web.vercel.app" seen on mobile Safari).
  /https:\/\/.*thumbnail-web[-.].*\.vercel\.app$/,
  'https://web-production-8640b.up.railway.app',
  ...envAllowedOrigins,
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      const isAllowed = allowedOrigins.some((allowed) =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
      )
      if (!isAllowed) {
        console.warn(`CORS blocked request from: ${origin}`)
        return callback(new Error('Not allowed by CORS'))
      }
      callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-trpc-source'],
  })
)

// Rate limiting — global
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
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
    message: { error: 'Generation limit reached, please try again in an hour.' },
  })
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

app.get('/', (_, res) => res.json({ status: 'ok' }))
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`tRPC error on ${path}:`, error.message)
      }
    },
  })
)

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
