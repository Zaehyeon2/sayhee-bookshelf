import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    if (userId === admin.id) {
      return NextResponse.json({ error: '본인을 삭제할 수 없습니다' }, { status: 400 })
    }
    const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
