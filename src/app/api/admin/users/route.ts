import { NextResponse } from 'next/server'
import { sql, eq } from 'drizzle-orm'
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

export async function POST(req: Request) {
  try {
    await requireAdmin()
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
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, normalized))
      .limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 })
    }
    const hash = await bcrypt.hash(defaultPw, 10)
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
    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
