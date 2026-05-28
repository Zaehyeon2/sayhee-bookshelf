import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { movies, movieTags, tags, users } from '../schema'
import { toSlug } from '@/lib/slug'
import type { CreateMovieInput, UpdateMovieInput } from '@/lib/validations'
import { escapeLikePattern, isMovieSlugUniqueViolation } from './shared'
import type { Db, MovieWithTags } from './shared'
import { attachMovieTags, attachTagsToMoviesBatch, replaceMovieTagsTx } from './tags'

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

export interface ListMovieFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export async function createMovie(
  db: Db,
  authorUserId: number,
  input: CreateMovieInput,
): Promise<MovieWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    try {
      // movie INSERT + tags 교체를 단일 트랜잭션으로 묶어 중간 실패 시 부분 상태가 남지 않게 함.
      const result = await db.transaction(async (tx) => {
        const isPublic = input.isPublic ? 1 : 0
        const publishedAt = isPublic === 1 ? now : null
        const inserted = await tx
          .insert(movies)
          .values({
            authorUserId,
            title: input.title,
            director: input.director,
            genre: input.genre,
            watchedDate: input.watchedDate,
            rating: input.rating,
            content: input.content ?? '',
            oneLineReview: input.oneLineReview ?? null,
            tmdbId: input.tmdbId ?? null,
            coverUrl: input.coverUrl ?? null,
            externalSource: input.externalSource ?? null,
            isPublic,
            publishedAt,
            slug: candidate,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        const movie = inserted[0]
        await replaceMovieTagsTx(tx, movie.id, input.tags ?? [])
        const tagRows = await tx
          .select({ name: tags.name })
          .from(movieTags)
          .innerJoin(tags, eq(movieTags.tagId, tags.id))
          .where(eq(movieTags.movieId, movie.id))
        return { ...movie, tags: tagRows.map((r) => r.name) }
      })
      return result
    } catch (e) {
      if (isMovieSlugUniqueViolation(e)) continue
      throw e
    }
  }
  throw new Error(`Could not generate unique slug after 100 attempts for title: ${input.title}`)
}

export async function updateMovie(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateMovieInput,
): Promise<MovieWithTags | null> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(movies)
      .where(and(eq(movies.id, id), eq(movies.authorUserId, authorUserId)))
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
      .update(movies)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.director !== undefined && { director: input.director }),
        ...(input.genre !== undefined && { genre: input.genre }),
        ...(input.watchedDate !== undefined && { watchedDate: input.watchedDate }),
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
        ...(input.tmdbId !== undefined && { tmdbId: input.tmdbId }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
        ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
        ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
        updatedAt: now,
      })
      .where(and(eq(movies.id, id), eq(movies.authorUserId, authorUserId)))
      .returning()

    const movie = updated[0]
    if (input.tags !== undefined) {
      await replaceMovieTagsTx(tx, id, input.tags)
    }
    const tagRows = await tx
      .select({ name: tags.name })
      .from(movieTags)
      .innerJoin(tags, eq(movieTags.tagId, tags.id))
      .where(eq(movieTags.movieId, id))
    return { ...movie, tags: tagRows.map((r) => r.name) }
  })
}

export async function deleteMovie(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(movies)
    .where(and(eq(movies.id, id), eq(movies.authorUserId, authorUserId)))
    .returning({ id: movies.id })
  return result.length > 0
}

export async function getMovieBySlug(
  db: Db,
  authorUserId: number,
  slug: string,
): Promise<MovieWithTags | null> {
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.slug, slug), eq(movies.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const movie = rows[0]
  const tagNames = await attachMovieTags(db, movie.id)
  return { ...movie, tags: tagNames }
}

export async function getMovieById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<MovieWithTags | null> {
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, id), eq(movies.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const movie = rows[0]
  const tagNames = await attachMovieTags(db, movie.id)
  return { ...movie, tags: tagNames }
}

