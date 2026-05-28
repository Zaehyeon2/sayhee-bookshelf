import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { countBooksByExternalIds } from '@/lib/db/queries/books'
import { HttpError, requireUser } from '@/lib/auth-helpers'
import { ExternalIdsQuerySchema } from '@/lib/validations'

/**
 * GET /api/books/by-external?ids=isbn1,isbn2,...
 *
 * 검색 드롭다운의 "이미 N번 기록" 배지용. 본인 books 중 주어진 isbn들 각각의 기록 수를 반환.
 * 멀티테넌트 invariant: countBooksByExternalIds가 authorUserId로 필터.
 *
 * Response: { counts: Record<isbn, number> } — 매칭이 0건인 ID는 키로 포함되지 않음.
 */
export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }

  const url = new URL(req.url)
  const parsed = ExternalIdsQuerySchema.safeParse({ ids: url.searchParams.get('ids') ?? '' })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '잘못된 쿼리 파라미터' },
      { status: 400 },
    )
  }

  // Strict canonical-form check: only accepts 13-digit ISBN numerals.
  // Mirrors pickIsbn13 in adapters — keeps dedup invariant tight.
  const validIds = parsed.data.ids.filter((id) => /^\d{13}$/.test(id))
  if (validIds.length === 0) {
    return NextResponse.json({ counts: {} })
  }
  const map = await countBooksByExternalIds(db, user.id, validIds)
  return NextResponse.json({ counts: Object.fromEntries(map) })
}
