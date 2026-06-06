// NOTE: per-instance state. Multiplies under multi-instance deployment (Vercel).
// Single-user app scale acceptable; revisit with KV/Redis if multi-tenant.
export const WINDOW_MS = 60_000
export const EXTERNAL_SEARCH_RATE_LIMIT = 20
export const UPLOAD_RATE_LIMIT = 30

interface Entry {
  count: number
  resetAt: number
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

function check(
  buckets: Map<number, Entry>,
  limit: number,
  userId: number,
  nowMs: number,
): RateLimitResult {
  const entry = buckets.get(userId)
  if (!entry || entry.resetAt <= nowMs) {
    buckets.set(userId, { count: 1, resetAt: nowMs + WINDOW_MS })
    return { ok: true }
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)) }
  }
  entry.count += 1
  return { ok: true }
}

const searchBuckets = new Map<number, Entry>()
const uploadBuckets = new Map<number, Entry>()

export function checkRateLimit(userId: number, nowMs: number = Date.now()): RateLimitResult {
  return check(searchBuckets, EXTERNAL_SEARCH_RATE_LIMIT, userId, nowMs)
}

export function checkUploadRateLimit(userId: number, nowMs: number = Date.now()): RateLimitResult {
  return check(uploadBuckets, UPLOAD_RATE_LIMIT, userId, nowMs)
}

export function _resetRateLimitForTest(): void {
  searchBuckets.clear()
  uploadBuckets.clear()
}
