import { sql } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { books, writings, movies, tags, bookTags, movieTags, writingTags } from '../schema'
import type { Db } from './shared'
import { formatRatingCompact } from '../../rating'
import type { CountItem, BookDashboard, MovieDashboard, WritingDashboard } from '../../stats-types'

// 클라이언트 컴포넌트는 이 모듈이 아닌 '@/lib/stats-types'에서 타입을 가져갈 것
// (여기서 가져가면 import type → import 실수 한 번에 drizzle이 클라이언트 번들로 유입).
export type { CountItem, BookDashboard, MovieDashboard, WritingDashboard }

export interface UserStats {
  booksTotal: number
  booksThisYear: number
  avgRating: number // 0 when no books
  writingsTotal: number
  writingsThisYear: number
}

/** raw 집계 결과의 첫 행 — 단일 row SELECT 공용 추출 */
function firstRow(rows: unknown): Record<string, number | null> {
  return (rows as Array<Record<string, number | null>>)[0] ?? {}
}

/**
 * 모든 사용자 통계를 단일 쿼리로 계산. 책/글 row를 가져오지 않고 인덱스 위에서 COUNT/AVG만 수행.
 *
 * year 비교:
 * - books.readDate / movies.watchedDate는 user-typed `YYYY-MM-DD` 텍스트 — `LIKE 'YYYY-%'`로 TZ-free 비교.
 * - writings.createdAt은 ms epoch — UTC 연도 경계(`Date.UTC(year, 0, 1)`)로 결정론적 범위 비교.
 *   배포 환경 TZ에 무관하게 동일 결과 보장. (이전 strftime+'localtime' 방식은 서버 TZ에 따라
 *   bucket이 어긋남.)
 *
 * year는 호출부에서 KST 기준으로 계산해 전달 (`currentKstYear()`) — get*Dashboard summary와
 * 동일 집계이므로 두 쪽의 연도 소스가 갈라지면 홈/대시보드 숫자가 어긋난다.
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
           AND ${books.readDate} LIKE ${yearPrefix} ESCAPE '\\') AS books_year,
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

  const r = firstRow(rows)
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
           AND ${movies.watchedDate} LIKE ${yearPrefix} ESCAPE '\\') AS movies_year,
      (SELECT AVG(${movies.rating}) FROM ${movies}
         WHERE ${movies.authorUserId} = ${userId}) AS avg_rating
  `)

  const r = firstRow(rows)
  return {
    moviesTotal: Number(r.movies_total ?? 0),
    moviesThisYear: Number(r.movies_year ?? 0),
    avgMovieRating:
      r.avg_rating !== null && r.avg_rating !== undefined ? Number(r.avg_rating) : null,
  }
}

function toCountItems(rows: unknown): CountItem[] {
  return (rows as Array<{ label: string | number; count: number }>).map((r) => ({
    label: String(r.label),
    count: Number(r.count),
  }))
}

/**
 * rating 1~10 전 칸 채움 — 히스토그램 축 고정용.
 * 라벨은 표시 스케일(0.5~5, formatRatingCompact) — RatingScore 등 사이트 관례와 동일.
 */
function fillRatingDist(rows: CountItem[]): CountItem[] {
  const byLabel = new Map(rows.map((r) => [r.label, r.count]))
  return Array.from({ length: 10 }, (_, i) => {
    const raw = String(i + 1) // DB 저장값 키 (1~10)
    return { label: formatRatingCompact(i + 1), count: byLabel.get(raw) ?? 0 }
  })
}

/**
 * books/movies 대시보드 공용 소스 — 두 도메인은 완전 동형이라 테이블·컬럼만 갈아끼움.
 * (writings는 rating/genre가 없는 의도적 비대칭이라 여기 포함하지 않음.)
 */
interface ContentDashboardSource {
  table: SQLiteTable
  id: AnySQLiteColumn
  authorUserId: AnySQLiteColumn
  date: AnySQLiteColumn // readDate / watchedDate — user-typed 'YYYY-MM-DD'
  rating: AnySQLiteColumn
  genre: AnySQLiteColumn
  person: AnySQLiteColumn // author / director
  tagJoin: SQLiteTable // bookTags / movieTags
  tagEntityFk: AnySQLiteColumn // bookTags.bookId / movieTags.movieId
  tagFk: AnySQLiteColumn // *.tagId
}

interface ContentDashboardData {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[]
  genreDist: CountItem[]
  yearTimeline: CountItem[]
  topTags: CountItem[]
  personTop: CountItem[]
}

/**
 * 책장/영화관 대시보드 공용 집계 — 전부 인덱스 위 COUNT/AVG/GROUP BY, 본문 row 미조회.
 * date는 user-typed `YYYY-MM-DD` 텍스트 → substr/LIKE로 TZ-free 연도 버킷.
 */
