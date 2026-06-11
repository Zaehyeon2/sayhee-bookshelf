import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth-helpers'
import { SESSION_CACHE_TAG } from '@/lib/auth'
import { requireIdParam, withApiHandler } from '@/lib/api-handler'

type Params = { params: Promise<{ id: string }> }

export const POST = withApiHandler('resetPassword', async (_req: Request, { params }: Params) => {
  const admin = await requireAdmin()
  const userId = await requireIdParam(params)
  const defaultPw = process.env.DEFAULT_USER_PASSWORD
  if (!defaultPw || defaultPw.length < 8) {
    return NextResponse.json(
      { error: 'DEFAULT_USER_PASSWORD 환경변수가 설정되지 않았습니다' },
      { status: 500 },
    )
  }
  const hash = await bcrypt.hash(defaultPw, 10)
  // tokenVersion을 증가시켜 대상 사용자의 모든 기존 세션을 즉시 무효화한다.
  const result = await db
    .update(users)
    .set({
      passwordHash: hash,
      mustChangePassword: 1,
      tokenVersion: sql`${users.tokenVersion} + 1`,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username })
  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  console.warn(
    `[audit] admin id=${admin.id} reset password for user id=${userId} username=${result[0].username}`,
  )
  // tokenVersion bump으로 대상 user의 모든 세션 즉시 무효 — cached lookup도 invalidate.
  revalidateTag(SESSION_CACHE_TAG, 'max')
  return NextResponse.json({ ok: true })
})
