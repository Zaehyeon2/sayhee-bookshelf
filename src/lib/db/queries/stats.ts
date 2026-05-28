import { sql } from 'drizzle-orm'
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
 * year 비교:
 * - books.readDate / movies.watchedDate는 user-typed `YYYY-MM-DD` 텍스트 — `LIKE 'YYYY-%'`로 TZ-free 비교.
 * - writings.createdAt은 ms epoch — UTC 연도 경계(`Date.UTC(year, 0, 1)`)로 결정론적 범위 비교.
 *   배포 환경 TZ에 무관하게 동일 결과 보장. (이전 strftime+'localtime' 방식은 서버 TZ에 따라
 *   bucket이 어긋남.)
 */
export async function getUserStats(
  db: Db,
  authorUserId: number,
  year: number = new Date().getFullYear(),
): Promise<UserStats> {
  const yearPrefix = `${year}-%`
  const yearStartMs = Date.UTC(year, 0, 1)
  const yearEndMs = Date.UTC(year + 1, 0, 1)

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
           AND ${writings.createdAt} >= ${yearStartMs}
           AND ${writings.createdAt} < ${yearEndMs})
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
  const yearPrefix = `${year}-%`

  const rows = await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM ${movies} WHERE ${movies.authorUserId} = ${userId}) AS movies_total,
      (SELECT COUNT(*) FROM ${movies}
         WHERE ${movies.authorUserId} = ${userId}
           AND ${movies.watchedDate} LIKE ${yearPrefix}) AS movies_year,
      (SELECT AVG(${movies.rating}) FROM ${movies}
         WHERE ${movies.authorUserId} = ${userId}) AS avg_rating
  `)

  const r = (rows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    moviesTotal: Number(r.movies_total ?? 0),
    moviesThisYear: Number(r.movies_year ?? 0),
    avgMovieRating:
      r.avg_rating !== null && r.avg_rating !== undefined ? Number(r.avg_rating) : null,
  }
}
