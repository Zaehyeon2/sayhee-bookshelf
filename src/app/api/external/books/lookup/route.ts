import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { IsbnParamSchema } from '@/lib/validations'
import { lookupBookByIsbn } from '@/lib/external/book-lookup'
import { logAdapterError } from '@/lib/external/log-error'

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = IsbnParamSchema.safeParse(url.searchParams.get('isbn') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 ISBN' }, { status: 400 })
    }
    // 타임아웃은 lookup 내부('use cache' 함수)의 AbortSignal.timeout이 담당 —
    // 라우트에서 signal을 넘겨도 cache key 문제로 받을 수 없어 여기선 만들지 않는다.
    const result = await lookupBookByIsbn(parsed.data)
    if (!result) return NextResponse.json({ error: '작품을 찾지 못했어요' }, { status: 404 })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    logAdapterError('external/books/lookup', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
