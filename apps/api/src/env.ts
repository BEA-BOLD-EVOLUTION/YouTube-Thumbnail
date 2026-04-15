import dotenv from 'dotenv'
import path from 'path'

// IMPORTANT: Must be imported BEFORE any other module that reads process.env at import-time.

dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

const env = process.env as Record<string, string | undefined>

function aliasEnv(target: string, sources: string[]) {
  if (env[target]) return
  for (const src of sources) {
    const value = env[src]
    if (value) {
      env[target] = value
      return
    }
  }
}

// Normalize environment variable aliases
aliasEnv('GOOGLE_GEMINI_API_KEY', ['Google_Gemini_API_Key', 'Google_Gemini'])
aliasEnv('DATABASE_URL', ['Supabase_Database_Direct_Connect'])
aliasEnv('SUPABASE_URL', ['Supabase_Project_URL'])
aliasEnv('SUPABASE_SERVICE_KEY', ['Supabase_Service_Role', 'Supabase_Secret_Key'])

if (!env.GOOGLE_GENERATIVE_AI_API_KEY && env.GOOGLE_GEMINI_API_KEY) {
  env.GOOGLE_GENERATIVE_AI_API_KEY = env.GOOGLE_GEMINI_API_KEY
}
if (!env.GOOGLE_GEMINI_API_KEY && env.GOOGLE_GENERATIVE_AI_API_KEY) {
  env.GOOGLE_GEMINI_API_KEY = env.GOOGLE_GENERATIVE_AI_API_KEY
}

// -----------------------------------------------------------------------------
// Sentry (optional — only initialized when SENTRY_DSN is set).
// Must run before other modules are imported so OpenTelemetry-based tracing
// can instrument express/http/prisma. Since env.ts is imported first from
// index.ts, initializing here satisfies that constraint.
// -----------------------------------------------------------------------------
if (env.SENTRY_DSN) {
  try {
    // Required lazily so the package is only loaded when actually configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node')
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV || 'development',
      release: env.RAILWAY_GIT_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      sendDefaultPii: false,
    })
    console.log('✅ Sentry initialized')
  } catch (e) {
    console.warn('[env] SENTRY_DSN set but @sentry/node failed to init:', (e as Error).message)
  }
}
