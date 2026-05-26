import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users, books } from '@/lib/db/schema'
import { CreateUserSchema } from '@/lib/validations'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'
import { normalizeUsername } from '@/lib/username-normalize'

export async function GET() {
  try {
    await requireAdmin()
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        bookCount: sql<number>`(SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${users.id})`,
      })
      .from(users)
      .orderBy(users.createdAt)
    return NextResponse.json(rows.map((r) => ({ ...r, bookCount: Number(r.bookCount) })))
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

/**
 * username unique 충돌은 DB가 단일하게 판정하도록 한다 (TOCTOU 회피).
 * INSERT가 SQLITE_CONSTRAINT를 던지면 409로 변환해 응답한다.
 */
function isUsernameUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    const msg = err.message ?? ''
    const isUnique =
      err.code === 'SQLITE_CONSTRAINT' ||
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /UNIQUE constraint/i.test(msg)
    if (isUnique && (msg.includes('idx_users_username') || msg.includes('users.username'))) {
      return true
    }
    current = err.cause
  }
  return false
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    const defaultPw = process.env.DEFAULT_USER_PASSWORD
    if (!defaultPw || defaultPw.length < 8) {
      return NextResponse.json(
        { error: 'DEFAULT_USER_PASSWORD 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      )
    }
    const body = await req.json().catch(() => null)
    const parsed = CreateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    const normalized = normalizeUsername(parsed.data.username)
    const hash = await bcrypt.hash(defaultPw, 10)
    try {
      const [inserted] = await db
        .insert(users)
        .values({
          username: normalized,
          displayName: parsed.data.displayName ?? parsed.data.username.trim(),
          passwordHash: hash,
          role: 'member',
          mustChangePassword: 1,
          createdAt: Date.now(),
        })
        .returning({ id: users.id, username: users.username, displayName: users.displayName })
      console.info(
        `[audit] admin id=${admin.id} created user id=${inserted.id} username=${inserted.username}`,
      )
      return NextResponse.json(inserted, { status: 201 })
    } catch (e) {
      if (isUsernameUniqueViolation(e)) {
        return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 })
      }
      throw e
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createUser failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

