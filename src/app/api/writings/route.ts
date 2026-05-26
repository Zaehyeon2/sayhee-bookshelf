import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createWriting, listWritings } from '@/lib/db/queries'
import { CreateWritingSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const list = await listWritings(db, user.id)
    return NextResponse.json(list)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = CreateWritingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const writing = await createWriting(db, user.id, parsed.data)
    return NextResponse.json({ id: writing.id, slug: writing.slug }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createWriting failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
