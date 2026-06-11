import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { deleteWriting, getWritingById, updateWriting } from '@/lib/db/queries'
import { UpdateWritingSchema } from '@/lib/validations'
import { requireOwnWriting } from '@/lib/auth-helpers'
import { requireIdParam, withApiHandler } from '@/lib/api-handler'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  const { user } = await requireOwnWriting(writingId)
  const writing = await getWritingById(db, user.id, writingId)
  if (!writing) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(writing)
})

export const PATCH = withApiHandler('updateWriting', async (req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  const { user } = await requireOwnWriting(writingId)
  const body = await req.json().catch(() => null)
  const parsed = UpdateWritingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const updated = await updateWriting(db, user.id, writingId, parsed.data)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteWriting', async (_req: Request, { params }: Params) => {
  const writingId = await requireIdParam(params)
  const { user } = await requireOwnWriting(writingId)
  const ok = await deleteWriting(db, user.id, writingId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
