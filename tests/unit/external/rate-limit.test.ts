import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkRateLimit,
  _resetRateLimitForTest,
  EXTERNAL_SEARCH_RATE_LIMIT,
  WINDOW_MS,
} from '@/lib/external/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => _resetRateLimitForTest())

  it('allows up to the configured limit per minute per user', () => {
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) {
      expect(checkRateLimit(42).ok).toBe(true)
    }
    expect(checkRateLimit(42).ok).toBe(false)
  })

  it('isolates users', () => {
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) checkRateLimit(1)
    expect(checkRateLimit(1).ok).toBe(false)
    expect(checkRateLimit(2).ok).toBe(true)
  })

  it('returns retryAfterSeconds on rejection', () => {
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) checkRateLimit(7)
    const r = checkRateLimit(7)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryAfterSeconds).toBeGreaterThan(0)
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(WINDOW_MS / 1000))
    }
  })

  it('resets window after expiry', () => {
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) checkRateLimit(9)
    expect(checkRateLimit(9).ok).toBe(false)
    const future = Date.now() + WINDOW_MS + 1000
    expect(checkRateLimit(9, future).ok).toBe(true)
  })
})
