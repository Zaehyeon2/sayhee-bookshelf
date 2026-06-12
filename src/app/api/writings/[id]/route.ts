import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { attachWritingTags, deleteWriting, updateWriting } from '@/lib/db/queries'
import { UpdateWritingSchema } from '@/lib/validations'
import { requireOwnWriting, requireUser } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // requireOwnWriting이 소유권 검증과 동시에 row를 반환 — getWritingById 재조회 제거.
  const { writing } = await requireOwnWriting(writingId)
  const tags = await attachWritingTags(db, writingId)
  return NextResponse.json({ ...writing, tags })
})

export const PATCH = withApiHandler('updateWriting', async (req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // 소유권 검증은 updateWriting 내부 WHERE (id, authorUserId)가 수행 — 선조회 왕복 제거.
  const user = await requireUser()
  const input = await requireJsonBody(req, UpdateWritingSchema)
  const updated = await updateWriting(db, user.id, writingId, input)
  if (!updated) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  // 소유권 검증은 DELETE WHERE (id, authorUserId)가 수행 — 선조회 왕복 제거.
  const user = await requireUser()
  const ok = await deleteWriting(db, user.id, writingId)
  if (!ok) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
