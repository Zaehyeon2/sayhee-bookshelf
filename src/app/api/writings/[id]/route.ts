import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { attachWritingTags, deleteWriting, updateWriting } from '@/lib/db/queries'
import { UpdateWritingSchema } from '@/lib/validations'
import { requireUser, writingOwnership } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // forApi가 소유권 검증과 동시에 row를 반환 — getWritingById 재조회 제거.
  // 태그 조회는 id로만 수행되며 검증 실패 시 결과가 버려지므로 병렬 실행해도 누출 없음.
  const [{ row: writing }, tags] = await Promise.all([
    writingOwnership.forApi(writingId),
    attachWritingTags(db, writingId),
  ])
  return NextResponse.json({ ...writing, tags })
})

export const PATCH = withApiHandler('updateWriting', async (req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // 소유권 검증은 updateWriting 내부 WHERE (id, authorUserId)가 수행 — 선조회 왕복 제거.
  const user = await requireUser()
  const input = await requireJsonBody(req, UpdateWritingSchema)
  const updated = await updateWriting(db, user.id, writingId, input)
  if (!updated) {
    return NextResponse.json({ error: writingOwnership.notFoundMessage }, { status: 404 })
  }
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // 소유권 검증은 DELETE WHERE (id, authorUserId)가 수행 — 선조회 왕복 제거.
  const user = await requireUser()
  const ok = await deleteWriting(db, user.id, writingId)
  if (!ok) {
    return NextResponse.json({ error: writingOwnership.notFoundMessage }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
})
