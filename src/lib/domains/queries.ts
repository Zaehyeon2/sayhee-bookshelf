import { cache } from 'react'
import { and, count, desc, eq, getTableColumns, inArray, isNotNull, like, sql } from 'drizzle-orm'
import { tags, users } from '@/lib/db/schema'
import { toSlug } from '@/lib/slug'
import {
  computeRatingDistribution,
  escapeLikePattern,
  insertWithSlugRetry,
} from '@/lib/db/queries/shared'
import type { Db, RatingDistribution, Tx } from '@/lib/db/queries/shared'
import { getOrCreateTagsBatch } from '@/lib/db/queries/tags'
import { attachTagsBatchGeneric, attachTagsGeneric, replaceTagsTxGeneric } from './tags'
import type { MediaDomainConfig } from './config'

// ─── 정규화 입출력 타입 ──────────────────────────────────────────────────────

export interface MediaCreateInput<ExtId extends string | number> {
  title: string
  person: string
  genre: string
  date: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string | null
  isPublic: boolean
  externalId: ExtId | null
  coverUrl: string | null
  externalSource: string | null
}

export type MediaUpdateInput<ExtId extends string | number> = {
  [K in keyof MediaCreateInput<ExtId>]?: MediaCreateInput<ExtId>[K]
}

export interface MediaListFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export interface PublicMediaCard<ExtId extends string | number> {
  id: number
  slug: string
  title: string
  person: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  externalId: ExtId | null
  publishedAt: number
  authorDisplayName: string
}

export type MediaSiteAggregate = { avg: number; cnt: number }

