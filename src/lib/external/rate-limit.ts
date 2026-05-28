const WINDOW_MS = 60_000
export const EXTERNAL_SEARCH_RATE_LIMIT = 20

interface Entry {
  count: number
  resetAt: number
}

const buckets = new Map<number, Entry>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export function checkRateLimit(userId: number, nowMs: number = Date.now()): RateLimitResult {
  const entry = buckets.get(userId)
  if (!entry || entry.resetAt <= nowMs) {
    buckets.set(userId, { count: 1, resetAt: nowMs + WINDOW_MS })
    return { ok: true }
  }
  if (entry.count >= EXTERNAL_SEARCH_RATE_LIMIT) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)),
    }
  }
  entry.count += 1
  return { ok: true }
}

export function _resetRateLimitForTest(): void {
  buckets.clear()
}
