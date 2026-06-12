import { inArray, sql } from 'drizzle-orm'
import {
  bookTags,
  books,
  gameTags,
  games,
  movieTags,
  movies,
  tags,
  writingTags,
  writings,
} from '../schema'
import { escapeLikePattern } from './shared'
import type { Db, Tx } from './shared'
import { attachTagsBatchGeneric, attachTagsGeneric, replaceTagsTxGeneric } from '@/lib/domains/tags'

// ─── junction ref 상수 ────────────────────────────────────────────────────────

const BOOK_TAGS_REF = { junction: bookTags, fk: bookTags.bookId, tagId: bookTags.tagId }
const WRITING_TAGS_REF = {
  junction: writingTags,
  fk: writingTags.writingId,
  tagId: writingTags.tagId,
}
const MOVIE_TAGS_REF = { junction: movieTags, fk: movieTags.movieId, tagId: movieTags.tagId }
const GAME_TAGS_REF = { junction: gameTags, fk: gameTags.gameId, tagId: gameTags.tagId }

// ─── getOrCreateTagsBatch ────────────────────────────────────────────────────

/**
 * 태그 이름 배열을 한 번의 INSERT(ON CONFLICT DO NOTHING) + 한 번의 SELECT로 처리.
 * N개 태그 → 2 round trips (기존: N×2).
 * 반환값은 names 순서와 동일한 id 배열.
 */
export async function getOrCreateTagsBatch(tx: Tx, names: string[]): Promise<number[]> {
  if (names.length === 0) return []
  await tx
    .insert(tags)
    .values(names.map((name) => ({ name })))
    .onConflictDoNothing()
  const rows = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, names))
  const nameToId = new Map(rows.map((r) => [r.name, r.id]))
  return names.map((name) => {
    const id = nameToId.get(name)
    if (id === undefined) throw new Error(`Tag lookup failed for ${name}`)
    return id
  })
}

// ─── books ────────────────────────────────────────────────────────────────────

export async function attachTags(db: Db, bookId: number): Promise<string[]> {
  return attachTagsGeneric(db, BOOK_TAGS_REF, bookId)
}

export async function attachTagsBatch(db: Db, bookIds: number[]): Promise<Map<number, string[]>> {
  return attachTagsBatchGeneric(db, BOOK_TAGS_REF, bookIds)
}

export async function replaceBookTagsTx(tx: Tx, bookId: number, tagNames: string[]): Promise<void> {
  return replaceTagsTxGeneric(tx, BOOK_TAGS_REF, bookId, tagNames, {
    getOrCreate: getOrCreateTagsBatch,
    buildRows: (id, tagIds) => tagIds.map((tagId) => ({ bookId: id, tagId })),
  })
}

// ─── writings ─────────────────────────────────────────────────────────────────

export async function attachWritingTags(db: Db, writingId: number): Promise<string[]> {
  return attachTagsGeneric(db, WRITING_TAGS_REF, writingId)
}

export async function attachWritingTagsBatch(
  db: Db,
  writingIds: number[],
): Promise<Map<number, string[]>> {
  return attachTagsBatchGeneric(db, WRITING_TAGS_REF, writingIds)
}

export async function replaceWritingTagsTx(
  tx: Tx,
  writingId: number,
  tagNames: string[],
): Promise<void> {
  return replaceTagsTxGeneric(tx, WRITING_TAGS_REF, writingId, tagNames, {
    getOrCreate: getOrCreateTagsBatch,
    buildRows: (id, tagIds) => tagIds.map((tagId) => ({ writingId: id, tagId })),
  })
}

// ─── movies ───────────────────────────────────────────────────────────────────

export async function attachMovieTags(db: Db, movieId: number): Promise<string[]> {
  return attachTagsGeneric(db, MOVIE_TAGS_REF, movieId)
}

export async function attachTagsToMoviesBatch(
  db: Db,
  movieIds: number[],
): Promise<Map<number, string[]>> {
  return attachTagsBatchGeneric(db, MOVIE_TAGS_REF, movieIds)
}

export async function replaceMovieTagsTx(
  tx: Tx,
  movieId: number,
  tagNames: string[],
): Promise<void> {
  return replaceTagsTxGeneric(tx, MOVIE_TAGS_REF, movieId, tagNames, {
    getOrCreate: getOrCreateTagsBatch,
    buildRows: (id, tagIds) => tagIds.map((tagId) => ({ movieId: id, tagId })),
  })
}

// ─── games ────────────────────────────────────────────────────────────────────

export async function attachGameTags(db: Db, gameId: number): Promise<string[]> {
  return attachTagsGeneric(db, GAME_TAGS_REF, gameId)
}

export async function attachTagsToGamesBatch(
  db: Db,
  gameIds: number[],
): Promise<Map<number, string[]>> {
  return attachTagsBatchGeneric(db, GAME_TAGS_REF, gameIds)
}

export async function replaceGameTagsTx(tx: Tx, gameId: number, tagNames: string[]): Promise<void> {
  return replaceTagsTxGeneric(tx, GAME_TAGS_REF, gameId, tagNames, {
    getOrCreate: getOrCreateTagsBatch,
    buildRows: (id, tagIds) => tagIds.map((tagId) => ({ gameId: id, tagId })),
  })
}

// ─── suggest + list (무변경) ──────────────────────────────────────────────────

export async function suggestTags(db: Db, authorUserId: number, q: string): Promise<string[]> {
  const pattern = `${escapeLikePattern(q)}%`
  // 본인 풀(책 + 글 + 영화 + 게임)의 태그 합집합에서 자동완성. ORDER BY로 결과 안정화 — prefix 매칭은
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
        OR EXISTS (
          SELECT 1 FROM ${gameTags} gt
          INNER JOIN ${games} g ON g.id = gt.game_id
          WHERE gt.tag_id = t.id AND g.author_user_id = ${authorUserId}
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

export async function listTagsForGame(db: Db, gameId: number): Promise<string[]> {
  return attachGameTags(db, gameId)
}