async function contentDashboard(
  db: Db,
  userId: number,
  year: number,
  src: ContentDashboardSource,
): Promise<ContentDashboardData> {
  const yearPrefix = `${year}-%`

  const [summaryRows, ratingRows, genreRows, yearRows, tagRows, personRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${src.table} WHERE ${src.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${src.table}
           WHERE ${src.authorUserId} = ${userId}
             AND ${src.date} LIKE ${yearPrefix} ESCAPE '\\') AS this_year,
        (SELECT AVG(${src.rating}) FROM ${src.table}
           WHERE ${src.authorUserId} = ${userId}) AS avg_rating
    `),
    db.all(sql`
      SELECT ${src.rating} AS label, COUNT(*) AS count FROM ${src.table}
      WHERE ${src.authorUserId} = ${userId}
      GROUP BY ${src.rating}
    `),
    db.all(sql`
      SELECT ${src.genre} AS label, COUNT(*) AS count FROM ${src.table}
      WHERE ${src.authorUserId} = ${userId}
      GROUP BY ${src.genre}
      ORDER BY COUNT(*) DESC, label
    `),
    db.all(sql`
      SELECT substr(${src.date}, 1, 4) AS label, COUNT(*) AS count FROM ${src.table}
      WHERE ${src.authorUserId} = ${userId}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${src.tagJoin}
      JOIN ${src.table} ON ${src.tagEntityFk} = ${src.id}
      JOIN ${tags} ON ${src.tagFk} = ${tags.id}
      WHERE ${src.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT ${src.person} AS label, COUNT(*) AS count FROM ${src.table}
      WHERE ${src.authorUserId} = ${userId}
      GROUP BY ${src.person}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
  ])

  const s = firstRow(summaryRows)
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
    personTop: toCountItems(personRows),
  }
}

const BOOK_SOURCE: ContentDashboardSource = {
  table: books,
  id: books.id,
  authorUserId: books.authorUserId,
  date: books.readDate,
  rating: books.rating,
  genre: books.genre,
  person: books.author,
  tagJoin: bookTags,
  tagEntityFk: bookTags.bookId,
  tagFk: bookTags.tagId,
}

const MOVIE_SOURCE: ContentDashboardSource = {
  table: movies,
  id: movies.id,
  authorUserId: movies.authorUserId,
  date: movies.watchedDate,
  rating: movies.rating,
  genre: movies.genre,
  person: movies.director,
  tagJoin: movieTags,
  tagEntityFk: movieTags.movieId,
  tagFk: movieTags.tagId,
}

/**
 * 책장 대시보드. year는 호출부가 KST 기준으로 전달할 것 (`currentKstYear()`) —
 * 서버 TZ 기본값에 맡기면 KST 새해 경계에서 홈 통계와 어긋난다.
 */
export async function getBookDashboard(
  db: Db,
  userId: number,
  year: number,
): Promise<BookDashboard> {
  const d = await contentDashboard(db, userId, year, BOOK_SOURCE)
  return {
    summary: d.summary,
    ratingDist: d.ratingDist,
    genreDist: d.genreDist,
    yearTimeline: d.yearTimeline,
    topTags: d.topTags,
    topAuthors: d.personTop,
  }
}

/** 영화관 대시보드 — getBookDashboard와 동형 (watchedDate/director/movieTags). */
export async function getMovieDashboard(
  db: Db,
  userId: number,
  year: number,
): Promise<MovieDashboard> {
  const d = await contentDashboard(db, userId, year, MOVIE_SOURCE)
  return {
    summary: d.summary,
    ratingDist: d.ratingDist,
    genreDist: d.genreDist,
    yearTimeline: d.yearTimeline,
    topTags: d.topTags,
    topDirectors: d.personTop,
  }
}

/**
 * 글방 대시보드. createdAt은 ms epoch — UTC 경계로 결정론적 버킷 (getUserStats와 동일 규칙).
 * 월 라벨은 strftime('%Y-%m', created_at/1000, 'unixepoch') — UTC 기준.
 * now는 테스트 결정론용, year는 "올해" 버킷 연도 — 호출부가 KST 기준으로 전달
 * (`currentKstYear()`). 기본값은 now의 UTC 연도.
 */
export async function getWritingDashboard(
  db: Db,
  userId: number,
  now: Date = new Date(),
  year: number = now.getUTCFullYear(),
): Promise<WritingDashboard> {
  const yearStartMs = Date.UTC(year, 0, 1)
  const yearEndMs = Date.UTC(year + 1, 0, 1)
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)

  const [summaryRows, monthlyRows, tagRows, charRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${writings} WHERE ${writings.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${writings}
           WHERE ${writings.authorUserId} = ${userId}
             AND ${writings.createdAt} >= ${yearStartMs}
             AND ${writings.createdAt} < ${yearEndMs}) AS this_year
    `),
    db.all(sql`
      SELECT strftime('%Y-%m', ${writings.createdAt} / 1000, 'unixepoch') AS label,
             COUNT(*) AS count
      FROM ${writings}
      WHERE ${writings.authorUserId} = ${userId}
        AND ${writings.createdAt} >= ${monthStartMs}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${writingTags}
      JOIN ${writings} ON ${writingTags.writingId} = ${writings.id}
      JOIN ${tags} ON ${writingTags.tagId} = ${tags.id}
      WHERE ${writings.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT COALESCE(SUM(LENGTH(${writings.body})), 0) AS total_chars,
             COALESCE(AVG(LENGTH(${writings.body})), 0) AS avg_chars
      FROM ${writings}
      WHERE ${writings.authorUserId} = ${userId}
    `),
  ])

  // 최근 12개월 라벨 생성 + 빈 달 0 채움
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const byMonth = new Map(toCountItems(monthlyRows).map((r) => [r.label, r.count]))

  const s = firstRow(summaryRows)
  const c = firstRow(charRows)
  return {
    summary: { total: Number(s.total ?? 0), thisYear: Number(s.this_year ?? 0) },
    monthlyTimeline: months.map((m) => ({ label: m, count: byMonth.get(m) ?? 0 })),
    topTags: toCountItems(tagRows),
    charStats: { totalChars: Number(c.total_chars ?? 0), avgChars: Number(c.avg_chars ?? 0) },
  }
}
