import { eq, inArray, sql } from 'drizzle-orm'
import { books, bookTags, tags, writingTags, writings, movieTags, movies } from '../schema'
import { escapeLikePattern } from './shared'
import type { Db, Tx } from './shared'

export async function attachTags(db: Db, bookId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, bookId))
  return rows.map((r) => r.name)
}

export async function attachTagsBatch(db: Db, bookIds: number[]): Promise<Map<number, string[]>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db
    .select({ bookId: bookTags.bookId, name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(inArray(bookTags.bookId, bookIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.bookId) ?? []
    existing.push(r.name)
    map.set(r.bookId, existing)
  }
  return map
}

/**
 * INSERT...ON CONFLICT...RETURNING으로 단일 statement에서 atomic하게 처리.
 * libSQL은 RETURNING을 지원하며, DO UPDATE를 통해 conflict 발생 시에도 row를 반환한다.
 */
export async function getOrCreateTag(db: Tx, name: string): Promise<number> {
  const result = await db
    .insert(tags)
    .values({ name })
    .onConflictDoUpdate({ target: tags.name, set: { name } })
    .returning({ id: tags.id })
  if (!result[0]) throw new Error(`Tag upsert failed for ${name}`)
  return result[0].id
}

export async function replaceBookTagsTx(tx: Tx, bookId: number, tagNames: string[]): Promise<void> {
  await tx.delete(bookTags).where(eq(bookTags.bookId, bookId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(tx, name)
    await tx.insert(bookTags).values({ bookId, tagId })
  }
}

export async function attachWritingTags(db: Db, writingId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(writingTags)
    .innerJoin(tags, eq(writingTags.tagId, tags.id))
    .where(eq(writingTags.writingId, writingId))
  return rows.map((r) => r.name)
}

export async function attachWritingTagsBatch(
  db: Db,
  writingIds: number[],
): Promise<Map<number, string[]>> {
  if (writingIds.length === 0) return new Map()
  const rows = await db
    .select({ writingId: writingTags.writingId, name: tags.name })
    .from(writingTags)
    .innerJoin(tags, eq(writingTags.tagId, tags.id))
    .where(inArray(writingTags.writingId, writingIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.writingId) ?? []
    existing.push(r.name)
    map.set(r.writingId, existing)
  }
  return map
}

export async function replaceWritingTagsTx(
  tx: Tx,
  writingId: number,
  tagNames: string[],
): Promise<void> {
  await tx.delete(writingTags).where(eq(writingTags.writingId, writingId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(tx, name)
    await tx.insert(writingTags).values({ writingId, tagId })
  }
}

export async function attachMovieTags(db: Db, movieId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(movieTags)
    .innerJoin(tags, eq(movieTags.tagId, tags.id))
    .where(eq(movieTags.movieId, movieId))
  return rows.map((r) => r.name)
}

export async function attachTagsToMoviesBatch(
  db: Db,
  movieIds: number[],
): Promise<Map<number, string[]>> {
  if (movieIds.length === 0) return new Map()
  const rows = await db
    .select({ movieId: movieTags.movieId, name: tags.name })
    .from(movieTags)
    .innerJoin(tags, eq(movieTags.tagId, tags.id))
    .where(inArray(movieTags.movieId, movieIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.movieId) ?? []
    existing.push(r.name)
    map.set(r.movieId, existing)
  }
  return map
}

export async function replaceMovieTagsTx(
  tx: Tx,
  movieId: number,
  tagNames: string[],
): Promise<void> {
  await tx.delete(movieTags).where(eq(movieTags.movieId, movieId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(tx, name)
    await tx.insert(movieTags).values({ movieId, tagId })
  }
}

export async function suggestTags(db: Db, authorUserId: number, q: string): Promise<string[]> {
  const pattern = `${escapeLikePattern(q)}%`
  // 본인 풀(책 + 글 + 영화)의 태그 합집합에서 자동완성. ORDER BY로 결과 안정화 — prefix 매칭은
  // 길이가 짧을수록 더 정확한 매칭일 가능성이 높으므로 length ASC, 동률은 이름 사전순.
  const rows = await db.all(sql`
    SELECT DISTINCT t.name
    FROM ${tags} t
    WHERE t.name LIKE ${pattern} ESCAPE '\\'
      AND (
        EXISTS (
          SELECT 1 FROM ${bookTags} bt
          INNER JOIN ${books} b ON b.id = bt.book_id
          WHERE bt.tag_id = t.id AND b.author_user_id = ${authorUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ${writingTags} wt
          INNER JOIN ${writings} w ON w.id = wt.writing_id
          WHERE wt.tag_id = t.id AND w.author_user_id = ${authorUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ${movieTags} mt
          INNER JOIN ${movies} m ON m.id = mt.movie_id
          WHERE mt.tag_id = t.id AND m.author_user_id = ${authorUserId}
        )
      )
    ORDER BY length(t.name) ASC, t.name ASC
    LIMIT 8
  `)
  return (rows as { name: string }[]).map((r) => r.name)
}

export async function listTagsForBook(db: Db, bookId: number): Promise<string[]> {
  return attachTags(db, bookId)
}

export async function listTagsForWriting(db: Db, writingId: number): Promise<string[]> {
  return attachWritingTags(db, writingId)
}

export async function listTagsForMovie(db: Db, movieId: number): Promise<string[]> {
  return attachMovieTags(db, movieId)
}
