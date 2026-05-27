import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { books, writings, movies, type Book, type Writing, type Movie } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import type { User } from '@/lib/db/schema'

/** API route helper — returns Response on failure, user on success */
export class HttpError extends Error {
  constructor(
    public status: number,
    public bodyJson: object,
  ) {
    super(`HTTP ${status}`)
  }
  toResponse(): Response {
    return NextResponse.json(this.bodyJson, { status: this.status })
  }
}

interface RequireUserOpts {
  /**
   * mustChangePassword=1인 사용자도 허용. 기본은 false — 비밀번호 변경 전에는 모든 endpoint를
   * 차단해서 default password 상태로 mutation을 수행하지 못하게 한다.
   * 비밀번호 변경 endpoint 자체에서만 true로 설정해야 한다.
   */
  allowMustChangePassword?: boolean
}

export async function requireUser(opts: RequireUserOpts = {}): Promise<User> {
  const u = await getCurrentUser()
  if (!u) throw new HttpError(401, { error: '로그인이 필요합니다' })
  if (!opts.allowMustChangePassword && u.mustChangePassword === 1) {
    throw new HttpError(403, { error: '먼저 비밀번호를 변경해주세요' })
  }
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

/** API 라우트용: 본인 글 한 개 조회. 다른 사용자의 글이면 404. */
export async function requireOwnWriting(
  writingId: number,
): Promise<{ user: User; writing: Writing }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, writingId), eq(writings.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '글을 찾을 수 없습니다' })
  return { user, writing: rows[0] }
}

/** 서버 컴포넌트(페이지)용: 다른 사용자의 글이면 notFound() throw. */
export async function requireOwnWritingForPage(
  writingId: number,
): Promise<{ user: User; writing: Writing }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, writingId), eq(writings.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, writing: rows[0] }
}

/** API route용: 본인 영화 한 편 조회. 다른 사용자의 영화면 404. */
export async function requireOwnMovie(movieId: number): Promise<{ user: User; movie: Movie }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '영화를 찾을 수 없습니다' })
  return { user, movie: rows[0] }
}

/** 서버 컴포넌트(페이지)용: 다른 사용자의 영화면 notFound() throw. */
export async function requireOwnMovieForPage(
  movieId: number,
): Promise<{ user: User; movie: Movie }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, movie: rows[0] }
}
