import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalSearchQuerySchema } from '@/lib/validations'
import { checkRateLimit } from '@/lib/external/rate-limit'
import { searchMoviesExternal } from '@/lib/external/movies'
import type { ExternalSearchResponse } from '@/lib/external/types'

const TIMEOUT_MS = 5000

export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }

  const limited = checkRateLimit(user.id)
  if (!limited.ok) {
    return NextResponse.json(
      { error: '잠시만요, 검색이 너무 많아요' },
      {
        status: 429,
        headers: { 'Retry-After': String(limited.retryAfterSeconds) },
      },
    )
  }

  const url = new URL(req.url)
  const parsed = ExternalSearchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const ctl = new AbortController()
  const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const items = await searchMoviesExternal(parsed.data.q, { limit: 10, signal: ctl.signal })
    const body: ExternalSearchResponse<number> = { items, source: 'tmdb' }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e) {
    console.error('[external/movies/search] adapter error:', (e as Error).message)
    return NextResponse.json(
      { error: '검색 서비스가 일시적으로 응답하지 않아요' },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
