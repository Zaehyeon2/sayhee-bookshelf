import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { RawgIdParamSchema } from '@/lib/validations'
import { lookupGameByRawgId } from '@/lib/external/game-lookup'
import { logAdapterError } from '@/lib/external/log-error'

const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = RawgIdParamSchema.safeParse(url.searchParams.get('rawgId') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 RAWG ID' }, { status: 400 })
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const result = await lookupGameByRawgId(parsed.data, { signal: ctl.signal })
      if (!result) return NextResponse.json({ error: '작품을 찾지 못했어요' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    logAdapterError('external/games/lookup', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
