import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { books, writings, movies } from '../schema'
import type * as schema from '../schema'

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }
export type WritingWithTags = typeof writings.$inferSelect & { tags: string[] }
export type MovieWithTags = typeof movies.$inferSelect & { tags: string[] }

export type PublicMovieCard = {
  id: number
  slug: string
  title: string
  director: string
  genre: string
  rating: number
  oneLineReview: string | null
  publishedAt: number
  authorDisplayName: string
}

export type Db = LibSQLDatabase<typeof schema>
// db.transaction 콜백의 인자 타입 — SQLiteTransaction은 Db와 일부 메서드(batch)가 다르므로
// Db로 alias하지 않고 트랜잭션 콜백 시그니처에서 추론한다.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * LIKE 패턴 escape — SQL의 `%`, `_`, 그리고 escape 문자 자체를 안전하게 처리.
 * 모든 LIKE 호출은 이 함수를 거치고 SQL에는 `ESCAPE '\'`를 명시해야 함.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * libSQL/Turso의 UNIQUE constraint 에러 메시지는 driver/version에 따라
 * - `UNIQUE constraint failed: <table>.author_user_id, <table>.slug`
 * - `<indexName>` (인덱스 이름 포함)
 * - 양쪽 조합
 * 등으로 다양하다. 컬럼 시그니처와 인덱스 이름을 모두 매칭한다.
 *
 * tablePrefix를 받아 fallback 브랜치를 table-qualified로 한정함으로써
 * books/writings/movies 간 false-positive를 방지한다.
 */
function isTableSlugViolation(e: unknown, indexName: string, tablePrefix: string): boolean {
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
    if (
      isUnique &&
      (msg.includes(indexName) ||
        (msg.includes(`${tablePrefix}.author_user_id`) && msg.includes(`${tablePrefix}.slug`)))
    ) {
      return true
    }
    current = err.cause
  }
  return false
}

export const isSlugUniqueViolation = (e: unknown) =>
  isTableSlugViolation(e, 'idx_books_user_slug', 'books')

export const isWritingSlugUniqueViolation = (e: unknown) =>
  isTableSlugViolation(e, 'idx_writings_user_slug', 'writings')

export const isMovieSlugUniqueViolation = (e: unknown) =>
  isTableSlugViolation(e, 'idx_movies_user_slug', 'movies')
