import { sql, eq, and, gte, lt, count, avg } from 'drizzle-orm'
import { books, writings, movies } from '../schema'
import type { Db } from './shared'

export interface UserStats {
  booksTotal: number
  booksThisYear: number
  avgRating: number // 0 when no books
  writingsTotal: number
  writingsThisYear: number
}

/**
 * 모든 사용자 통계를 단일 쿼리로 계산. 책/글 row를 가져오지 않고 인덱스 위에서 COUNT/AVG만 수행.
 *
 * year 비교는 `strftime('%Y', ..., 'unixepoch', 'localtime')`를 사용 — SQLite에 'localtime'
 * modifier를 명시해 UTC가 아닌 서버 로컬 타임존에서 연도를 계산한다. 이렇게 해야 JS의
 * `new Date().getFullYear()` (역시 로컬)와 일관된다.
 */
export async function getUserStats(
  db: Db,
  authorUserId: number,
  year: number = new Date().getFullYear(),
): Promise<UserStats> {
  const yearPrefix = `${year}-%`
  const yearStr = String(year)

  const rows = await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${authorUserId}) AS books_total,
      (SELECT COUNT(*) FROM ${books}
         WHERE ${books.authorUserId} = ${authorUserId}
           AND ${books.readDate} LIKE ${yearPrefix}) AS books_year,
      (SELECT AVG(${books.rating}) FROM ${books}
         WHERE ${books.authorUserId} = ${authorUserId}) AS avg_rating,
      (SELECT COUNT(*) FROM ${writings}
         WHERE ${writings.authorUserId} = ${authorUserId}) AS writings_total,
      (SELECT COUNT(*) FROM ${writings}
         WHERE ${writings.authorUserId} = ${authorUserId}
           AND strftime('%Y', ${writings.createdAt} / 1000, 'unixepoch', 'localtime') = ${yearStr})
        AS writings_year
  `)

  const r = (rows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    booksTotal: Number(r.books_total ?? 0),
    booksThisYear: Number(r.books_year ?? 0),
    avgRating: Number(r.avg_rating ?? 0),
    writingsTotal: Number(r.writings_total ?? 0),
    writingsThisYear: Number(r.writings_year ?? 0),
  }
}

export interface UserMovieStats {
  moviesTotal: number
  moviesThisYear: number
  avgMovieRating: number | null
}

export async function getUserMovieStats(
  db: Db,
  userId: number,
  year: number,
): Promise<UserMovieStats> {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime()
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime()

  const [totalRow] = await db
    .select({ c: count() })
    .from(movies)
    .where(eq(movies.authorUserId, userId))

  const [thisYearRow] = await db
    .select({ c: count() })
    .from(movies)
    .where(
      and(
        eq(movies.authorUserId, userId),
        gte(movies.createdAt, yearStart),
        lt(movies.createdAt, yearEnd),
      ),
    )

  const [avgRow] = await db
    .select({ a: avg(movies.rating) })
    .from(movies)
    .where(eq(movies.authorUserId, userId))

  return {
    moviesTotal: Number(totalRow.c),
    moviesThisYear: Number(thisYearRow.c),
    avgMovieRating: avgRow.a !== null ? Number(avgRow.a) : null,
  }
}
