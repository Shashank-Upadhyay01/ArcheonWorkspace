/**
 * Model context window hints (tokens). Unknown models fall back to DEFAULT_LIMIT.
 */
export const DEFAULT_TOKEN_LIMIT = 128_000

const MODEL_LIMITS: Record<string, number> = {
  'grok-2-latest': 131_072,
  'grok-2': 131_072,
  'grok-beta': 131_072,
  'grok-3': 131_072,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'o1': 200_000,
  'o1-mini': 128_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-opus': 200_000,
  'claude-sonnet-4': 200_000
}

export function tokenLimitForModel(model: string | undefined | null): number {
  if (!model?.trim()) return DEFAULT_TOKEN_LIMIT
  const key = model.trim().toLowerCase()
  if (MODEL_LIMITS[key] !== undefined) return MODEL_LIMITS[key]
  // fuzzy: match by prefix
  for (const [k, v] of Object.entries(MODEL_LIMITS)) {
    if (key.startsWith(k) || k.startsWith(key)) return v
  }
  return DEFAULT_TOKEN_LIMIT
}

/** Rough local estimate when the API does not return usage. ~4 chars/token. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.max(0, (used / limit) * 100))
}

export function remainingTokens(used: number, limit: number): number {
  return Math.max(0, limit - used)
}
