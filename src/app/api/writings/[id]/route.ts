import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { deleteWriting, getWritingById, updateWriting } from '@/lib/db/queries'
import { UpdateWritingSchema } from '@/lib/validations'
import { requireOwnWriting } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'

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
  const input = await requireJsonBody(req, UpdateWritingSchema)
  const updated = await updateWriting(db, user.id, writingId, input)
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
