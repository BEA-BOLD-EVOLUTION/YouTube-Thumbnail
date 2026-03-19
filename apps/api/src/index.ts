import './env'

import express from 'express'
import cors from 'cors'
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
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? `✅ ${process.env.SUPABASE_URL}` : '❌ missing')
console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? `✅ set (${process.env.SUPABASE_SERVICE_KEY.slice(0, 10)}...)` : '❌ missing')
console.log('   GOOGLE_GEMINI_API_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? '✅ set' : '❌ missing (image generation)')

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  /https:\/\/youtube-thumbnail.*\.vercel\.app$/,
  'https://web-production-8640b.up.railway.app',
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      const isAllowed = allowedOrigins.some((allowed) =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
      )
      callback(null, true) // Allow all, log blocked
      if (!isAllowed) console.log(`CORS request from: ${origin}`)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-trpc-source'],
  })
)

app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))

app.get('/', (_, res) => res.json({ status: 'ok', service: 'YouTube Thumbnail API' }))
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.get('/debug/auth-check', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const supabaseUrl = process.env.SUPABASE_URL || 'NOT SET'
  const serviceKeySet = !!process.env.SUPABASE_SERVICE_KEY
  const { supabase } = require('./lib/supabase')
  const result: Record<string, unknown> = {
    supabaseUrl,
    serviceKeySet,
    supabaseClientInitialized: !!supabase,
    tokenProvided: !!token,
    tokenLength: token?.length ?? 0,
  }
  if (token && supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token)
      result.getUserError = error ? { message: error.message, status: error.status } : null
      result.getUserData = data?.user ? { id: data.user.id, email: data.user.email } : null
    } catch (err: any) {
      result.getUserException = err.message
    }
  }
  res.json(result)
})

app.use(
  '/trpc',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-trpc-source')
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  },
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      console.error(`tRPC error on ${path}:`, error.message)
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
