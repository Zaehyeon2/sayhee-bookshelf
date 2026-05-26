import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { deleteWriting, getWritingById, updateWriting } from '@/lib/db/queries'
import { UpdateWritingSchema } from '@/lib/validations'
import { requireOwnWriting, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

function isValidId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const writingId = Number(id)
    if (!isValidId(writingId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnWriting(writingId)
    const writing = await getWritingById(db, user.id, writingId)
    if (!writing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(writing)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const writingId = Number(id)
    if (!isValidId(writingId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
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
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('updateWriting failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const writingId = Number(id)
    if (!isValidId(writingId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnWriting(writingId)
    const ok = await deleteWriting(db, user.id, writingId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('deleteWriting failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
