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
 * 본인 소유 row 조회 헬퍼 팩토리. 멀티테넌트 invariant의 단일 구현 지점 —
 * 모든 user-scoped 테이블은 (id, authorUserId) 매칭으로만 단건 접근한다.
 * - forApi: 라우트에서 try/catch로 HttpError를 잡아 response로 변환.
 * - forPage: 서버 컴포넌트(페이지)용 — 소유자가 아니면 Next.js notFound() throw.
 */
function makeOwnershipHelpers<Row>(
  fetchOwn: (id: number, userId: number) => Promise<Row | undefined>,
  notFoundMessage: string,
) {
  return {
    async forApi(id: number): Promise<{ user: User; row: Row }> {
      const user = await requireUser()
      const row = await fetchOwn(id, user.id)
      if (row === undefined) throw new HttpError(404, { error: notFoundMessage })
      return { user, row }
    },
    async forPage(id: number): Promise<{ user: User; row: Row }> {
      const user = await getCurrentUser()
      if (!user) notFound()
      const row = await fetchOwn(id, user.id)
      if (row === undefined) notFound()
      return { user, row }
    },
  }
}

const ownBook = makeOwnershipHelpers<Book>(
  async (id, userId) =>
    (
      await db
        .select()
        .from(books)
        .where(and(eq(books.id, id), eq(books.authorUserId, userId)))
        .limit(1)
    )[0],
  '책을 찾을 수 없습니다',
)

const ownWriting = makeOwnershipHelpers<Writing>(
  async (id, userId) =>
    (
      await db
        .select()
        .from(writings)
        .where(and(eq(writings.id, id), eq(writings.authorUserId, userId)))
        .limit(1)
    )[0],
  '글을 찾을 수 없습니다',
)

const ownMovie = makeOwnershipHelpers<Movie>(
  async (id, userId) =>
    (
      await db
        .select()
        .from(movies)
        .where(and(eq(movies.id, id), eq(movies.authorUserId, userId)))
        .limit(1)
    )[0],
  '영화를 찾을 수 없습니다',
)

export async function requireOwnBook(bookId: number): Promise<{ user: User; book: Book }> {
  const { user, row: book } = await ownBook.forApi(bookId)
  return { user, book }
}

export async function requireOwnBookForPage(bookId: number): Promise<{ user: User; book: Book }> {
  const { user, row: book } = await ownBook.forPage(bookId)
  return { user, book }
}

export async function requireOwnWriting(
  writingId: number,
): Promise<{ user: User; writing: Writing }> {
  const { user, row: writing } = await ownWriting.forApi(writingId)
  return { user, writing }
}

export async function requireOwnWritingForPage(
  writingId: number,
): Promise<{ user: User; writing: Writing }> {
  const { user, row: writing } = await ownWriting.forPage(writingId)
  return { user, writing }
}

export async function requireOwnMovie(movieId: number): Promise<{ user: User; movie: Movie }> {
  const { user, row: movie } = await ownMovie.forApi(movieId)
  return { user, movie }
}

export async function requireOwnMovieForPage(
  movieId: number,
): Promise<{ user: User; movie: Movie }> {
  const { user, row: movie } = await ownMovie.forPage(movieId)
  return { user, movie }
}
