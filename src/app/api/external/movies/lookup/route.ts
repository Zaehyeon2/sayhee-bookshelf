import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { TmdbIdParamSchema } from '@/lib/validations'
import { lookupMovieByTmdbId } from '@/lib/external/movie-lookup'

const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = TmdbIdParamSchema.safeParse(url.searchParams.get('tmdbId') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid tmdbId' }, { status: 400 })
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const result = await lookupMovieByTmdbId(parsed.data, { signal: ctl.signal })
      if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('[external/movies/lookup] error:', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
