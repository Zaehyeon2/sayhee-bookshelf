import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ChangePasswordSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const user = await requireUser({ allowMustChangePassword: true })
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
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: '새 비밀번호는 현재 비밀번호와 달라야 합니다' },
        { status: 400 },
      )
    }
    const newHash = await bcrypt.hash(newPassword, 10)
    // tokenVersion을 증가시키면 이전에 발급된 모든 JWT가 무효화된다.
    const [updated] = await db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePassword: 0,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, user.id))
      .returning({ tokenVersion: users.tokenVersion })

    const newUser = {
      ...user,
      passwordHash: newHash,
      mustChangePassword: 0,
      tokenVersion: updated?.tokenVersion ?? user.tokenVersion + 1,
    }
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
