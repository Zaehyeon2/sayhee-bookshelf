import { cache } from 'react'
import { and, count, desc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm'
import { games, gameTags, tags, users } from '../schema'
import { toSlug } from '@/lib/slug'
import type { CreateGameInput, UpdateGameInput } from '@/lib/validations'
import {
  computeRatingDistribution,
  escapeLikePattern,
  insertWithSlugRetry,
  isGameSlugUniqueViolation,
} from './shared'
import type { Db, GameWithTags, RatingDistribution } from './shared'
import { attachGameTags, attachTagsToGamesBatch, replaceGameTagsTx } from './tags'

export type PublicGameCard = {
  id: number
  slug: string
  title: string
  developer: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  rawgId: number | null
  publishedAt: number
  authorDisplayName: string
}

export interface ListGameFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export async function createGame(
  db: Db,
  authorUserId: number,
  input: CreateGameInput,
): Promise<GameWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  // game INSERT + tags 교체를 단일 트랜잭션으로 묶어 중간 실패 시 부분 상태가 남지 않게 함.
  return insertWithSlugRetry(base, isGameSlugUniqueViolation, (slug) =>
    db.transaction(async (tx) => {
      const isPublic = input.isPublic ? 1 : 0
      const publishedAt = isPublic === 1 ? now : null
      const inserted = await tx
        .insert(games)
        .values({
          authorUserId,
          title: input.title,
          developer: input.developer,
          genre: input.genre,
          playedDate: input.playedDate,
          rating: input.rating,
          content: input.content ?? '',
          oneLineReview: input.oneLineReview ?? null,
          rawgId: input.rawgId ?? null,
          coverUrl: input.coverUrl ?? null,
          externalSource: input.externalSource ?? null,
          isPublic,
          publishedAt,
          slug,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const game = inserted[0]
      await replaceGameTagsTx(tx, game.id, input.tags ?? [])
      const tagRows = await tx
        .select({ name: tags.name })
        .from(gameTags)
        .innerJoin(tags, eq(gameTags.tagId, tags.id))
        .where(eq(gameTags.gameId, game.id))
      return { ...game, tags: tagRows.map((r) => r.name) }
    }),
  )
}

export async function updateGame(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateGameInput,
): Promise<GameWithTags | null> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(games)
      .where(and(eq(games.id, id), eq(games.authorUserId, authorUserId)))
      .limit(1)
    if (existing.length === 0) return null
    const prev = existing[0]

    const now = Date.now()

    // isPublic transition 판정: `publishedAt`은 **최초 1회만** 설정(처음 공개되는 시점).
    // 이후 재공개에서도 보존 — 토글 spam으로 피드 상단을 점유하는 vanity attack 방지.
    let nextIsPublic: number | undefined
    let nextPublishedAt: number | null | undefined
    if (input.isPublic !== undefined) {
      nextIsPublic = input.isPublic ? 1 : 0
      if (nextIsPublic === 1 && prev.publishedAt === null) {
        nextPublishedAt = now
      }
      // else: nextPublishedAt 그대로 undefined → SET에서 제외돼 기존 값 보존
    }

    const updated = await tx
      .update(games)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.developer !== undefined && { developer: input.developer }),
        ...(input.genre !== undefined && { genre: input.genre }),
        ...(input.playedDate !== undefined && { playedDate: input.playedDate }),
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
        ...(input.rawgId !== undefined && { rawgId: input.rawgId }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
        ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
        ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
        updatedAt: now,
      })
      .where(and(eq(games.id, id), eq(games.authorUserId, authorUserId)))
      .returning()

    const game = updated[0]
    if (input.tags !== undefined) {
      await replaceGameTagsTx(tx, id, input.tags)
    }
    const tagRows = await tx
      .select({ name: tags.name })
      .from(gameTags)
      .innerJoin(tags, eq(gameTags.tagId, tags.id))
      .where(eq(gameTags.gameId, id))
    return { ...game, tags: tagRows.map((r) => r.name) }
  })
}

export async function deleteGame(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(games)
    .where(and(eq(games.id, id), eq(games.authorUserId, authorUserId)))
    .returning({ id: games.id })
  return result.length > 0
}

// cache(): generateMetadata와 페이지 본문이 같은 요청에서 각각 호출해도 DB 왕복 1회로 dedupe
export const getGameBySlug = cache(
  async (db: Db, authorUserId: number, slug: string): Promise<GameWithTags | null> => {
    const rows = await db
      .select()
      .from(games)
      .where(and(eq(games.slug, slug), eq(games.authorUserId, authorUserId)))
      .limit(1)
    if (rows.length === 0) return null
    const game = rows[0]
    const tagNames = await attachGameTags(db, game.id)
    return { ...game, tags: tagNames }
  },
)

