import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { books, type Book } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import type { User } from '@/lib/db/schema'

/** API route helper — returns Response on failure, user on success */
export class HttpError extends Error {
  constructor(public status: number, public bodyJson: object) {
    super(`HTTP ${status}`)
  }
  toResponse(): Response {
    return NextResponse.json(this.bodyJson, { status: this.status })
  }
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser()
  if (!u) throw new HttpError(401, { error: '로그인이 필요합니다' })
  return u
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser()
  if (u.role !== 'admin') throw new HttpError(403, { error: '관리자 권한이 필요합니다' })
  return u
}

/**
 * API route용: 본인 책 한 권 조회. 다른 사용자의 책이면 404로 응답.
 * 라우트에서 try/catch로 HttpError를 잡아 response로 변환.
 */
export async function requireOwnBook(bookId: number): Promise<{ user: User; book: Book }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '책을 찾을 수 없습니다' })
  return { user, book: rows[0] }
}

/**
 * 서버 컴포넌트(페이지)용 변형: 다른 사용자의 책이면 Next.js notFound() throw.
 */
export async function requireOwnBookForPage(bookId: number): Promise<{ user: User; book: Book }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, book: rows[0] }
}
