import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ChangePasswordSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = ChangePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다' },
        { status: 400 },
      )
    }
    const { currentPassword, newPassword } = parsed.data
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다' }, { status: 400 })
    }
    const newHash = await bcrypt.hash(newPassword, 10)
    await db
      .update(users)
      .set({ passwordHash: newHash, mustChangePassword: 0 })
      .where(eq(users.id, user.id))
    const newUser = { ...user, passwordHash: newHash, mustChangePassword: 0 }
    const token = await signSession(newUser)
    const store = await cookies()
    store.set(SESSION.name, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION.maxAge,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