export async function getGameById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<GameWithTags | null> {
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const game = rows[0]
  const tagNames = await attachGameTags(db, game.id)
  return { ...game, tags: tagNames }
}

export async function listGames(
  db: Db,
  authorUserId: number,
  filters: ListGameFilters,
): Promise<GameWithTags[]> {
  const conditions = [eq(games.authorUserId, authorUserId)]

  if (filters.genre) {
    conditions.push(eq(games.genre, filters.genre))
  }
  if (filters.year) {
    conditions.push(like(games.playedDate, `${filters.year}-%`))
  }

  if (filters.tag) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return []
    const tagId = tagRows[0].id

    let q = db
      .select({ game: games })
      .from(games)
      .innerJoin(gameTags, and(eq(gameTags.gameId, games.id), eq(gameTags.tagId, tagId)))
      .where(and(...conditions))
      .orderBy(
        ...(filters.sort === 'rating'
          ? [desc(games.rating), desc(games.playedDate), desc(games.id)]
          : [desc(games.playedDate), desc(games.id)]),
      )
      .$dynamic()
    if (filters.limit !== undefined) q = q.limit(filters.limit)
    if (filters.offset !== undefined) q = q.offset(filters.offset)
    const rows = await q

    const tagMap = await attachTagsToGamesBatch(
      db,
      rows.map((r) => r.game.id),
    )
    return rows.map((r) => ({ ...r.game, tags: tagMap.get(r.game.id) ?? [] }))
  }

  let q = db
    .select()
    .from(games)
    .where(and(...conditions))
    .orderBy(
      ...(filters.sort === 'rating'
        ? [desc(games.rating), desc(games.playedDate), desc(games.id)]
        : [desc(games.playedDate), desc(games.id)]),
    )
    .$dynamic()
  if (filters.limit !== undefined) q = q.limit(filters.limit)
  if (filters.offset !== undefined) q = q.offset(filters.offset)
  const rows = await q

  const tagMap = await attachTagsToGamesBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchGames(
  db: Db,
  authorUserId: number,
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<GameWithTags[]> {
  const pattern = `%${escapeLikePattern(q)}%`
  let query = db
    .select()
    .from(games)
    .where(
      and(
        eq(games.authorUserId, authorUserId),
        sql`(${games.title} LIKE ${pattern} ESCAPE '\\' OR ${games.developer} LIKE ${pattern} ESCAPE '\\' OR ${games.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${games.title} LIKE ${pattern} ESCAPE '\\' THEN 1
        WHEN ${games.developer} LIKE ${pattern} ESCAPE '\\' THEN 2
        ELSE 3
      END`,
      desc(games.playedDate),
    )
    .$dynamic()
  if (opts.limit !== undefined) query = query.limit(opts.limit)
  if (opts.offset !== undefined) query = query.offset(opts.offset)
  const rows = await query

  const tagMap = await attachTagsToGamesBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function countSearchGames(db: Db, authorUserId: number, q: string): Promise<number> {
  const pattern = `%${escapeLikePattern(q)}%`
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(games)
    .where(
      and(
        eq(games.authorUserId, authorUserId),
        sql`(${games.title} LIKE ${pattern} ESCAPE '\\' OR ${games.developer} LIKE ${pattern} ESCAPE '\\' OR ${games.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export async function listGameGenresWithCounts(
  db: Db,
  authorUserId: number,
): Promise<{ genre: string; count: number }[]> {
  const cnt = count()
  const rows = await db
    .select({
      genre: games.genre,
      count: cnt,
    })
    .from(games)
    .where(eq(games.authorUserId, authorUserId))
    .groupBy(games.genre)
    .orderBy(desc(cnt))
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}

// ─── public feed ───────────────────────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 두 함수는 authorUserId 필터가 없는 유일한
// read 경로. 다른 모든 list/get은 본인 스코프(authorUserId 매칭) 유지.

export async function listRecentPublicGames(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicGameCard[]> {
  let q = db
    .select({
      id: games.id,
      slug: games.slug,
      title: games.title,
      developer: games.developer,
      genre: games.genre,
      rating: games.rating,
      oneLineReview: games.oneLineReview,
      coverUrl: games.coverUrl,
      rawgId: games.rawgId,
      publishedAt: games.publishedAt,
      authorDisplayName: users.displayName,
    })
    .from(games)
    .innerJoin(users, eq(games.authorUserId, users.id))
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt)))
    .orderBy(desc(games.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  // publishedAt은 위 WHERE로 NOT NULL 보장 — 타입을 number로 narrow
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countPublicGames(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(games)
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt)))
  return Number(rows[0]?.n ?? 0)
}

// /works/game/[rawgId]에서 외부 lookup이 실패할 때(RAWG 오류, 삭제된 id 등)
// 표시할 최소 메타데이터. 같은 rawgId를 가진 공개 게임 중 가장 최근
// publishedAt 한 건의 사용자 입력값을 신뢰.
export async function getPublicGameFallbackByRawgId(
  db: Db,
  rawgId: number,
): Promise<{ title: string; developer: string; coverUrl: string | null } | null> {
  const rows = await db
    .select({
      title: games.title,
      developer: games.developer,
      coverUrl: games.coverUrl,
    })
    .from(games)
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt), eq(games.rawgId, rawgId)))
    .orderBy(desc(games.publishedAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * 사용자의 게임 총 개수 (페이지네이션용). genre/year/tag 필터를 적용한 count도 지원해
 * 필터 활성화 시 totalPages가 정확하게 계산되도록 한다.
 */
export async function countGames(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number } = {},
): Promise<number> {
  const conditions = [eq(games.authorUserId, authorUserId)]
  if (filters.genre) conditions.push(eq(games.genre, filters.genre))
  if (filters.year) conditions.push(like(games.playedDate, `${filters.year}-%`))

  if (filters.tag) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return 0
    const tagId = tagRows[0].id
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(games)
      .innerJoin(gameTags, and(eq(gameTags.gameId, games.id), eq(gameTags.tagId, tagId)))
      .where(and(...conditions))
    return Number(rows[0]?.n ?? 0)
  }

  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(games)
    .where(and(...conditions))
  return Number(rows[0]?.n ?? 0)
}

/**
 * 본인 games 중 주어진 rawgId들 각각 몇 번 기록했는지 반환.
 * 멀티테넌트 invariant: authorUserId로 필터.
 *
 * @returns Map<rawgId, count>. JSON 응답 직렬화 시 Object.fromEntries(map) 변환 필요.
 */
export async function countGamesByExternalIds(
  db: Db,
  authorUserId: number,
  rawgIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  // Empty array → skip query; inArray([]) generates invalid SQL on some drivers.
  if (rawgIds.length === 0) return counts
  const rows = await db
    .select({ rawgId: games.rawgId, n: sql<number>`COUNT(*)` })
    .from(games)
    .where(and(eq(games.authorUserId, authorUserId), inArray(games.rawgId, rawgIds)))
    .groupBy(games.rawgId)
  for (const r of rows) {
    if (r.rawgId != null) counts.set(r.rawgId, Number(r.n))
  }
  return counts
}

// ─── works (external-id aggregation) ─────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 4개 함수는 authorUserId 필터가 없는
// cross-user read 경로 — /works 작품별 별점·한줄평 묶음용.
// 한줄평 유무와 무관하게 published 항목 모두 포함 (별점 집계 왜곡 방지).
// 다른 모든 user-scoped 쿼리는 본인 스코프 유지.

export type GameSiteAggregate = { avg: number; cnt: number }

export async function getGameAggregatesByRawgIds(
  db: Db,
  rawgIds: number[],
): Promise<Map<number, GameSiteAggregate>> {
  const out = new Map<number, GameSiteAggregate>()
  if (rawgIds.length === 0) return out
  const rows = await db
    .select({
      rawgId: games.rawgId,
      avg: sql<number>`AVG(${games.rating})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(games)
    .where(
      and(eq(games.isPublic, 1), isNotNull(games.publishedAt), inArray(games.rawgId, rawgIds)),
    )
    .groupBy(games.rawgId)
  for (const r of rows) {
    if (r.rawgId != null) out.set(r.rawgId, { avg: Number(r.avg), cnt: Number(r.cnt) })
  }
  return out
}

export type GameReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

export async function listGameReviewsByRawgId(
  db: Db,
  rawgId: number,
  opts: { limit: number; offset?: number },
): Promise<GameReviewItem[]> {
  let q = db
    .select({
      id: games.id,
      slug: games.slug,
      oneLineReview: games.oneLineReview,
      rating: games.rating,
      publishedAt: games.publishedAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(games)
    .innerJoin(users, eq(games.authorUserId, users.id))
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt), eq(games.rawgId, rawgId)))
    .orderBy(desc(games.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  // publishedAt은 위 WHERE로 NOT NULL 보장 — 타입을 number로 narrow
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countGameReviewsByRawgId(db: Db, rawgId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(games)
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt), eq(games.rawgId, rawgId)))
  return Number(rows[0]?.n ?? 0)
}

export async function getGameRatingDistributionByRawgId(
  db: Db,
  rawgId: number,
): Promise<RatingDistribution> {
  const rows = await db
    .select({
      rating: games.rating,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(games)
    .where(and(eq(games.isPublic, 1), isNotNull(games.publishedAt), eq(games.rawgId, rawgId)))
    .groupBy(games.rating)
  return computeRatingDistribution(rows)
}