export interface MediaReviewItem {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

interface MediaRowBase {
  id: number
  slug: string
}

/** $dynamic 쿼리에 limit/offset을 조건부 적용 — list/search/public list 5곳이 공유. */
function applyPaging<Q extends { limit(n: number): Q; offset(n: number): Q }>(
  q: Q,
  opts: { limit?: number; offset?: number },
): Q {
  if (opts.limit !== undefined) q = q.limit(opts.limit)
  // SQLite는 OFFSET 단독을 문법 에러로 거부 — offset만 온 경우 LIMIT -1(무제한)을 끼워 방어
  else if (opts.offset !== undefined) q = q.limit(-1)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  return q
}

/**
 * 미디어 도메인 쿼리 팩토리. Row = 해당 테이블의 $inferSelect (도메인 컬럼명 유지).
 * 모든 user-scoped 함수는 authorUserId 필터 필수(멀티테넌트 invariant).
 * 예외(public feed·works 집계)는 isPublic=1 AND publishedAt IS NOT NULL을 이 팩토리가 강제.
 */
export function createMediaQueries<Row extends MediaRowBase, ExtId extends string | number>(
  cfg: MediaDomainConfig,
) {
  const c = cfg.cols
  const tagsRef = { junction: cfg.junction, fk: cfg.junctionFk, tagId: cfg.junction.tagId }
  const buildJunctionRows = (entityId: number, tagIds: number[]) =>
    tagIds.map((tagId) => ({ [cfg.junctionFkField]: entityId, tagId }))

  /** INSERT/UPDATE용: 정규화 입력 → 도메인 컬럼명 객체. undefined 키는 제외(PATCH 의미론). */
  function toDomainValues(input: MediaUpdateInput<ExtId>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (input.title !== undefined) out.title = input.title
    if (input.person !== undefined) out[cfg.fields.person] = input.person
    if (input.genre !== undefined) out.genre = input.genre
    if (input.date !== undefined) out[cfg.fields.date] = input.date
    if (input.rating !== undefined) out.rating = input.rating
    if (input.content !== undefined) out.content = input.content
    if (input.oneLineReview !== undefined) out.oneLineReview = input.oneLineReview
    if (input.externalId !== undefined) out[cfg.fields.externalId] = input.externalId
    if (input.coverUrl !== undefined) out.coverUrl = input.coverUrl
    if (input.externalSource !== undefined) out.externalSource = input.externalSource
    return out
  }

  async function tagNamesOf(tx: Tx | Db, id: number): Promise<string[]> {
    return attachTagsGeneric(tx as Db, tagsRef, id)
  }

  async function create(
    db: Db,
    authorUserId: number,
    input: MediaCreateInput<ExtId>,
  ): Promise<Row & { tags: string[] }> {
    const base = toSlug(input.title)
    const now = Date.now()

    // INSERT + tags 교체를 단일 트랜잭션으로 묶어 중간 실패 시 부분 상태가 남지 않게 함.
    return insertWithSlugRetry(base, cfg.isSlugViolation, (slug) =>
      db.transaction(async (tx) => {
        const isPublic = input.isPublic ? 1 : 0
        const publishedAt = isPublic === 1 ? now : null
        const inserted = await tx
          // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — 도메인 wrapper가 타입 보증
          .insert(cfg.table as any)
          .values({
            authorUserId,
            ...toDomainValues(input),
            isPublic,
            publishedAt,
            slug,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        const row = (inserted as unknown[])[0] as Row
        await replaceTagsTxGeneric(tx, tagsRef, row.id, input.tags ?? [], {
          getOrCreate: getOrCreateTagsBatch,
          buildRows: buildJunctionRows,
        })
        return { ...row, tags: await tagNamesOf(tx, row.id) }
      }),
    )
  }

  async function update(
    db: Db,
    authorUserId: number,
    id: number,
    input: MediaUpdateInput<ExtId>,
  ): Promise<(Row & { tags: string[] }) | null> {
    return db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(cfg.table)
        .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
        .limit(1)
      if (existing.length === 0) return null
      const prev = existing[0] as unknown as Row & { publishedAt: number | null }

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
        // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — 도메인 wrapper가 타입 보증
        .update(cfg.table as any)
        .set({
          ...toDomainValues(input),
          ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
          ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
          updatedAt: now,
        })
        .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
        .returning()

      const row = (updated as unknown[])[0] as Row
      if (input.tags !== undefined) {
        await replaceTagsTxGeneric(tx, tagsRef, id, input.tags, {
          getOrCreate: getOrCreateTagsBatch,
          buildRows: buildJunctionRows,
        })
      }
      return { ...row, tags: await tagNamesOf(tx, id) }
    })
  }

  async function remove(db: Db, authorUserId: number, id: number): Promise<boolean> {
    const result = await db
      // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — 도메인 wrapper가 타입 보증
      .delete(cfg.table as any)
      .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
      .returning({ id: c.id })
    return result.length > 0
  }

  // cache(): generateMetadata와 페이지 본문이 같은 요청에서 각각 호출해도 DB 왕복 1회로 dedupe.
  // 팩토리 인스턴스는 모듈 로드 시 1회 생성되므로 cache 동일성 유지.
  const getBySlug = cache(
    async (
      db: Db,
      authorUserId: number,
      slug: string,
    ): Promise<(Row & { tags: string[] }) | null> => {
      const rows = await db
        .select()
        .from(cfg.table)
        .where(and(eq(c.slug, slug), eq(c.authorUserId, authorUserId)))
        .limit(1)
      if (rows.length === 0) return null
      const row = rows[0] as unknown as Row
      return { ...row, tags: await tagNamesOf(db, row.id) }
    },
  )

  async function getById(
    db: Db,
    authorUserId: number,
    id: number,
  ): Promise<(Row & { tags: string[] }) | null> {
    const rows = await db
      .select()
      .from(cfg.table)
      .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
      .limit(1)
    if (rows.length === 0) return null
    const row = rows[0] as unknown as Row
    return { ...row, tags: await tagNamesOf(db, row.id) }
  }

  async function resolveTagId(db: Db, tagName: string): Promise<number | null> {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, tagName))
      .limit(1)
    return tagRows.length === 0 ? null : tagRows[0].id
  }

  function baseConditions(authorUserId: number, filters: { genre?: string; year?: number }) {
    const conditions = [eq(c.authorUserId, authorUserId)]
    if (filters.genre) conditions.push(eq(c.genre, filters.genre))
    if (filters.year) conditions.push(like(c.date, `${filters.year}-%`))
    return conditions
  }

  const orderForSort = (sort?: 'date' | 'rating') =>
    sort === 'rating' ? [desc(c.rating), desc(c.date), desc(c.id)] : [desc(c.date), desc(c.id)]

  // 목록용 selective select — content(본문, row당 수 KB)는 목록 카드가 사용하지 않는데
  // Turso(원격 DB) 전송량 대부분을 차지. search()는 본문 발췌(excerpt)에 content가 필요해
  // full row 유지. 손-열거 대신 테이블에서 파생해 새 컬럼이 자동 포함되게 한다(drift 방지).
  // 반환 타입은 Row를 유지하지만 content 필드는 런타임에 없음 — contentOf 등 content 접근은
  // search 경로에서만 할 것 (MediaListResults가 그렇게 사용).
  const { content: _content, ...listColumns } = getTableColumns(cfg.table)

  async function list(
    db: Db,
    authorUserId: number,
    filters: MediaListFilters & { tagId?: number | null },
  ): Promise<(Row & { tags: string[] })[]> {
    const conditions = baseConditions(authorUserId, filters)

    if (filters.tag) {
      // tagId 선조회 값이 주입되면 재조회 생략 (list/count 중복 lookup 제거 — 백로그 8)
      const tagId =
        filters.tagId !== undefined ? filters.tagId : await resolveTagId(db, filters.tag)
      if (tagId === null) return []

      const q = applyPaging(
        db
          .select(listColumns)
          .from(cfg.table)
          .innerJoin(cfg.junction, and(eq(cfg.junctionFk, c.id), eq(tagsRef.tagId, tagId)))
          .where(and(...conditions))
          .orderBy(...orderForSort(filters.sort))
          .$dynamic(),
        filters,
      )
      const rows = (await q) as unknown as Row[]

      const tagMap = await attachTagsBatchGeneric(
        db,
        tagsRef,
        rows.map((r) => r.id),
      )
      return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
    }

    const q = applyPaging(
      db
        .select(listColumns)
        .from(cfg.table)
        .where(and(...conditions))
        .orderBy(...orderForSort(filters.sort))
        .$dynamic(),
      filters,
    )
    const rows = (await q) as unknown as Row[]

    const tagMap = await attachTagsBatchGeneric(
      db,
      tagsRef,
      rows.map((r) => r.id),
    )
    return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
  }

  // LIKE 검색 — drizzle like()는 ESCAPE 미지원이라 raw sql 유지 (invariant 4·7).
  // 검색 WHERE 절을 search/countSearch가 공유 (백로그 10).
  const searchWhere = (pattern: string) =>
    sql`(${c.title} LIKE ${pattern} ESCAPE '\\' OR ${c.person} LIKE ${pattern} ESCAPE '\\' OR ${c.content} LIKE ${pattern} ESCAPE '\\')`

  async function search(
    db: Db,
    authorUserId: number,
    q: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<(Row & { tags: string[] })[]> {
    const pattern = `%${escapeLikePattern(q)}%`
    const query = applyPaging(
      db
        .select()
        .from(cfg.table)
        .where(and(eq(c.authorUserId, authorUserId), searchWhere(pattern)))
        .orderBy(
          sql`CASE
        WHEN ${c.title} LIKE ${pattern} ESCAPE '\\' THEN 1
        WHEN ${c.person} LIKE ${pattern} ESCAPE '\\' THEN 2
        ELSE 3
      END`,
          desc(c.date),
        )
        .$dynamic(),
      opts,
    )
    const rows = (await query) as unknown as Row[]

    const tagMap = await attachTagsBatchGeneric(
      db,
      tagsRef,
      rows.map((r) => r.id),
    )
    return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
  }

  async function countSearch(db: Db, authorUserId: number, q: string): Promise<number> {
    const pattern = `%${escapeLikePattern(q)}%`
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(cfg.table)
      .where(and(eq(c.authorUserId, authorUserId), searchWhere(pattern)))
    return Number(rows[0]?.n ?? 0)
  }

  async function listGenresWithCounts(
    db: Db,
    authorUserId: number,
  ): Promise<{ genre: string; count: number }[]> {
    const cnt = count()
    const rows = await db
      .select({ genre: c.genre, count: cnt })
      .from(cfg.table)
      .where(eq(c.authorUserId, authorUserId))
      .groupBy(c.genre)
      .orderBy(desc(cnt))
    return rows.map((r) => ({ genre: String(r.genre), count: Number(r.count) }))
  }

  async function countAll(
    db: Db,
    authorUserId: number,
    filters: { genre?: string; tag?: string; year?: number; tagId?: number | null } = {},
  ): Promise<number> {
    const conditions = baseConditions(authorUserId, filters)

    if (filters.tag) {
      const tagId =
        filters.tagId !== undefined ? filters.tagId : await resolveTagId(db, filters.tag)
      if (tagId === null) return 0
      const rows = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(cfg.table)
        .innerJoin(cfg.junction, and(eq(cfg.junctionFk, c.id), eq(tagsRef.tagId, tagId)))
        .where(and(...conditions))
      return Number(rows[0]?.n ?? 0)
    }

    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(cfg.table)
      .where(and(...conditions))
    return Number(rows[0]?.n ?? 0)
  }

  // ─── public feed ───────────────────────────────────────────────────────────
  // MULTITENANT INVARIANT EXCEPTION: 아래 함수들은 authorUserId 필터가 없는 유일한
  // read 경로. 반드시 isPublic=1 AND publishedAt IS NOT NULL 조건 유지.
  // 다른 모든 list/get(user-scoped 쿼리)은 본인 스코프(authorUserId 매칭) 유지.

  const publicWhere = () => and(eq(c.isPublic, 1), isNotNull(c.publishedAt))

  async function listRecentPublic(
    db: Db,
    opts: { limit: number; offset?: number },
  ): Promise<PublicMediaCard<ExtId>[]> {
    const q = applyPaging(
      db
        .select({
          id: c.id,
          slug: c.slug,
          title: c.title,
          person: c.person,
          genre: c.genre,
          rating: c.rating,
          oneLineReview: c.oneLineReview,
          coverUrl: c.coverUrl,
          externalId: c.externalId,
          publishedAt: c.publishedAt,
          authorDisplayName: users.displayName,
        })
        .from(cfg.table)
        .innerJoin(users, eq(c.authorUserId, users.id))
        .where(publicWhere())
        .orderBy(desc(c.publishedAt))
        .$dynamic(),
      opts,
    )
    const rows = await q
    // publishedAt은 위 WHERE로 NOT NULL 보장 — number로 narrow
    return rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt as number,
    })) as PublicMediaCard<ExtId>[]
  }

  async function countPublic(db: Db): Promise<number> {
    const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(cfg.table).where(publicWhere())
    return Number(rows[0]?.n ?? 0)
  }

  async function getPublicFallbackByExternalId(
    db: Db,
    externalId: ExtId,
  ): Promise<{ title: string; person: string; coverUrl: string | null } | null> {
    const rows = await db
      .select({ title: c.title, person: c.person, coverUrl: c.coverUrl })
      .from(cfg.table)
      .where(and(publicWhere(), eq(c.externalId, externalId)))
      .orderBy(desc(c.publishedAt))
      .limit(1)
    return (
      (rows[0] as { title: string; person: string; coverUrl: string | null } | undefined) ?? null
    )
  }

  async function countByExternalIds(
    db: Db,
    authorUserId: number,
    externalIds: ExtId[],
  ): Promise<Map<ExtId, number>> {
    const counts = new Map<ExtId, number>()
    // Empty array → skip query; inArray([]) generates invalid SQL on some drivers.
    if (externalIds.length === 0) return counts
    const rows = await db
      .select({ externalId: c.externalId, n: sql<number>`COUNT(*)` })
      .from(cfg.table)
      .where(and(eq(c.authorUserId, authorUserId), inArray(c.externalId, externalIds)))
      .groupBy(c.externalId)
    for (const r of rows) {
      if (r.externalId != null) counts.set(r.externalId as ExtId, Number(r.n))
    }
    return counts
  }

  // ─── works (external-id aggregation) ──────────────────────────────────────
  // MULTITENANT INVARIANT EXCEPTION: cross-user read — /works 작품별 별점·한줄평 묶음용.
  // 한줄평 유무와 무관하게 published 항목 모두 포함 (별점 집계 왜곡 방지).
  // 다른 모든 list/get(user-scoped 쿼리)은 본인 스코프(authorUserId 매칭) 유지.

  async function getAggregatesByExternalIds(
    db: Db,
    externalIds: ExtId[],
  ): Promise<Map<ExtId, MediaSiteAggregate>> {
    const out = new Map<ExtId, MediaSiteAggregate>()
    if (externalIds.length === 0) return out
    const rows = await db
      .select({
        externalId: c.externalId,
        avg: sql<number>`AVG(${c.rating})`,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(cfg.table)
      .where(and(publicWhere(), inArray(c.externalId, externalIds)))
      .groupBy(c.externalId)
    for (const r of rows) {
      if (r.externalId != null) {
        out.set(r.externalId as ExtId, { avg: Number(r.avg), cnt: Number(r.cnt) })
      }
    }
    return out
  }

  async function listReviewsByExternalId(
    db: Db,
    externalId: ExtId,
    opts: { limit: number; offset?: number },
  ): Promise<MediaReviewItem[]> {
    const q = applyPaging(
      db
        .select({
          id: c.id,
          slug: c.slug,
          oneLineReview: c.oneLineReview,
          rating: c.rating,
          publishedAt: c.publishedAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
        })
        .from(cfg.table)
        .innerJoin(users, eq(c.authorUserId, users.id))
        .where(and(publicWhere(), eq(c.externalId, externalId)))
        .orderBy(desc(c.publishedAt))
        .$dynamic(),
      opts,
    )
    const rows = await q
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number })) as MediaReviewItem[]
  }

  async function countReviewsByExternalId(db: Db, externalId: ExtId): Promise<number> {
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(cfg.table)
      .where(and(publicWhere(), eq(c.externalId, externalId)))
    return Number(rows[0]?.n ?? 0)
  }

  async function getRatingDistributionByExternalId(
    db: Db,
    externalId: ExtId,
  ): Promise<RatingDistribution> {
    const rows = await db
      .select({ rating: c.rating, cnt: sql<number>`COUNT(*)` })
      .from(cfg.table)
      .where(and(publicWhere(), eq(c.externalId, externalId)))
      .groupBy(c.rating)
    return computeRatingDistribution(rows)
  }

  return {
    create,
    update,
    remove,
    getBySlug,
    getById,
    list,
    search,
    countSearch,
    listGenresWithCounts,
    listRecentPublic,
    countPublic,
    getPublicFallbackByExternalId,
    countAll,
    countByExternalIds,
    getAggregatesByExternalIds,
    listReviewsByExternalId,
    countReviewsByExternalId,
    getRatingDistributionByExternalId,
    resolveTagId,
    /** 단건 태그 이름 조회 — requireOwn이 이미 row를 가진 GET 핸들러용 (getById 재조회 회피) */
    tagsOf: tagNamesOf,
  }
}
