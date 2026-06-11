import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth-helpers'
import { requireIdParam, withApiHandler } from '@/lib/api-handler'

type Params = { params: Promise<{ id: string }> }

export const DELETE = withApiHandler('deleteUser', async (_req: Request, { params }: Params) => {
  const admin = await requireAdmin()
  const userId = await requireIdParam(params)
  if (userId === admin.id) {
    return NextResponse.json({ error: '본인을 삭제할 수 없습니다' }, { status: 400 })
  }

  // 마지막 관리자 보호 — 대상이 admin이고 시스템에 admin이 둘 이하면 거절.
  const target = await db
    .select({ role: users.role, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (target.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (target[0].role === 'admin') {
    const adminCountRows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.role, 'admin'))
    const adminCount = Number(adminCountRows[0]?.n ?? 0)
    if (adminCount <= 1) {
      return NextResponse.json({ error: '마지막 관리자를 삭제할 수 없습니다' }, { status: 400 })
    }
  }

  const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  console.warn(
    `[audit] admin id=${admin.id} deleted user id=${userId} username=${target[0].username}`,
  )
  return NextResponse.json({ ok: true })
})
