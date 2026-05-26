import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const defaultPw = process.env.DEFAULT_USER_PASSWORD
    if (!defaultPw || defaultPw.length < 8) {
      return NextResponse.json(
        { error: 'DEFAULT_USER_PASSWORD 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      )
    }
    const hash = await bcrypt.hash(defaultPw, 10)
    const result = await db
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: 1 })
      .where(eq(users.id, userId))
      .returning({ id: users.id })
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
