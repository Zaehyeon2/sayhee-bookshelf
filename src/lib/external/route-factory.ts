import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalSearchQuerySchema } from '@/lib/validations'
import { checkRateLimit } from './rate-limit'
import type { ExternalSearchItem, ExternalSearchResponse } from './types'

const TIMEOUT_MS = 5000
const SEARCH_LIMIT = 10

type Source = 'naver' | 'tmdb'

interface FactoryOpts<TId extends string | number> {
  source: Source
  adapter: (
    query: string,
    opts: { limit: number; signal?: AbortSignal },
  ) => Promise<ExternalSearchItem<TId>[]>
  logTag: string
}

export function createExternalSearchHandler<TId extends string | number>(
  opts: FactoryOpts<TId>,
): (req: Request) => Promise<Response> {
  return async function GET(req: Request): Promise<Response> {
    let user
    try {
      user = await requireUser()
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse()
      throw e
    }

    // Validate FIRST — cheap, synchronous. Don't burn rate quota on malformed queries.
    const url = new URL(req.url)
    const parsed = ExternalSearchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
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

    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const items = await opts.adapter(parsed.data.q, {
        limit: SEARCH_LIMIT,
        signal: ctl.signal,
      })
      const body: ExternalSearchResponse<TId> = { items, source: opts.source }
      return NextResponse.json(body, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      })
    } catch (e) {
      // SECURITY: never log the upstream URL — adapters MUST NOT interpolate the request URL
      // (which contains cert_key for SeoJi or Bearer for TMDB) into thrown error messages.
      // Logging full Error (name/message/stack) is safe because stacks point at adapter code.
      const err = e instanceof Error ? e : new Error(String(e))
      console.error(`[${opts.logTag}] adapter error:`, {
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
      return NextResponse.json(
        { error: '검색 서비스가 일시적으로 응답하지 않아요' },
        { status: 503 },
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}
