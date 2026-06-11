import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { countGamesByExternalIds } from '@/lib/db/queries/games'
import { requireUser } from '@/lib/auth-helpers'
import { ExternalIdsQuerySchema } from '@/lib/validations'
import { withApiHandler } from '@/lib/api-handler'

/**
 * GET /api/games/by-external?ids=rawgId1,rawgId2,...
 *
 * 검색 드롭다운의 "이미 N번 기록" 배지용. 본인 games 중 주어진 rawgId들 각각의 기록 수를 반환.
 * 멀티테넌트 invariant: countGamesByExternalIds가 authorUserId로 필터.
 *
 * ExternalIdsQuerySchema는 string[]을 반환하므로 numeric으로 coerce — 유효하지 않은 ID는 필터 제외.
 * Response: { counts: Record<rawgId, number> } — 매칭 0건 또는 비-numeric ID는 키로 포함되지 않음.
 */
export const GET = withApiHandler('listGamesByExternal', async (req: Request): Promise<Response> => {
  const user = await requireUser()

  const url = new URL(req.url)
  const parsed = ExternalIdsQuerySchema.safeParse({ ids: url.searchParams.get('ids') ?? '' })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '잘못된 쿼리 파라미터' },
      { status: 400 },
    )
  }

  // Strict canonical-form check: only accepts unambiguous positive integer strings.
  // Rejects '5e2', '550.0', '0x226', ' 550 ' etc. that Number() would otherwise accept.
  const numericIds = parsed.data.ids
    .map((s) => {
      const trimmed = s.trim()
      const n = Number(trimmed)
      return Number.isInteger(n) && n > 0 && String(n) === trimmed ? n : null
    })
    .filter((n): n is number => n !== null)

  const map = await countGamesByExternalIds(db, user.id, numericIds)
  // JSON 객체 키는 문자열이므로 number → string으로 직렬화
  const counts: Record<string, number> = {}
  for (const [k, v] of map) counts[String(k)] = v
  return NextResponse.json({ counts })
})
