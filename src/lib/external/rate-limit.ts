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

// 만료 엔트리를 따로 지우지 않으면 사용자 수만큼 맵이 무한 성장한다.
// 타이머 없이(의존성 0) 체크 시점에 기회적으로 청소 — 임계 초과 시에만 O(n)이라 평상시 비용 없음.
const SWEEP_THRESHOLD = 1000

// 임계 초과인데 전부 유효(삭제 0건)면 매 요청 O(n) 공회전 — sweep을 윈도우당 1회로 제한.
const lastSweepAt = new WeakMap<Map<number, Entry>, number>()

function sweepExpired(buckets: Map<number, Entry>, nowMs: number): void {
  if (buckets.size <= SWEEP_THRESHOLD) return
  if (nowMs - (lastSweepAt.get(buckets) ?? 0) < WINDOW_MS) return
  lastSweepAt.set(buckets, nowMs)
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= nowMs) buckets.delete(key)
  }
}

function check(
  buckets: Map<number, Entry>,
  limit: number,
  userId: number,
  nowMs: number,
): RateLimitResult {
  sweepExpired(buckets, nowMs)
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
