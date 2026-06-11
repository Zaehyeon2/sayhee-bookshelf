import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { books, writings, movies, games } from '../schema'
import type * as schema from '../schema'

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }
export type WritingWithTags = typeof writings.$inferSelect & { tags: string[] }
export type MovieWithTags = typeof movies.$inferSelect & { tags: string[] }
export type GameWithTags = typeof games.$inferSelect & { tags: string[] }

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

export const isGameSlugUniqueViolation = (e: unknown) =>
  isTableSlugViolation(e, 'idx_games_user_slug', 'games')

/**
 * slug 충돌 retry 루프 공통 헬퍼.
 * baseSlug에서 시작해 충돌 시 `-2`, `-3`... 을 붙여 최대 100회 재시도.
 * attempt 클로저 안에서 실제 INSERT가 이뤄지므로 drizzle 동적 테이블 제네릭 없이
 * 각 도메인 파일에서 완전한 타입 추론을 유지한다.
 */
export async function insertWithSlugRetry<T>(
  baseSlug: string,
  isViolation: (e: unknown) => boolean,
  attempt: (slug: string) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`
    try {
      return await attempt(candidate)
    } catch (e) {
      if (isViolation(e)) continue
      throw e
    }
  }
  throw new Error(`Could not generate unique slug after 100 attempts`)
}

// ─── rating distribution ────────────────────────────────────────────────────

export type RatingDistribution = {
  avg: number
  cnt: number
  buckets: Record<number, number> // keys 1..10
}

/**
 * rating/count 행 배열에서 1-10 버킷 채우기 + 가중 평균 계산.
 * SQL 쿼리는 각 도메인 파일에서 직접 수행하고, 결과 후처리만 이 함수에서 담당한다.
 */
export function computeRatingDistribution(
  rows: { rating: unknown; cnt: unknown }[],
): RatingDistribution {
  const buckets: Record<number, number> = {}
  for (let r = 1; r <= 10; r++) buckets[r] = 0
  let total = 0
  let weightedSum = 0
  for (const row of rows) {
    const r = Number(row.rating)
    const c = Number(row.cnt)
    if (r < 1 || r > 10 || !Number.isInteger(r)) continue
    buckets[r] = c
    total += c
    weightedSum += r * c
  }
  return {
    avg: total === 0 ? 0 : weightedSum / total,
    cnt: total,
    buckets,
  }
}
