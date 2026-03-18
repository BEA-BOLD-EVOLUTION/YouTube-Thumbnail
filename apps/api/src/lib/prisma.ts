import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is not set!')
    throw new Error('DATABASE_URL is required')
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: { db: { url: dbUrl } },
  })

  client.$connect()
    .then(() => console.log('✅ Database connected'))
    .catch((e: Error) => {
      console.error('❌ Database connection failed:', e.message)
    })

  return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