export async function listMovies(
  db: Db,
  authorUserId: number,
  filters: ListMovieFilters,
): Promise<MovieWithTags[]> {
  const conditions = [eq(movies.authorUserId, authorUserId)]

  if (filters.genre) {
    conditions.push(eq(movies.genre, filters.genre))
  }
  if (filters.year) {
    conditions.push(like(movies.watchedDate, `${filters.year}-%`))
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
      .select({ movie: movies })
      .from(movies)
      .innerJoin(
        movieTags,
        sql`${movieTags.movieId} = ${movies.id} AND ${movieTags.tagId} = ${tagId}`,
      )
      .where(and(...conditions))
      .orderBy(
        ...(filters.sort === 'rating'
          ? [desc(movies.rating), desc(movies.watchedDate), desc(movies.id)]
          : [desc(movies.watchedDate), desc(movies.id)]),
      )
      .$dynamic()
    if (filters.limit !== undefined) q = q.limit(filters.limit)
    if (filters.offset !== undefined) q = q.offset(filters.offset)
    const rows = await q

    const tagMap = await attachTagsToMoviesBatch(
      db,
      rows.map((r) => r.movie.id),
    )
    return rows.map((r) => ({ ...r.movie, tags: tagMap.get(r.movie.id) ?? [] }))
  }

  let q = db
    .select()
    .from(movies)
    .where(and(...conditions))
    .orderBy(
      ...(filters.sort === 'rating'
        ? [desc(movies.rating), desc(movies.watchedDate), desc(movies.id)]
        : [desc(movies.watchedDate), desc(movies.id)]),
    )
    .$dynamic()
  if (filters.limit !== undefined) q = q.limit(filters.limit)
  if (filters.offset !== undefined) q = q.offset(filters.offset)
  const rows = await q

  const tagMap = await attachTagsToMoviesBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchMovies(
  db: Db,
  authorUserId: number,
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<MovieWithTags[]> {
  const pattern = `%${escapeLikePattern(q)}%`
  let query = db
    .select()
    .from(movies)
    .where(
      and(
        eq(movies.authorUserId, authorUserId),
        sql`(${movies.title} LIKE ${pattern} ESCAPE '\\' OR ${movies.director} LIKE ${pattern} ESCAPE '\\' OR ${movies.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${movies.title} LIKE ${pattern} ESCAPE '\\' THEN 1
        WHEN ${movies.director} LIKE ${pattern} ESCAPE '\\' THEN 2
        ELSE 3
      END`,
      desc(movies.watchedDate),
    )
    .$dynamic()
  if (opts.limit !== undefined) query = query.limit(opts.limit)
  if (opts.offset !== undefined) query = query.offset(opts.offset)
  const rows = await query

  const tagMap = await attachTagsToMoviesBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function countSearchMovies(db: Db, authorUserId: number, q: string): Promise<number> {
  const pattern = `%${escapeLikePattern(q)}%`
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(movies)
    .where(
      and(
        eq(movies.authorUserId, authorUserId),
        sql`(${movies.title} LIKE ${pattern} ESCAPE '\\' OR ${movies.director} LIKE ${pattern} ESCAPE '\\' OR ${movies.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export async function listMovieGenresWithCounts(
  db: Db,
  authorUserId: number,
): Promise<{ genre: string; count: number }[]> {
  const rows = await db
    .select({
      genre: movies.genre,
      count: sql<number>`COUNT(*)`,
    })
    .from(movies)
    .where(eq(movies.authorUserId, authorUserId))
    .groupBy(movies.genre)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}

// ─── public feed ───────────────────────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 두 함수는 authorUserId 필터가 없는 유일한
// read 경로. 다른 모든 list/get은 본인 스코프(authorUserId 매칭) 유지.

export async function listRecentPublicMovies(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicMovieCard[]> {
  let q = db
    .select({
      id: movies.id,
      slug: movies.slug,
      title: movies.title,
      director: movies.director,
      genre: movies.genre,
      rating: movies.rating,
      oneLineReview: movies.oneLineReview,
      publishedAt: movies.publishedAt,
      authorDisplayName: users.displayName,
    })
    .from(movies)
    .innerJoin(users, eq(movies.authorUserId, users.id))
    .where(and(eq(movies.isPublic, 1), sql`${movies.publishedAt} IS NOT NULL`))
    .orderBy(desc(movies.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  // publishedAt은 위 WHERE로 NOT NULL 보장 — 타입을 number로 narrow
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countPublicMovies(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(movies)
    .where(and(eq(movies.isPublic, 1), sql`${movies.publishedAt} IS NOT NULL`))
  return Number(rows[0]?.n ?? 0)
}

/**
 * 사용자의 영화 총 개수 (페이지네이션용). genre/year/tag 필터를 적용한 count도 지원해
 * 필터 활성화 시 totalPages가 정확하게 계산되도록 한다.
 */
export async function countMovies(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number } = {},
): Promise<number> {
  const conditions = [eq(movies.authorUserId, authorUserId)]
  if (filters.genre) conditions.push(eq(movies.genre, filters.genre))
  if (filters.year) conditions.push(like(movies.watchedDate, `${filters.year}-%`))

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
      .from(movies)
      .innerJoin(
        movieTags,
        sql`${movieTags.movieId} = ${movies.id} AND ${movieTags.tagId} = ${tagId}`,
      )
      .where(and(...conditions))
    return Number(rows[0]?.n ?? 0)
  }

  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(movies)
    .where(and(...conditions))
  return Number(rows[0]?.n ?? 0)
}

/**
 * 본인 movies 중 주어진 tmdbId들 각각 몇 번 기록했는지 반환.
 * 멀티테넌트 invariant: authorUserId로 필터.
 *
 * @returns Map<tmdbId, count>. JSON 응답 직렬화 시 Object.fromEntries(map) 변환 필요.
 */
export async function countMoviesByExternalIds(
  db: Db,
  authorUserId: number,
  tmdbIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  // Empty array → skip query; inArray([]) generates invalid SQL on some drivers.
  if (tmdbIds.length === 0) return counts
  const rows = await db
    .select({ tmdbId: movies.tmdbId, n: sql<number>`COUNT(*)` })
    .from(movies)
    .where(and(eq(movies.authorUserId, authorUserId), inArray(movies.tmdbId, tmdbIds)))
    .groupBy(movies.tmdbId)
  for (const r of rows) {
    if (r.tmdbId != null) counts.set(r.tmdbId, Number(r.n))
  }
  return counts
}
