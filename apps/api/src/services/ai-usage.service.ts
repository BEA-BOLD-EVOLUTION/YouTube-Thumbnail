import { Prisma, type PrismaClient } from '@prisma/client'

export type AiProvider = 'gemini' | string

export interface RecordAiUsageEventParams {
  userId?: string | null
  provider: AiProvider
  model: string
  operation: string
  source?: string | null
  usedOwnKey?: boolean
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  costUsd?: number | null
  metadata?: unknown
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  return value
}

export async function recordAiUsageEvent(
  prisma: PrismaClient,
  params: RecordAiUsageEventParams
): Promise<void> {
  try {
    const inputTokens = safeNumber(params.inputTokens)
    const outputTokens = safeNumber(params.outputTokens)
    const totalTokens =
      safeNumber(params.totalTokens) ??
      (inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null)

    await prisma.aiUsageEvent.create({
      data: {
        userId: params.userId ?? null,
        provider: params.provider,
        model: params.model,
        operation: params.operation,
        source: params.source ?? null,
        usedOwnKey: params.usedOwnKey ?? false,
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        totalTokens,
        costUsd: params.costUsd == null ? null : new Prisma.Decimal(params.costUsd),
        currency: 'USD',
        metadata: params.metadata as any,
      },
    })
  } catch (error) {
    console.warn('[AiUsage] Failed to record AI usage event:', error)
  }
}
