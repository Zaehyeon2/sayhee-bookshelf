import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ChangePasswordSchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { signSession, SESSION, SESSION_CACHE_TAG } from '@/lib/auth'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler('changePassword', async (req: Request) => {
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
    .returning()

  // 토큰은 DB의 권위 있는 행으로 서명한다. user는 10s 캐시 출신이라 tokenVersion이 stale일 수
  // 있고, 추정값(user.tokenVersion + 1)으로 서명하면 tv 불일치로 다음 요청에 즉시 로그아웃된다.
  const authoritative =
    updated ?? (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0]
  if (!authoritative) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 })
  }
  const token = await signSession(authoritative)
  const store = await cookies()
  store.set(SESSION.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION.maxAge,
  })
  // tokenVersion 증가로 이전 토큰 모두 무효 — cached user lookup도 즉시 stale로 표시.
  revalidateTag(SESSION_CACHE_TAG, 'max')
  return NextResponse.json({ ok: true })
})
