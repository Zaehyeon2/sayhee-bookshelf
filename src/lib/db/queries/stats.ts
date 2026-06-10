import { sql } from 'drizzle-orm'
import { books, writings, movies, tags, bookTags } from '../schema'
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

/** 대시보드 위젯 공용 항목 — chart.js 카테고리 축에 그대로 매핑 */
export interface CountItem {
  label: string
  count: number
}

export interface BookDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[] // 1~10 전 칸, 빈 칸 0
  genreDist: CountItem[] // count DESC
  yearTimeline: CountItem[] // 연도 ASC, 기록 있는 연도만
  topTags: CountItem[] // 최대 5
  topAuthors: CountItem[] // 최대 5
}

function toCountItems(rows: unknown): CountItem[] {
  return (rows as Array<{ label: string | number; count: number }>).map((r) => ({
    label: String(r.label),
    count: Number(r.count),
  }))
}

/**
 * rating 1~10 전 칸 채움 — 히스토그램 축 고정용.
 * 라벨은 저장값/2 = 0.5~5 — 사이트 별점 표시 관례(RatingScore)와 동일 스케일.
 */
function fillRatingDist(rows: CountItem[]): CountItem[] {
  const byLabel = new Map(rows.map((r) => [r.label, r.count]))
  return Array.from({ length: 10 }, (_, i) => {
    const raw = String(i + 1) // DB 저장값 키 (1~10)
    return { label: String((i + 1) / 2), count: byLabel.get(raw) ?? 0 }
  })
}

/**
 * 책장 대시보드 — 전부 인덱스 위 COUNT/AVG/GROUP BY, 본문 row 미조회.
 * readDate는 user-typed `YYYY-MM-DD` 텍스트 → substr/LIKE로 TZ-free 연도 버킷.
 */
export async function getBookDashboard(
  db: Db,
  userId: number,
  year: number = new Date().getFullYear(),
): Promise<BookDashboard> {
  const yearPrefix = `${year}-%`

  const [summaryRows, ratingRows, genreRows, yearRows, tagRows, authorRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${books}
           WHERE ${books.authorUserId} = ${userId}
             AND ${books.readDate} LIKE ${yearPrefix}) AS this_year,
        (SELECT AVG(${books.rating}) FROM ${books}
           WHERE ${books.authorUserId} = ${userId}) AS avg_rating
    `),
    db.all(sql`
      SELECT ${books.rating} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.rating}
    `),
    db.all(sql`
      SELECT ${books.genre} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.genre}
      ORDER BY COUNT(*) DESC, label
    `),
    db.all(sql`
      SELECT substr(${books.readDate}, 1, 4) AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${bookTags}
      JOIN ${books} ON ${bookTags.bookId} = ${books.id}
      JOIN ${tags} ON ${bookTags.tagId} = ${tags.id}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT ${books.author} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.author}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
  ])

  const s = (summaryRows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    summary: {
      total: Number(s.total ?? 0),
      thisYear: Number(s.this_year ?? 0),
      avgRating: s.avg_rating !== null && s.avg_rating !== undefined ? Number(s.avg_rating) : null,
    },
    ratingDist: fillRatingDist(toCountItems(ratingRows)),
    genreDist: toCountItems(genreRows),
    yearTimeline: toCountItems(yearRows),
    topTags: toCountItems(tagRows),
    topAuthors: toCountItems(authorRows),
  }
}
