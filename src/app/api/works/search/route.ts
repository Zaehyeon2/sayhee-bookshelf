import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { WorksSearchQuerySchema } from '@/lib/validations'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'
import { checkRateLimit } from '@/lib/external/rate-limit'
import { logAdapterError } from '@/lib/external/log-error'
import {
  getBookAggregatesByIsbns,
  getMovieAggregatesByTmdbIds,
} from '@/lib/db/queries'

const PAGE_SIZE = 24
const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const parsed = WorksSearchQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 검색 요청' }, { status: 400 })
    }
    const { type, q, page = 1 } = parsed.data
    const limited = checkRateLimit(user.id)
    if (!limited.ok) {
      return NextResponse.json(
        { error: '잠시만요, 검색이 너무 많아요' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      )
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      if (type === 'book') {
        const externalItems = await searchBooksExternal(q, { limit: PAGE_SIZE, signal: ctl.signal })
        const isbns = Array.from(new Set(externalItems.map((it) => it.externalId).filter(Boolean)))
        const agg = await getBookAggregatesByIsbns(db, isbns)
        const items = externalItems.map((it) => ({
          ...it,
          siteAgg: agg.get(it.externalId) ?? { avg: 0, cnt: 0 },
        }))
        // NOTE: external search is single-shot (no offset); pagination metadata is
        // included for forward compat but total === items.length until cursor support lands.
        return NextResponse.json({ items, total: items.length, page, pageSize: PAGE_SIZE, type })
      }
      const externalItems = await searchMoviesExternal(q, { limit: PAGE_SIZE, signal: ctl.signal })
      const tmdbIds = Array.from(new Set(externalItems.map((it) => it.externalId)))
      const agg = await getMovieAggregatesByTmdbIds(db, tmdbIds)
      const items = externalItems.map((it) => ({
        ...it,
        siteAgg: agg.get(it.externalId) ?? { avg: 0, cnt: 0 },
      }))
      return NextResponse.json({ items, total: items.length, page, pageSize: PAGE_SIZE, type })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    logAdapterError('works/search', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
