# 미디어 도메인 제네릭 추출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** books/movies/games 3중 복제(~1,500줄/도메인)를 도메인 설정 객체 + 제네릭 팩토리로 추출하되, 기존 export 이름·URL·API shape·캐시 태그를 전부 보존해 동작 변화 0을 보장한다.

**Architecture:** `src/lib/domains/`에 config + 팩토리(queries/tags/schemas/api)를 신설하고, 기존 파일들(`queries/books.ts` 등)은 팩토리 인스턴스를 기존 이름으로 재export하는 얇은 wrapper로 교체. UI는 MediaForm/MediaCard/공유 페이지 컴포넌트로 통합하고 라우트 파일은 config를 넘기는 셸로 축소.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (libSQL), Zod, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-06-12-media-domain-generics-design.md`

---

## 전제 지식 (모든 태스크 공통)

- **멀티테넌트 invariant**: 모든 user-scoped 쿼리는 `authorUserId` 필터 필수. 예외는 public feed/works 집계 — 반드시 `isPublic = 1 AND publishedAt IS NOT NULL`.
- **LIKE는 `escapeLikePattern` + `ESCAPE '\'`** (drizzle `like()`는 ESCAPE 미지원이라 raw sql 유지 — CLAUDE.md invariant 4·7).
- **Drizzle 동적 테이블 타입 추론 붕괴**: 팩토리는 config의 **구체 컬럼 ref**(`cfg.cols.*`)만 사용. select 결과는 제네릭 `Row`로 캐스팅. `as` 캐스트는 팩토리 내부 한 곳씩만, `// biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — 도메인 wrapper가 타입 보증` 사유 필수.
- **캐시 태그 문자열 불변**: `public-books-feed`/`public-movies-feed`/`public-games-feed`/`works-book-detail`/`works-movie-detail`/`works-game-detail`. 이 문자열이 바뀌면 stale 캐시 노출.
- **`updateX`의 publishedAt은 최초 1회만 설정** (재공개 시 보존 — 피드 상단 점유 vanity attack 방지). 이 주석과 로직을 팩토리로 그대로 이관.
- **테스트가 회귀 가드**: 기존 테스트 파일은 **수정 금지**. 테스트를 고쳐야 통과한다면 동작이 바뀐 것 — 원인 규명 우선.
- 커밋 메시지는 한국어 Conventional Commits (예: `refactor(domains): ...`).
- lint는 변경 파일만: `pnpm exec biome check <files>` (main에 기존 에러 18건 있어 전체 검사는 실패함).
- **외부 ID 타입 차이**: books=`string`(isbn), movies/games=`number`(tmdbId/rawgId). 팩토리는 `ExtId extends string | number` 제네릭.

### 이번 계획에서 건드리지 않는 것

- `src/lib/auth-helpers.ts` — 이미 `makeOwnershipHelpers` 팩토리로 추출돼 있음(스펙 작성 후 확인). 변경 없음.
- `*/by-external` 라우트 3개 — 도메인별 ID 파싱이 다름(ISBN 문자열 vs 정수 canonical check). CLAUDE.md가 이미 "커스텀 파라미터 shape" 예외로 명문화. 현행 유지.
- `writings` 도메인 — 미디어 팩토리 비대상. 단 Task 2의 제네릭 tags 헬퍼는 writings junction도 수용.
- `public-feed-cache.ts`/`works-detail-cache.ts` — 'use cache' 함수는 directive 특성상 정적 함수 유지가 안전. 내부에서 호출하는 쿼리만 wrapper 경유로 바뀜(파일 무수정).
- 통계 쿼리(`getGameDashboard` 등, queries/stats.ts) — 스칼라 서브쿼리 raw sql, 도메인별 차이가 SQL 문자열 안에 있어 추출 이득 낮음. 현행 유지.

---

### Task 0: 브랜치 + 베이스라인

**Files:** 없음 (git만)

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b refactor/media-domain-generics
```

- [ ] **Step 2: 베이스라인 테스트 — 전부 통과 확인**

Run: `pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 전체 PASS (실패가 있다면 main이 깨진 것 — 사용자에게 보고하고 중단)

- [ ] **Step 3: tsc 베이스라인**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: 에러 0

---

### Task 1: 도메인 config + DOMAIN_TYPES

**Files:**
- Create: `src/lib/domains/config.ts`
- Test: `tests/unit/domains-config.test.ts`

- [ ] **Step 1: config 작성**

```ts
// src/lib/domains/config.ts
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { books, bookTags, games, gameTags, movies, movieTags } from '@/lib/db/schema'
import { BOOK_GENRES, GAME_GENRES, MOVIE_GENRES } from '@/lib/genres'
import {
  isGameSlugUniqueViolation,
  isMovieSlugUniqueViolation,
  isSlugUniqueViolation,
} from '@/lib/db/queries/shared'

// 도메인 타입 단일 소스 — FeedQuerySchema·WorksSearchQuerySchema가 이 배열을 참조 (백로그 2번)
export const DOMAIN_TYPES = ['book', 'movie', 'game'] as const
export type DomainType = (typeof DOMAIN_TYPES)[number]

export type MediaTable = typeof books | typeof movies | typeof games
export type MediaJunction = typeof bookTags | typeof movieTags | typeof gameTags

/**
 * 미디어 도메인(책/영화/게임) 공통 구조의 단일 정의.
 * - cols: drizzle 조건절·정렬에 쓰는 구체 컬럼 ref — 동적 테이블 제네릭의 타입 붕괴 우회.
 * - fields: INSERT/UPDATE 객체 구성에 쓰는 컬럼 프로퍼티 이름 문자열.
 * - person/date/externalId는 도메인별 이름(author/director/developer 등)의 정규화 축.
 */
export interface MediaDomainConfig {
  key: 'books' | 'movies' | 'games'
  type: DomainType
  table: MediaTable
  junction: MediaJunction
  /** junction에서 본문 row FK (bookTags.bookId 등) */
  junctionFk: AnySQLiteColumn
  cols: {
    id: AnySQLiteColumn
    authorUserId: AnySQLiteColumn
    slug: AnySQLiteColumn
    title: AnySQLiteColumn
    person: AnySQLiteColumn
    genre: AnySQLiteColumn
    date: AnySQLiteColumn
    rating: AnySQLiteColumn
    content: AnySQLiteColumn
    oneLineReview: AnySQLiteColumn
    isPublic: AnySQLiteColumn
    publishedAt: AnySQLiteColumn
    coverUrl: AnySQLiteColumn
    externalId: AnySQLiteColumn
  }
  fields: {
    person: 'author' | 'director' | 'developer'
    date: 'readDate' | 'watchedDate' | 'playedDate'
    externalId: 'isbn' | 'tmdbId' | 'rawgId'
  }
  genres: readonly string[]
  isSlugViolation: (e: unknown) => boolean
}

export const BOOKS_DOMAIN: MediaDomainConfig = {
  key: 'books',
  type: 'book',
  table: books,
  junction: bookTags,
  junctionFk: bookTags.bookId,
  cols: {
    id: books.id,
    authorUserId: books.authorUserId,
    slug: books.slug,
    title: books.title,
    person: books.author,
    genre: books.genre,
    date: books.readDate,
    rating: books.rating,
    content: books.content,
    oneLineReview: books.oneLineReview,
    isPublic: books.isPublic,
    publishedAt: books.publishedAt,
    coverUrl: books.coverUrl,
    externalId: books.isbn,
  },
  fields: { person: 'author', date: 'readDate', externalId: 'isbn' },
  genres: BOOK_GENRES,
  isSlugViolation: isSlugUniqueViolation,
}

export const MOVIES_DOMAIN: MediaDomainConfig = {
  key: 'movies',
  type: 'movie',
  table: movies,
  junction: movieTags,
  junctionFk: movieTags.movieId,
  cols: {
    id: movies.id,
    authorUserId: movies.authorUserId,
    slug: movies.slug,
    title: movies.title,
    person: movies.director,
    genre: movies.genre,
    date: movies.watchedDate,
    rating: movies.rating,
    content: movies.content,
    oneLineReview: movies.oneLineReview,
    isPublic: movies.isPublic,
    publishedAt: movies.publishedAt,
    coverUrl: movies.coverUrl,
    externalId: movies.tmdbId,
  },
  fields: { person: 'director', date: 'watchedDate', externalId: 'tmdbId' },
  genres: MOVIE_GENRES,
  isSlugViolation: isMovieSlugUniqueViolation,
}

export const GAMES_DOMAIN: MediaDomainConfig = {
  key: 'games',
  type: 'game',
  table: games,
  junction: gameTags,
  junctionFk: gameTags.gameId,
  cols: {
    id: games.id,
    authorUserId: games.authorUserId,
    slug: games.slug,
    title: games.title,
    person: games.developer,
    genre: games.genre,
    date: games.playedDate,
    rating: games.rating,
    content: games.content,
    oneLineReview: games.oneLineReview,
    isPublic: games.isPublic,
    publishedAt: games.publishedAt,
    coverUrl: games.coverUrl,
    externalId: games.rawgId,
  },
  fields: { person: 'developer', date: 'playedDate', externalId: 'rawgId' },
  genres: GAME_GENRES,
  isSlugViolation: isGameSlugUniqueViolation,
}
```

`schema.ts`의 junction FK 프로퍼티 이름이 `bookTags.bookId`/`movieTags.movieId`/`gameTags.gameId`가 맞는지 `src/lib/db/schema.ts`에서 확인하고 다르면 맞춰 수정.

- [ ] **Step 2: config 정합성 단위 테스트 작성**

```ts
// tests/unit/domains-config.test.ts
import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { BOOKS_DOMAIN, GAMES_DOMAIN, MOVIES_DOMAIN, DOMAIN_TYPES } from '@/lib/domains/config'

const DOMAINS = [BOOKS_DOMAIN, MOVIES_DOMAIN, GAMES_DOMAIN]

describe('media domain config', () => {
  it('DOMAIN_TYPES와 도메인 type이 1:1', () => {
    expect(DOMAINS.map((d) => d.type).sort()).toEqual([...DOMAIN_TYPES].sort())
  })

  it('cols ref가 해당 테이블의 실제 컬럼을 가리킴', () => {
    for (const d of DOMAINS) {
      const tableCols = Object.values(getTableColumns(d.table))
      for (const [name, col] of Object.entries(d.cols)) {
        expect(tableCols, `${d.key}.cols.${name}`).toContain(col)
      }
    }
  })

  it('fields 이름이 테이블 컬럼 프로퍼티로 존재', () => {
    for (const d of DOMAINS) {
      const colNames = Object.keys(getTableColumns(d.table))
      expect(colNames).toContain(d.fields.person)
      expect(colNames).toContain(d.fields.date)
      expect(colNames).toContain(d.fields.externalId)
    }
  })

  it('cols.person/date/externalId가 fields 이름의 컬럼과 동일 ref', () => {
    for (const d of DOMAINS) {
      const tableCols = getTableColumns(d.table)
      expect(d.cols.person).toBe(tableCols[d.fields.person])
      expect(d.cols.date).toBe(tableCols[d.fields.date])
      expect(d.cols.externalId).toBe(tableCols[d.fields.externalId])
    }
  })
})
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm test tests/unit/domains-config.test.ts --reporter=dot 2>&1 | tail -5`
Expected: PASS (4 tests)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/domains/config.ts tests/unit/domains-config.test.ts
git commit -m "refactor(domains): 미디어 도메인 설정 객체 + DOMAIN_TYPES 단일 소스 신설"
```

---

### Task 2: tags 제네릭 추출

**Files:**
- Create: `src/lib/domains/tags.ts`
- Modify: `src/lib/db/queries/tags.ts` (도메인별 함수를 wrapper로 교체)

`getOrCreateTagsBatch`/`suggestTags`/`listTagsFor*`는 그대로 두고, 도메인별 attach/attachBatch/replaceTx 12개(writings 포함 4도메인 × 3)를 제네릭 3개 + wrapper 12개로 교체.

- [ ] **Step 1: 제네릭 tags 모듈 작성**

```ts
// src/lib/domains/tags.ts
import { eq, inArray } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { tags } from '@/lib/db/schema'
import type { Db, Tx } from '@/lib/db/queries/shared'

// writings도 사용하므로 MediaJunction이 아닌 (junction, fk) 쌍으로 받는다.
interface TagJunctionRef {
  junction: Parameters<Db['delete']>[0]
  fk: AnySQLiteColumn
  tagId: AnySQLiteColumn
}

export async function attachTagsGeneric(db: Db, ref: TagJunctionRef, entityId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(ref.junction)
    .innerJoin(tags, eq(ref.tagId, tags.id))
    .where(eq(ref.fk, entityId))
  return rows.map((r) => r.name)
}

export async function attachTagsBatchGeneric(
  db: Db,
  ref: TagJunctionRef,
  entityIds: number[],
): Promise<Map<number, string[]>> {
  if (entityIds.length === 0) return new Map()
  const rows = await db
    .select({ entityId: ref.fk, name: tags.name })
    .from(ref.junction)
    .innerJoin(tags, eq(ref.tagId, tags.id))
    .where(inArray(ref.fk, entityIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const id = r.entityId as number
    const existing = map.get(id) ?? []
    existing.push(r.name)
    map.set(id, existing)
  }
  return map
}

// junction INSERT는 컬럼 키(bookId/movieId/...)가 도메인별로 달라 제네릭 안에서
// 타입 안전하게 못 만든다 — values 빌더(buildRows)를 호출 측에서 주입.
export async function replaceTagsTxGeneric(
  tx: Tx,
  ref: TagJunctionRef,
  entityId: number,
  tagNames: string[],
  deps: {
    getOrCreate: (tx: Tx, names: string[]) => Promise<number[]>
    buildRows: (entityId: number, tagIds: number[]) => Record<string, number>[]
  },
): Promise<void> {
  await tx.delete(ref.junction).where(eq(ref.fk, entityId))
  if (tagNames.length === 0) return
  const tagIds = await deps.getOrCreate(tx, tagNames)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 insert — buildRows가 키 정합성 보증
  await tx.insert(ref.junction as any).values(deps.buildRows(entityId, tagIds))
}
```

- [ ] **Step 2: `queries/tags.ts`의 도메인별 12함수를 wrapper로 교체**

`getOrCreateTagsBatch`는 export로 승격(현재 비공개 — 제네릭에 주입해야 함). 기존 함수 시그니처·이름 전부 유지. books 예시 (writings/movies/games 동일 패턴으로 4벌 모두 작성):

```ts
import { attachTagsBatchGeneric, attachTagsGeneric, replaceTagsTxGeneric } from '@/lib/domains/tags'

const BOOK_TAGS_REF = { junction: bookTags, fk: bookTags.bookId, tagId: bookTags.tagId }

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
```

나머지 3도메인 ref/이름 매핑: `WRITING_TAGS_REF`(writingTags.writingId, 함수 attachWritingTags/attachWritingTagsBatch/replaceWritingTagsTx), `MOVIE_TAGS_REF`(movieTags.movieId, attachMovieTags/attachTagsToMoviesBatch/replaceMovieTagsTx), `GAME_TAGS_REF`(gameTags.gameId, attachGameTags/attachTagsToGamesBatch/replaceGameTagsTx). `suggestTags`/`listTagsFor*` 4개는 무변경.

- [ ] **Step 3: 전체 테스트**

Run: `pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 전체 PASS (기존 테스트 무수정)

- [ ] **Step 4: tsc + lint(변경 파일)**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5 && pnpm exec biome check src/lib/domains/tags.ts src/lib/db/queries/tags.ts 2>&1 | tail -3`
Expected: 에러 0

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domains/tags.ts src/lib/db/queries/tags.ts
git commit -m "refactor(tags): 도메인별 attach/replace 12함수를 제네릭 3함수 + wrapper로 추출"
```

---

### Task 3: 쿼리 팩토리 + books wrapper

가장 위험한 태스크. games.ts(531줄)가 정본 — 18개 함수를 `createMediaQueries(cfg)`로 제네릭화하고 books.ts부터 wrapper로 교체.

**Files:**
- Create: `src/lib/domains/queries.ts`
- Modify: `src/lib/db/queries/books.ts` (전체를 wrapper로 교체)

- [ ] **Step 1: 팩토리 작성**

정규화 축: `person`(author/director/developer), `date`(readDate/watchedDate/playedDate), `externalId`(isbn/tmdbId/rawgId). 입력은 wrapper가 정규화해서 전달, 출력 Row는 도메인 원형 그대로(컬럼명 비변환) — wrapper가 `Row` 제네릭으로 타입 보증.

```ts
// src/lib/domains/queries.ts
import { cache } from 'react'
import { and, count, desc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm'
import { tags, users } from '@/lib/db/schema'
import { toSlug } from '@/lib/slug'
import {
  computeRatingDistribution,
  escapeLikePattern,
  insertWithSlugRetry,
} from '@/lib/db/queries/shared'
import type { Db, RatingDistribution, Tx } from '@/lib/db/queries/shared'
import { attachTagsBatchGeneric, attachTagsGeneric, replaceTagsTxGeneric } from './tags'
import { getOrCreateTagsBatch } from '@/lib/db/queries/tags'
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
    tagIds.map((tagId) => ({ [cfg.junctionFk.name === 'book_id' ? 'bookId' : cfg.junctionFk.name === 'movie_id' ? 'movieId' : 'gameId']: entityId, tagId }))
  // ↑ 주의: AnySQLiteColumn.name은 DB 컬럼명(snake_case)이다. 위 3분기 대신
  //   config에 junctionFkField: 'bookId'|'movieId'|'gameId'를 추가하는 쪽이 깔끔 —
  //   Task 1의 MediaDomainConfig에 `junctionFkField` 필드를 추가하고 여기서
  //   `({ [cfg.junctionFkField]: entityId, tagId })`로 구성할 것.

  /** INSERT/UPDATE용: 정규화 입력 → 도메인 컬럼명 객체 */
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
          // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — config가 컬럼 정합성 보증(tests/unit/domains-config)
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

        const row = inserted[0] as Row
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
      const prev = existing[0] as Row & { publishedAt: number | null }

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
        // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — config가 컬럼 정합성 보증
        .update(cfg.table as any)
        .set({
          ...toDomainValues(input),
          ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
          ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
          updatedAt: now,
        })
        .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
        .returning()

      const row = updated[0] as Row
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
      // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 — config가 컬럼 정합성 보증
      .delete(cfg.table as any)
      .where(and(eq(c.id, id), eq(c.authorUserId, authorUserId)))
      .returning({ id: c.id })
    return result.length > 0
  }

  // cache(): generateMetadata와 페이지 본문이 같은 요청에서 각각 호출해도 DB 왕복 1회로 dedupe.
  // 팩토리 인스턴스는 모듈 로드 시 1회 생성되므로 cache 동일성 유지.
  const getBySlug = cache(
    async (db: Db, authorUserId: number, slug: string): Promise<(Row & { tags: string[] }) | null> => {
      const rows = await db
        .select()
        .from(cfg.table)
        .where(and(eq(c.slug, slug), eq(c.authorUserId, authorUserId)))
        .limit(1)
      if (rows.length === 0) return null
      const row = rows[0] as Row
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
    const row = rows[0] as Row
    return { ...row, tags: await tagNamesOf(db, row.id) }
  }

  async function resolveTagId(db: Db, tagName: string): Promise<number | null> {
    const tagRows = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, tagName)).limit(1)
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

  async function list(
    db: Db,
    authorUserId: number,
    filters: MediaListFilters & { tagId?: number | null },
  ): Promise<(Row & { tags: string[] })[]> {
    const conditions = baseConditions(authorUserId, filters)

    if (filters.tag) {
      // tagId 선조회 값이 주입되면 재조회 생략 (list/count 중복 lookup 제거 — 백로그 8)
      const tagId = filters.tagId !== undefined ? filters.tagId : await resolveTagId(db, filters.tag)
      if (tagId === null) return []

      let q = db
        .select({ row: cfg.table })
        .from(cfg.table)
        .innerJoin(cfg.junction, and(eq(cfg.junctionFk, c.id), eq(tagsRef.tagId, tagId)))
        .where(and(...conditions))
        .orderBy(...orderForSort(filters.sort))
        .$dynamic()
      if (filters.limit !== undefined) q = q.limit(filters.limit)
      if (filters.offset !== undefined) q = q.offset(filters.offset)
      const rows = (await q) as unknown as { row: Row }[]

      const tagMap = await attachTagsBatchGeneric(db, tagsRef, rows.map((r) => r.row.id))
      return rows.map((r) => ({ ...r.row, tags: tagMap.get(r.row.id) ?? [] }))
    }

    let q = db
      .select()
      .from(cfg.table)
      .where(and(...conditions))
      .orderBy(...orderForSort(filters.sort))
      .$dynamic()
    if (filters.limit !== undefined) q = q.limit(filters.limit)
    if (filters.offset !== undefined) q = q.offset(filters.offset)
    const rows = (await q) as unknown as Row[]

    const tagMap = await attachTagsBatchGeneric(db, tagsRef, rows.map((r) => r.id))
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
    let query = db
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
      .$dynamic()
    if (opts.limit !== undefined) query = query.limit(opts.limit)
    if (opts.offset !== undefined) query = query.offset(opts.offset)
    const rows = (await query) as unknown as Row[]

    const tagMap = await attachTagsBatchGeneric(db, tagsRef, rows.map((r) => r.id))
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
      const tagId = filters.tagId !== undefined ? filters.tagId : await resolveTagId(db, filters.tag)
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

  const publicWhere = () => and(eq(c.isPublic, 1), isNotNull(c.publishedAt))

  async function listRecentPublic(
    db: Db,
    opts: { limit: number; offset?: number },
  ): Promise<PublicMediaCard<ExtId>[]> {
    let q = db
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
      .$dynamic()
    q = q.limit(opts.limit)
    if (opts.offset !== undefined) q = q.offset(opts.offset)
    const rows = await q
    // publishedAt은 위 WHERE로 NOT NULL 보장 — number로 narrow
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number })) as PublicMediaCard<ExtId>[]
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
    return (rows[0] as { title: string; person: string; coverUrl: string | null } | undefined) ?? null
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
      if (r.externalId != null) out.set(r.externalId as ExtId, { avg: Number(r.avg), cnt: Number(r.cnt) })
    }
    return out
  }

  async function listReviewsByExternalId(
    db: Db,
    externalId: ExtId,
    opts: { limit: number; offset?: number },
  ): Promise<MediaReviewItem[]> {
    let q = db
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
      .$dynamic()
    q = q.limit(opts.limit)
    if (opts.offset !== undefined) q = q.offset(opts.offset)
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
  }
}
```

작성 중 tsc가 드러내는 드리즐 시그니처 불일치는 의미를 바꾸지 않는 한 캐스트/타입 조정으로 해결하되, **`as any`는 insert/update/delete의 동적 테이블 3곳 + select 결과 캐스트 외 추가 금지**. `eq`/`inArray`에 `AnySQLiteColumn`이 안 먹으면 config 타입을 `SQLiteColumn`으로 바꾸는 등 config 측에서 해결.

Task 1의 config에 `junctionFkField: 'bookId' | 'movieId' | 'gameId'` 필드를 추가하고 (각 도메인 값 채움 + config 테스트에 검증 추가), `buildJunctionRows`는 `({ [cfg.junctionFkField]: entityId, tagId })`로 구성한다.

- [ ] **Step 2: books.ts를 wrapper로 교체**

기존 export 이름·시그니처 전부 보존. 파일 전체를 다음으로 교체:

```ts
// src/lib/db/queries/books.ts
import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'
import { BOOKS_DOMAIN } from '@/lib/domains/config'
import { createMediaQueries } from '@/lib/domains/queries'
import type { MediaListFilters, MediaUpdateInput } from '@/lib/domains/queries'
import type { books } from '../schema'
import type { BookWithTags, Db, RatingDistribution } from './shared'

type BookRow = typeof books.$inferSelect

const q = createMediaQueries<BookRow, string>(BOOKS_DOMAIN)

// tagId?: API/페이지에서 선조회한 tag id 주입 시 list/count의 중복 lookup 생략 (백로그 8)
export type ListBookFilters = MediaListFilters & { tagId?: number | null }

export type PublicBookCard = {
  id: number
  slug: string
  title: string
  author: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  isbn: string | null
  publishedAt: number
  authorDisplayName: string
}

export type BookSiteAggregate = { avg: number; cnt: number }

export type BookReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

function toUpdateInput(input: UpdateBookInput): MediaUpdateInput<string> {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.author !== undefined && { person: input.author }),
    ...(input.genre !== undefined && { genre: input.genre }),
    ...(input.readDate !== undefined && { date: input.readDate }),
    ...(input.rating !== undefined && { rating: input.rating }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
    ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
    ...(input.isbn !== undefined && { externalId: input.isbn }),
    ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
    ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
  }
}

export async function createBook(
  db: Db,
  authorUserId: number,
  input: CreateBookInput,
): Promise<BookWithTags> {
  return q.create(db, authorUserId, {
    title: input.title,
    person: input.author,
    genre: input.genre,
    date: input.readDate,
    rating: input.rating,
    content: input.content ?? '',
    tags: input.tags ?? [],
    oneLineReview: input.oneLineReview ?? null,
    isPublic: input.isPublic ?? true,
    externalId: input.isbn ?? null,
    coverUrl: input.coverUrl ?? null,
    externalSource: input.externalSource ?? null,
  })
}

export async function updateBook(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateBookInput,
): Promise<BookWithTags | null> {
  return q.update(db, authorUserId, id, toUpdateInput(input))
}

export async function deleteBook(db: Db, authorUserId: number, id: number): Promise<boolean> {
  return q.remove(db, authorUserId, id)
}

export const getBookBySlug = q.getBySlug

export async function getBookById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<BookWithTags | null> {
  return q.getById(db, authorUserId, id)
}

export async function listBooks(
  db: Db,
  authorUserId: number,
  filters: ListBookFilters,
): Promise<BookWithTags[]> {
  return q.list(db, authorUserId, filters)
}

export async function searchBooks(
  db: Db,
  authorUserId: number,
  qStr: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<BookWithTags[]> {
  return q.search(db, authorUserId, qStr, opts)
}

export async function countSearchBooks(db: Db, authorUserId: number, qStr: string): Promise<number> {
  return q.countSearch(db, authorUserId, qStr)
}

export const listGenresWithCounts = q.listGenresWithCounts

export async function listRecentPublicBooks(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicBookCard[]> {
  const rows = await q.listRecentPublic(db, opts)
  return rows.map(({ person, externalId, ...r }) => ({ ...r, author: person, isbn: externalId }))
}

export const countPublicBooks = q.countPublic

export async function getPublicBookFallbackByIsbn(
  db: Db,
  isbn: string,
): Promise<{ title: string; author: string; coverUrl: string | null } | null> {
  const row = await q.getPublicFallbackByExternalId(db, isbn)
  return row === null ? null : { title: row.title, author: row.person, coverUrl: row.coverUrl }
}

export async function countBooks(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; tagId?: number | null } = {},
): Promise<number> {
  return q.countAll(db, authorUserId, filters)
}

// API/페이지에서 tag name → id 선조회용 (list/count에 tagId로 주입 — 백로그 8)
export const resolveBookTagId = q.resolveTagId

export const countBooksByExternalIds = q.countByExternalIds
export const getBookAggregatesByIsbns = q.getAggregatesByExternalIds
export const listBookReviewsByIsbn = q.listReviewsByExternalId
export const countBookReviewsByIsbn = q.countReviewsByExternalId
export const getBookRatingDistributionByIsbn: (
  db: Db,
  isbn: string,
) => Promise<RatingDistribution> = q.getRatingDistributionByExternalId
```

주의:
- `BookWithTags`는 `typeof books.$inferSelect & { tags: string[] }` — 팩토리 반환 `BookRow & { tags }`와 동일 타입이라 캐스트 불필요. tsc가 불일치를 알리면 wrapper에서 `as BookWithTags`로 좁히되 사유 주석.
- `queries.ts` barrel(`src/lib/db/queries.ts`)의 re-export 목록과 대조해 빠진 export가 없는지 확인: `grep -n 'books' src/lib/db/queries.ts`.

- [ ] **Step 3: 전체 테스트 — books 회귀 확인**

Run: `pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 전체 PASS. 특히 `tests/integration/`의 scoping·public-feed·works-aggregation·stats 계열.

- [ ] **Step 4: tsc + lint(변경 파일)**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5 && pnpm exec biome check src/lib/domains/queries.ts src/lib/db/queries/books.ts 2>&1 | tail -3`
Expected: 에러 0

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domains/ src/lib/db/queries/books.ts tests/unit/domains-config.test.ts
git commit -m "refactor(queries): 미디어 쿼리 팩토리 신설 — books를 첫 wrapper로 교체"
```

---

### Task 4: movies·games wrapper 교체

**Files:**
- Modify: `src/lib/db/queries/movies.ts`, `src/lib/db/queries/games.ts`

- [ ] **Step 1: movies.ts wrapper 교체**

Task 3 Step 2의 books wrapper와 같은 구조를 movies 이름으로 작성. 치환표 (코드 구조는 books와 동일, 아래 이름만 다름):

| books | movies |
|---|---|
| `BOOKS_DOMAIN` / `createMediaQueries<BookRow, string>` | `MOVIES_DOMAIN` / `createMediaQueries<MovieRow, number>` |
| `input.author` → person / `input.readDate` → date / `input.isbn` → externalId | `input.director` / `input.watchedDate` / `input.tmdbId` |
| `createBook/updateBook/deleteBook/getBookBySlug/getBookById/listBooks/searchBooks/countSearchBooks/listGenresWithCounts/listRecentPublicBooks/countPublicBooks/getPublicBookFallbackByIsbn/countBooks/countBooksByExternalIds/getBookAggregatesByIsbns/listBookReviewsByIsbn/countBookReviewsByIsbn/getBookRatingDistributionByIsbn` | `createMovie/updateMovie/deleteMovie/getMovieBySlug/getMovieById/listMovies/searchMovies/countSearchMovies/listMovieGenresWithCounts/listRecentPublicMovies/countPublicMovies/getPublicMovieFallbackByTmdbId/countMovies/countMoviesByExternalIds/getMovieAggregatesByTmdbIds/listMovieReviewsByTmdbId/countMovieReviewsByTmdbId/getMovieRatingDistributionByTmdbId` |
| `ListBookFilters/PublicBookCard{author,isbn}/BookSiteAggregate/BookReviewItem` | `ListMovieFilters/PublicMovieCard{director,tmdbId}/MovieSiteAggregate/MovieReviewItem` |

`PublicMovieCard` 매핑: `({ person, externalId, ...r }) => ({ ...r, director: person, tmdbId: externalId })`. fallback: `{ title, director: row.person, coverUrl }`.

- [ ] **Step 2: games.ts wrapper 교체**

동일 구조, games 이름:

| books | games |
|---|---|
| `GAMES_DOMAIN` / `createMediaQueries<GameRow, number>` | — |
| `input.developer` / `input.playedDate` / `input.rawgId` | — |
| 함수: `createGame/updateGame/deleteGame/getGameBySlug/getGameById/listGames/searchGames/countSearchGames/listGameGenresWithCounts/listRecentPublicGames/countPublicGames/getPublicGameFallbackByRawgId/countGames/countGamesByExternalIds/getGameAggregatesByRawgIds/listGameReviewsByRawgId/countGameReviewsByRawgId/getGameRatingDistributionByRawgId` | — |
| 타입: `ListGameFilters/PublicGameCard{developer,rawgId}/GameSiteAggregate/GameReviewItem` | — |

`PublicGameCard` 매핑: `({ person, externalId, ...r }) => ({ ...r, developer: person, rawgId: externalId })`.

두 wrapper 모두 books와 동일하게 `resolveMovieTagId`/`resolveGameTagId` export와 `ListMovieFilters`/`ListGameFilters`의 `tagId?: number | null` 확장을 포함한다.

- [ ] **Step 3: 기존 export 누락 검사**

Run: `git diff main -- src/lib/db/queries/movies.ts src/lib/db/queries/games.ts | grep '^-export' | sort` 와 `git diff main -- src/lib/db/queries/movies.ts src/lib/db/queries/games.ts | grep '^+export' | sort`
Expected: 삭제된 export 이름이 전부 신규 export에 존재 (이름 1:1)

- [ ] **Step 4: 전체 테스트 + tsc**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: 전체 PASS, tsc 에러 0

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/queries/movies.ts src/lib/db/queries/games.ts
git commit -m "refactor(queries): movies·games 쿼리를 미디어 팩토리 wrapper로 교체 — 3중 복제 해소"
```

---

### Task 5: validations 공유 필드 추출 + DOMAIN_TYPES 적용

**Files:**
- Create: `src/lib/domains/schemas.ts`
- Modify: `src/lib/validations.ts`

동적 키 `z.object`는 타입 추론을 죽이므로 **팩토리가 아닌 공유 필드 조각** 방식. `CreateBookInput` 등 추론 타입은 그대로 유지된다.

- [ ] **Step 1: 공유 필드 모듈 작성**

```ts
// src/lib/domains/schemas.ts
import { z } from 'zod'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export const MAX_TAGS = 20
export const MAX_TAG_LEN = 30
export const MAX_CONTENT_LEN = 50_000

const tagsArraySchema = z
  .array(z.string().max(MAX_TAG_LEN, '태그는 최대 30자입니다'))
  .max(MAX_TAGS, '태그는 최대 20개까지 등록할 수 있습니다')

const dedupeTags = (arr: string[]) =>
  Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))

export const coverUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'http/https URL만 허용됩니다' })
  .nullable()
  .optional()

export const mediaDateSchema = z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD')

export const personSchema = (message: string) => z.string().trim().min(1, message).max(100)

/** Create 스키마 공통 필드 — 도메인 파일이 spread 후 person/date/genre/externalId를 extend */
export const mediaCreateBaseFields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  rating: z.number().int().min(1).max(10),
  content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
  tags: tagsArraySchema.default([]).transform(dedupeTags),
  oneLineReview: z
    .string()
    .trim()
    .max(150, '한줄평은 150자 이내로 입력해주세요')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isPublic: z.boolean().optional().default(true),
  coverUrl: coverUrlSchema,
}

/** Update 스키마 공통 필드 — all optional, no defaults (parse({}) === {}) */
export const mediaUpdateBaseFields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
  rating: z.number().int().min(1).max(10).optional(),
  content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
  tags: tagsArraySchema.transform(dedupeTags).optional(),
  oneLineReview: z
    .string()
    .trim()
    .max(150, '한줄평은 150자 이내로 입력해주세요')
    .optional()
    .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : null)),
  isPublic: z.boolean().optional(),
  coverUrl: coverUrlSchema,
}

/** 목록 쿼리스트링 스키마 — genre enum만 도메인별 (제네릭 함수라 추론 유지) */
export function createListQuerySchema<G extends readonly [string, ...string[]]>(
  genres: G,
  maxSearchQ: number,
) {
  return z.object({
    q: z.string().max(maxSearchQ).optional(),
    genre: z.enum(genres).optional(),
    tag: z.string().max(MAX_TAG_LEN).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    sort: z.enum(['date', 'rating']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
  })
}
```

주의: `MAX_TAGS`/`MAX_TAG_LEN`/`MAX_CONTENT_LEN`은 validations.ts와 이중 정의가 되면 안 됨 — validations.ts가 `export { MAX_TAGS, MAX_TAG_LEN, MAX_CONTENT_LEN } from './domains/schemas'` 형태로 재export하거나, 순환 import를 피해 domains/schemas.ts를 단일 정의처로 삼는다 (validations.ts → domains/schemas.ts 단방향).

- [ ] **Step 2: validations.ts 교체**

Create/Update 6개 스키마를 공유 필드 spread로 재작성. 모양은 다음 패턴 (book 예시 — movie/game은 person 필드명·label·genre enum·외부 ID 필드만 다름):

```ts
import {
  coverUrlSchema,
  createListQuerySchema,
  mediaCreateBaseFields,
  mediaUpdateBaseFields,
  mediaDateSchema,
  personSchema,
} from './domains/schemas'
import { DOMAIN_TYPES } from './domains/config'

export const CreateBookSchema = z
  .object({
    ...mediaCreateBaseFields,
    author: personSchema('작가를 입력하세요'),
    genre: z.enum(BOOK_GENRES),
    readDate: mediaDateSchema,
    isbn: isbnSchema,
    externalSource: z.enum(['naver']).nullable().optional(),
  })
  .strict()

export const UpdateBookSchema = z
  .object({
    ...mediaUpdateBaseFields,
    author: personSchema('작가를 입력하세요').optional(),
    genre: z.enum(BOOK_GENRES).optional(),
    readDate: mediaDateSchema.optional(),
    isbn: isbnSchema,
    externalSource: z.enum(['naver']).nullable().optional(),
  })
  .strict()
```

도메인별 차이값: movie → `director: personSchema('감독을 입력하세요')`, `watchedDate`, `tmdbId: z.number().int().positive().nullable().optional()`, `externalSource: z.enum(['tmdb'])`, `MOVIE_GENRES`. game → `developer: personSchema('개발사를 입력하세요')`, `playedDate`, `rawgId`(tmdbId와 동일 스키마), `externalSource: z.enum(['rawg'])`, `GAME_GENRES`.

List 쿼리 3개와 Feed/WorksSearch:

```ts
export const ListBooksQuerySchema = createListQuerySchema(BOOK_GENRES, MAX_SEARCH_Q)
export const ListMoviesQuerySchema = createListQuerySchema(MOVIE_GENRES, MAX_SEARCH_Q)
export const ListGamesQuerySchema = createListQuerySchema(GAME_GENRES, MAX_SEARCH_Q)

export const FeedQuerySchema = z.object({
  type: z.enum(DOMAIN_TYPES).default('book'),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const WorksSearchQuerySchema = z.object({
  type: z.enum(DOMAIN_TYPES).default('book'),
  q: z.string().trim().min(1).max(MAX_SEARCH_Q),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})
```

`isbnSchema`(transform 순서 주석 포함)·`writingCoverUrlSchema`·Writing/유저/로그인 스키마·`limits`·param 스키마들은 무변경. `CreateBookInput` 등 `z.infer` 타입 export 유지.

- [ ] **Step 3: 추론 타입 동일성 확인 + 전체 테스트**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5 && pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 에러 0, 전체 PASS — 특히 `tests/unit/`의 validations 계열이 무수정 통과 (스키마 동작 동일성 증명)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/domains/schemas.ts src/lib/validations.ts
git commit -m "refactor(validations): 미디어 스키마 공유 필드 추출 + DOMAIN_TYPES 단일 소스 적용"
```

---

### Task 6: API route 팩토리

**Files:**
- Create: `src/lib/domains/api.ts`, `src/lib/domains/routes/books.ts`, `src/lib/domains/routes/movies.ts`, `src/lib/domains/routes/games.ts`
- Modify: `src/app/api/books/route.ts`, `src/app/api/books/[id]/route.ts`, `src/app/api/movies/route.ts`, `src/app/api/movies/[id]/route.ts`, `src/app/api/games/route.ts`, `src/app/api/games/[id]/route.ts`

`*/by-external`은 제외(전제 참고). 응답 shape·상태코드·revalidateTag 호출 완전 동일 유지.

- [ ] **Step 1: api 팩토리 작성**

```ts
// src/lib/domains/api.ts
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import type { z } from 'zod'
import { db } from '@/lib/db/client'
import { requireUser } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'
import type { Db } from '@/lib/db/queries/shared'
import type { User } from '@/lib/db/schema'

const PAGE_SIZE = 24

type Params = { params: Promise<{ id: string }> }

interface ListQueryShape {
  q?: string
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  page?: number
}

export interface MediaRouteDeps<CreateInput, UpdateInput, Entity extends { id: number; slug: string }> {
  /** withApiHandler 라벨 — 기존 라벨 문자열 그대로 (예: listGames/createGame/getGame/updateGame/deleteGame) */
  labels: { list: string; create: string; get: string; update: string; delete: string }
  createSchema: z.ZodType<CreateInput>
  updateSchema: z.ZodType<UpdateInput>
  listQuerySchema: z.ZodType<ListQueryShape>
  queries: {
    search: (db: Db, userId: number, q: string, opts: { limit: number; offset: number }) => Promise<unknown[]>
    countSearch: (db: Db, userId: number, q: string) => Promise<number>
    list: (db: Db, userId: number, filters: ListQueryShape & { limit: number; offset: number; tagId?: number | null }) => Promise<unknown[]>
    count: (db: Db, userId: number, filters: { genre?: string; tag?: string; year?: number; tagId?: number | null }) => Promise<number>
    create: (db: Db, userId: number, input: CreateInput) => Promise<Entity>
    update: (db: Db, userId: number, id: number, input: UpdateInput) => Promise<Entity | null>
    delete: (db: Db, userId: number, id: number) => Promise<boolean>
    getById: (db: Db, userId: number, id: number) => Promise<unknown | null>
    resolveTagId: (db: Db, tagName: string) => Promise<number | null>
  }
  requireOwn: (id: number) => Promise<{ user: User }>
  /** 도메인 캐시 태그 2개 (public feed + works detail) — 기존 문자열 그대로 */
  revalidateTags: readonly string[]
}

export function createMediaRouteHandlers<CreateInput, UpdateInput, Entity extends { id: number; slug: string }>(
  deps: MediaRouteDeps<CreateInput, UpdateInput, Entity>,
) {
  const revalidateAll = () => {
    for (const tag of deps.revalidateTags) revalidateTag(tag, 'max')
  }

  const listGET = withApiHandler(deps.labels.list, async (req: Request) => {
    const user = await requireUser()
    const { q, genre, tag, year, sort, page } = requireQuery(req, deps.listQuerySchema)
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (q && q.trim().length > 0) {
      const [results, total] = await Promise.all([
        deps.queries.search(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
        deps.queries.countSearch(db, user.id, q.trim()),
      ])
      return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
    }
    // tagId 선조회 1회 — list/count가 같은 tag lookup을 반복하지 않게 (백로그 8)
    const tagId = tag ? await deps.queries.resolveTagId(db, tag) : undefined
    const filters = { genre, tag, year, sort: sort ?? ('date' as const), tagId }
    const [list, total] = await Promise.all([
      deps.queries.list(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
      deps.queries.count(db, user.id, { genre, tag, year, tagId }),
    ])
    return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
  })

  const createPOST = withApiHandler(deps.labels.create, async (req: Request) => {
    const user = await requireUser()
    const input = await requireJsonBody(req, deps.createSchema)
    const entity = await deps.queries.create(db, user.id, input)
    revalidateAll()
    return NextResponse.json({ id: entity.id, slug: entity.slug }, { status: 201 })
  })

  const itemGET = withApiHandler(deps.labels.get, async (_req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    const { user } = await deps.requireOwn(id)
    const entity = await deps.queries.getById(db, user.id, id)
    if (!entity) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(entity)
  })

  const itemPATCH = withApiHandler(deps.labels.update, async (req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    const { user } = await deps.requireOwn(id)
    const input = await requireJsonBody(req, deps.updateSchema)
    const updated = await deps.queries.update(db, user.id, id, input)
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateAll()
    return NextResponse.json({ id: updated.id, slug: updated.slug })
  })

  const itemDELETE = withApiHandler(deps.labels.delete, async (_req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    const { user } = await deps.requireOwn(id)
    const ok = await deps.queries.delete(db, user.id, id)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateAll()
    return NextResponse.json({ ok: true })
  })

  return { listGET, createPOST, itemGET, itemPATCH, itemDELETE }
}
```

주의: 기존 books/movies route.ts를 먼저 읽고 games와 다른 점(라벨 문자열, revalidate 태그, 응답 키)이 있으면 **기존 동작 우선** — 팩토리를 기존에 맞춘다. zod 스키마 default/transform 때문에 `z.ZodType<CreateInput>` 타입이 안 맞으면 `z.ZodTypeAny`로 완화하고 `CreateInput`은 queries 시그니처에서 추론.

- [ ] **Step 2: 도메인 인스턴스 작성**

```ts
// src/lib/domains/routes/games.ts
import { requireOwnGame } from '@/lib/auth-helpers'
import {
  countGames,
  countSearchGames,
  createGame,
  deleteGame,
  getGameById,
  listGames,
  resolveGameTagId,
  searchGames,
  updateGame,
} from '@/lib/db/queries'
import { CreateGameSchema, ListGamesQuerySchema, UpdateGameSchema } from '@/lib/validations'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'
import { createMediaRouteHandlers } from '@/lib/domains/api'

export const gameRouteHandlers = createMediaRouteHandlers({
  labels: { list: 'listGames', create: 'createGame', get: 'getGame', update: 'updateGame', delete: 'deleteGame' },
  createSchema: CreateGameSchema,
  updateSchema: UpdateGameSchema,
  listQuerySchema: ListGamesQuerySchema,
  queries: {
    search: searchGames,
    countSearch: countSearchGames,
    list: listGames,
    count: countGames,
    create: createGame,
    update: updateGame,
    delete: deleteGame,
    getById: getGameById,
    resolveTagId: resolveGameTagId,
  },
  requireOwn: requireOwnGame,
  revalidateTags: [PUBLIC_FEED_TAGS.games, WORKS_GAME_TAG],
})
```

books/movies 인스턴스도 동일 패턴: 라벨은 기존 route 파일의 withApiHandler 라벨 문자열을 그대로 복사(`grep -n withApiHandler src/app/api/books/route.ts src/app/api/books/[id]/route.ts` 등으로 확인), revalidateTags는 books=`[PUBLIC_FEED_TAGS.books, WORKS_BOOK_TAG]`, movies=`[PUBLIC_FEED_TAGS.movies, WORKS_MOVIE_TAG]`. `resolveBookTagId`/`resolveMovieTagId`/`resolveGameTagId`와 filters의 `tagId` 통과는 Task 3·4 wrapper에 이미 포함됨 — 누락 시 해당 wrapper에 추가.

- [ ] **Step 3: route 파일을 re-export 셸로 교체**

```ts
// src/app/api/games/route.ts
import { gameRouteHandlers } from '@/lib/domains/routes/games'

export const GET = gameRouteHandlers.listGET
export const POST = gameRouteHandlers.createPOST
```

```ts
// src/app/api/games/[id]/route.ts
import { gameRouteHandlers } from '@/lib/domains/routes/games'

export const GET = gameRouteHandlers.itemGET
export const PATCH = gameRouteHandlers.itemPATCH
export const DELETE = gameRouteHandlers.itemDELETE
```

books/movies 4개 파일 동일 패턴.

- [ ] **Step 4: 전체 테스트 + e2e 골든패스**

Run: `pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 전체 PASS
Run: `pnpm e2e 2>&1 | tail -15` (시간 걸리면 `run_in_background`)
Expected: 전체 PASS (golden-path가 책/영화 CRUD를 API 경유로 검증)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domains/api.ts src/lib/domains/routes/ src/app/api/books/ src/app/api/movies/ src/app/api/games/ src/lib/db/queries/books.ts src/lib/db/queries/movies.ts src/lib/db/queries/games.ts
git commit -m "refactor(api): 미디어 CRUD 라우트 팩토리 — 6개 route 파일을 re-export 셸로 축소"
```

---

### Task 7: MediaCard 통합

**Files:**
- Create: `src/components/MediaCard.tsx`
- Modify: `src/components/BookCard.tsx`, `src/components/MovieCard.tsx`, `src/components/GameCard.tsx` (wrapper로 교체)

- [ ] **Step 1: BookCard·MovieCard를 읽고 GameCard와의 차이를 확인**

`cat src/components/BookCard.tsx src/components/MovieCard.tsx` — 필드 accessor(author/director)·공개 배지 title 문구(서재/영화관/게임관)·date 필드 외 차이가 있으면 MediaCard props에 반영.

- [ ] **Step 2: MediaCard 작성 (정규화 props)**

```tsx
// src/components/MediaCard.tsx
import Link from 'next/link'
import Image from 'next/image'
import { GenreBadge } from './GenreBadge'
import { RatingScore } from './RatingScore'
import { highlightMatch } from '@/lib/highlight'

export interface MediaCardItem {
  slug: string
  title: string
  person: string
  genre: string
  rating: number
  date: string
  isPublic: number
  coverUrl: string | null
  tags: string[]
}

interface Props {
  item: MediaCardItem
  basePath: string // '/books' | '/movies' | '/games'
  publicBadgeTitle: string // 예: '모두의 게임관에 공개됨'
  snippet?: string
  query?: string
}

export function MediaCard({ item, basePath, publicBadgeTitle, snippet, query }: Props) {
  return (
    <Link
      href={`${basePath}/${item.slug}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <div className="flex gap-3">
        {item.coverUrl && (
          <Image
            src={item.coverUrl}
            alt=""
            width={80}
            height={120}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
              {item.title}
            </h3>
            <GenreBadge genre={item.genre} />
          </div>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)] line-clamp-1">{item.person}</p>
          {snippet && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
              {query ? highlightMatch(snippet, query) : snippet}
            </p>
          )}
          {item.tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {item.tags.slice(0, 3).map((t) => (
                <li key={t} className="text-[12px] text-[var(--color-text-weak)]">
                  #{t}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <RatingScore value={item.rating} />
            <div className="flex items-center gap-2">
              {item.isPublic === 1 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-toss-blue)]"
                  title={publicBadgeTitle}
                >
                  🌐 공개
                </span>
              )}
              <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">
                {item.date}
              </time>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: 3개 카드 wrapper 교체** (GameCard 예시 — Book/Movie 동형, accessor와 배지 문구만 기존 파일 값 그대로)

```tsx
// src/components/GameCard.tsx
import type { GameWithTags } from '@/lib/db/queries'
import { MediaCard } from './MediaCard'

interface Props {
  game: GameWithTags
  snippet?: string
  query?: string
}

export function GameCard({ game, snippet, query }: Props) {
  return (
    <MediaCard
      item={{
        slug: game.slug,
        title: game.title,
        person: game.developer,
        genre: game.genre,
        rating: game.rating,
        date: game.playedDate,
        isPublic: game.isPublic,
        coverUrl: game.coverUrl,
        tags: game.tags,
      }}
      basePath="/games"
      publicBadgeTitle="모두의 게임관에 공개됨"
      snippet={snippet}
      query={query}
    />
  )
}
```

- [ ] **Step 4: 컴포넌트 테스트 + 커밋**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm exec tsc --noEmit 2>&1 | tail -3`
Expected: PASS

```bash
git add src/components/MediaCard.tsx src/components/BookCard.tsx src/components/MovieCard.tsx src/components/GameCard.tsx
git commit -m "refactor(components): BookCard/MovieCard/GameCard를 MediaCard 단일 구현으로 통합"
```

---

### Task 8: ExternalMediaSearchBar 통합

**Files:**
- Create: `src/components/ExternalMediaSearchBar.tsx`
- Modify: `src/components/ExternalBookSearchBar.tsx`, `src/components/ExternalMovieSearchBar.tsx`, `src/components/ExternalGameSearchBar.tsx` (wrapper로 교체)

- [ ] **Step 1: Book/Movie 검색바를 읽고 Game과의 차이 목록화**

`cat src/components/ExternalBookSearchBar.tsx src/components/ExternalMovieSearchBar.tsx` — 차이는 externalId 타입(book=string)·아이콘(📚/🎬/🎮)·searchUrl/byExternalUrl·placeholder·renderItem의 부가 필드 정도로 예상. 차이가 더 있으면 props로 승격.

- [ ] **Step 2: 제네릭 검색바 작성**

`ExternalGameSearchBar`(현행)를 기반으로 `ExternalMediaSearchBar<TItem extends { externalId: TId; title: string; byline: string; genre?: string; coverUrl?: string; subtitle?: string; year?: string | number }, TId extends string | number>` 작성. props: `{ searchUrl, byExternalUrl, placeholder, fallbackIcon, initial: { externalId, title, byline, coverUrl }, onSelect, onClear }`. 현행 GameSearchBar의 showChip/useEffect/SelectedChip/SearchDropdown/renderItem 구조 그대로, 도메인 리터럴만 props 치환.

- [ ] **Step 3: 3개 wrapper 교체** — 기존 export 이름·prop 시그니처(`initial.rawgId` 등 도메인 키) 유지, 내부에서 정규화 키로 변환해 제네릭 호출. placeholder·아이콘은 기존 파일 값 그대로.

- [ ] **Step 4: 테스트 + 커밋**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm exec tsc --noEmit 2>&1 | tail -3`
Expected: PASS

```bash
git add src/components/ExternalMediaSearchBar.tsx src/components/ExternalBookSearchBar.tsx src/components/ExternalMovieSearchBar.tsx src/components/ExternalGameSearchBar.tsx
git commit -m "refactor(components): 외부 검색바 3종을 제네릭 ExternalMediaSearchBar로 통합"
```

---

### Task 9: MediaForm 통합

**Files:**
- Create: `src/components/MediaForm.tsx`
- Modify: `src/components/BookForm.tsx`, `src/components/MovieForm.tsx`, `src/components/GameForm.tsx` (wrapper로 교체)

- [ ] **Step 1: BookForm·MovieForm을 읽고 GameForm과 필드·문구 차이 목록화**

`cat src/components/BookForm.tsx src/components/MovieForm.tsx` — 레이블(저자/감독/개발사, 읽은/본/플레이한 날짜)·placeholder·공개 토글 문구·삭제 확인 문구·payload 키를 표로 정리해 Step 2의 config 값에 그대로 복사.

- [ ] **Step 2: MediaForm 작성**

GameForm(현행, 226줄) 구조를 정규화 상태(person/date/externalId)로 일반화:

```tsx
// src/components/MediaForm.tsx — 핵심 구조 (스타일 클래스·JSX는 GameForm 그대로 유지)
'use client'

export interface MediaFormConfig<TId extends string | number> {
  apiBase: string // '/api/games'
  listPath: string // '/games'
  genres: readonly string[]
  personLabel: string // '개발사'
  dateLabel: string // '플레이한 날짜'
  oneLinePlaceholder: string
  publicToggleLabel: string
  publicToggleDescription: string
  deleteConfirmTitle: string
  deleteConfirmDescription: (title: string) => string
  externalSource: string // 'rawg'
  /** payload에서 도메인 필드 키 — { person: 'developer', date: 'playedDate', externalId: 'rawgId' } */
  fieldKeys: { person: string; date: string; externalId: string }
  /** 도메인 외부 검색바 렌더 — MediaForm이 정규화 콜백 제공 */
  renderSearchBar: (props: {
    externalId: TId | null
    title: string
    person: string
    coverUrl: string | null
    onSelect: (sel: { externalId: TId; title: string; byline: string; genre?: string; coverUrl?: string }) => void
    onClear: () => void
  }) => React.ReactNode
}

export interface MediaFormValues<TId extends string | number> {
  title: string
  person: string
  genre: string
  date: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  externalId: TId | null
  coverUrl: string | null
}

interface Props<TId extends string | number> {
  config: MediaFormConfig<TId>
  initial?: Partial<MediaFormValues<TId>> & { id?: number }
  mode: 'create' | 'edit'
}
```

본문: GameForm의 useState 군을 정규화 이름으로(developer→person, playedDate→date, rawgId→externalId). **`externalSource` useState 제거** — payload 구성 시 `externalId != null ? config.externalSource : null`로 파생 (백로그 11). payload:

```ts
const payload = {
  title,
  [config.fieldKeys.person]: person,
  genre,
  [config.fieldKeys.date]: date,
  rating,
  content,
  tags,
  oneLineReview,
  isPublic,
  [config.fieldKeys.externalId]: externalId,
  coverUrl,
  externalSource: externalId != null ? config.externalSource : null,
}
```

JSX는 GameForm 그대로, 레이블·문구만 config 참조. submit URL: `mode === 'create' ? config.apiBase : `${config.apiBase}/${initial?.id}``, 성공 시 `router.push(`${config.listPath}/${data.slug}`)`.

- [ ] **Step 3: 3개 폼 wrapper 교체** (GameForm 예시 — Book/Movie는 Step 1 표의 문구로)

```tsx
// src/components/GameForm.tsx
'use client'

import { GAME_GENRES } from '@/lib/genres'
import { MediaForm, type MediaFormConfig } from './MediaForm'
import { ExternalGameSearchBar } from './ExternalGameSearchBar'

export interface GameFormValues {
  title: string
  developer: string
  genre: string
  playedDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  rawgId: number | null
  coverUrl: string | null
  externalSource: 'rawg' | null
}

const GAME_FORM_CONFIG: MediaFormConfig<number> = {
  apiBase: '/api/games',
  listPath: '/games',
  genres: GAME_GENRES,
  personLabel: '개발사',
  dateLabel: '플레이한 날짜',
  oneLinePlaceholder: '이 게임을 한 줄로 표현한다면?',
  publicToggleLabel: '모두의 게임방에 공개',
  publicToggleDescription:
    '이 게임의 한줄평·별점·제목·개발사를 모두의 게임방에서 다른 사람도 볼 수 있어요',
  deleteConfirmTitle: '이 게임 기록을 삭제할까요?',
  deleteConfirmDescription: (title) => `'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`,
  externalSource: 'rawg',
  fieldKeys: { person: 'developer', date: 'playedDate', externalId: 'rawgId' },
  renderSearchBar: (p) => (
    <ExternalGameSearchBar
      initial={{ rawgId: p.externalId, title: p.title, byline: p.person, coverUrl: p.coverUrl }}
      onSelect={(sel) =>
        p.onSelect({
          externalId: sel.externalId,
          title: sel.title,
          byline: sel.byline,
          genre: sel.genre,
          coverUrl: sel.coverUrl,
        })
      }
      onClear={p.onClear}
    />
  ),
}

interface Props {
  initial?: Partial<GameFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

export function GameForm({ initial, mode }: Props) {
  return (
    <MediaForm
      config={GAME_FORM_CONFIG}
      mode={mode}
      initial={
        initial && {
          id: initial.id,
          title: initial.title,
          person: initial.developer,
          genre: initial.genre,
          date: initial.playedDate,
          rating: initial.rating,
          content: initial.content,
          tags: initial.tags,
          oneLineReview: initial.oneLineReview,
          isPublic: initial.isPublic,
          externalId: initial.rawgId,
          coverUrl: initial.coverUrl,
        }
      }
    />
  )
}
```

주의: 공개 토글 문구는 **기존 파일 값 그대로** 복사 (위 예시 문구를 믿지 말고 Step 1에서 확인한 원문 사용 — 예: GameForm 원문은 '모두의 게임관에 공개'). e2e가 텍스트 셀렉터를 쓸 수 있음.

- [ ] **Step 4: 단위 테스트 + e2e**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm e2e 2>&1 | tail -15`
Expected: 전체 PASS (golden-path가 폼 입력→저장→상세 흐름 검증)

- [ ] **Step 5: 커밋**

```bash
git add src/components/MediaForm.tsx src/components/BookForm.tsx src/components/MovieForm.tsx src/components/GameForm.tsx
git commit -m "refactor(components): 미디어 폼 3종을 MediaForm + 도메인 config로 통합 — externalSource 파생화"
```

---

### Task 10: 페이지 4종 공유화

**Files:**
- Create: `src/components/media/MediaListResults.tsx`, `src/components/media/MediaDetailArticle.tsx`, `src/components/media/mediaPageConfig.ts`
- Modify: `src/app/{books,movies,games}/page.tsx`, `src/app/{books,movies,games}/[slug]/page.tsx`, `src/app/{books,movies,games}/new/page.tsx`, `src/app/{books,movies,games}/edit/[id]/page.tsx`, `src/app/{books,movies,games}/stats/page.tsx` (15개 파일을 config 주입 셸로)

방침: **라우트 세그먼트·URL·redirect 경로·metadata 문구 전부 보존.** 서버 컴포넌트 공유 함수에 도메인 config(쿼리 함수·Card·문구·경로)를 넘긴다. `new`/`edit`의 `FreshOnVisible` 래핑 유지.

- [ ] **Step 1: books·movies의 page.tsx·[slug]/page.tsx·new·edit·stats를 읽고 games 버전과 문구 차이 목록화**

도메인별 가변값(검색 placeholder, empty state 문구·이모지, 개수 단위 '권/편', metadata description 형식, 로그인 redirect next 경로)을 표로 정리.

- [ ] **Step 2: `mediaPageConfig.ts` 작성** — 도메인별 페이지 설정 3벌

```ts
// src/components/media/mediaPageConfig.ts — 형태 (값은 Step 1 표에서 원문 복사)
import type { ComponentType } from 'react'

export interface MediaPageConfig<Row> {
  basePath: string
  newLabel: string // '새 게임'
  searchPlaceholder: string // '제목·개발사·본문 검색'
  genres: readonly string[]
  unit: string // '편' 등 — 기존 문구 그대로
  allTitle: string // '전체 게임'
  emptySearch: { emoji: string; title: string; description: (q: string) => string }
  emptyList: { emoji: string; title: string; description: string; actionLabel: string }
  Card: ComponentType<{ item: Row; snippet?: string; query?: string }>
  // 서버 쿼리 묶음 — wrapper export를 그대로 주입
  queries: {
    list: ...
    count: ...
    search: ...
    countSearch: ...
  }
  // 카드/검색 스니펫 매칭용 accessor
  personOf: (row: Row) => string
  contentOf: (row: Row) => string
}
```

(타입은 실제 wrapper 시그니처에 맞춰 채움 — Task 3·4의 함수 시그니처와 동일.)

- [ ] **Step 3: `MediaListResults.tsx` 작성** — 현행 `games/page.tsx`의 `GamesResults`+스켈레톤+페이지 본문(63~171줄)을 config 기반으로 일반화. `ListGamesQuerySchema`도 config로 주입(`listQuerySchema`). 페이지 셸은:

```tsx
// src/app/games/page.tsx — 교체 후 전문
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { spKey } from '@/lib/sp-key'
import { MediaListPageBody, MediaResultsSkeleton } from '@/components/media/MediaListResults'
import { GAMES_PAGE_CONFIG } from '@/components/media/mediaPageConfig'

interface SP {
  searchParams: Promise<{
    genre?: string
    tag?: string
    year?: string
    q?: string
    sort?: string
    page?: string
  }>
}

export default async function GamesPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/games')
  const sp = await searchParams

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <MediaListPageBody.Controls config={GAMES_PAGE_CONFIG} />
      </Suspense>
      <Suspense fallback={<MediaResultsSkeleton />} key={spKey(sp)}>
        <MediaListPageBody.Results config={GAMES_PAGE_CONFIG} sp={sp} userId={me.id} />
      </Suspense>
    </div>
  )
}
```

(Controls = SearchBox+Filters+StatsPageLink 부분, Results = 데이터 페치+그리드+Pagination. 정확한 분해는 현행 games/page.tsx 구조를 따른다. 페이지 레벨 list/count 호출도 Task 6과 같은 tagId 선조회 패턴 적용.)

- [ ] **Step 4: `MediaDetailArticle.tsx` 작성 + [slug] 페이지 셸 교체** — 현행 `games/[slug]/page.tsx`의 article JSX를 정규화 props(person, date, 수정 링크 basePath, 태그 링크 basePath)로 추출. `generateMetadata`는 도메인별 문구가 있어 config에 `metaOf(row): { title, description }` 함수로 주입(기존 문자열 형식 원문 유지 — 예: games는 `` `${developer} 개발 · ${genre} — 별점 ${formatRatingCompact(rating)}/5` ``).

- [ ] **Step 5: new/edit/stats 페이지 셸 교체** — 이미 10~35줄 셸이므로 공유 컴포넌트 없이 **현행 유지하되 h1·문구만 확인**. 셸 자체가 충분히 얇아 추가 추상화는 YAGNI — 변경하지 않기로 한 경우 이 Step은 skip으로 기록.

- [ ] **Step 6: 전체 테스트 + e2e**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm e2e 2>&1 | tail -15`
Expected: 전체 PASS — e2e의 `:visible` 셀렉터·골든패스·stats-panel 통과가 UI 보존 증명

- [ ] **Step 7: 커밋**

```bash
git add src/components/media/ src/app/books/ src/app/movies/ src/app/games/
git commit -m "refactor(pages): 미디어 목록·상세 페이지를 공유 컴포넌트 + 도메인 config로 통합"
```

---

### Task 11: Stats/Works 컴포넌트 도메인 맵화 (백로그 3·4·5)

**Files:**
- Modify: `src/components/stats/StatsDashboard.tsx`, `src/components/works/WorksDetailHeader.tsx`, `src/components/works/WorksSearchBar.tsx`, works 상세 페이지 3곳(WorksDetailHeader 호출부)

- [ ] **Step 1: StatsDashboard 삼항 체인 → 도메인 맵**

```tsx
// StatsDashboard.tsx 내 person/timelineTitle 삼항(64~74줄)을 다음으로 교체
const MEDIA_STATS_LABELS = {
  books: { personTitle: '저자 Top 5', timelineTitle: '연도별 읽은 수' },
  movies: { personTitle: '감독 Top 5', timelineTitle: '연도별 본 수' },
  games: { personTitle: '개발사 Top 5', timelineTitle: '연도별 플레이 수' },
} as const satisfies Record<'books' | 'movies' | 'games', { personTitle: string; timelineTitle: string }>

// 사용처:
const labels = MEDIA_STATS_LABELS[props.domain]
const personItems =
  props.domain === 'books'
    ? props.data.topAuthors
    : props.domain === 'movies'
      ? props.data.topDirectors
      : props.data.topDevelopers
```

(personItems는 discriminated union의 데이터 필드 접근이라 삼항 유지가 타입 안전 — 라벨만 맵화. `satisfies`로 도메인 누락 시 타입 에러.)

- [ ] **Step 2: WorksDetailHeader byline 일반화**

`director?: string`·`developer?: string` prop 제거, 기존 `byline?: string` 하나로 통일. 호출부 검색: `grep -rn 'WorksDetailHeader' src/app/works/`. movie 호출부의 `director={...}` → `byline={`감독 ${...}`}`, game 호출부의 `developer={...}` → `byline={`개발사 ${...}`}` (책 호출부는 byline 사용 중이면 무변경). 렌더 위치가 동일(byline·director·developer 모두 같은 `<p>` 스타일)하므로 시각 변화 없음.

- [ ] **Step 3: WorksSearchBar 도메인 맵**

```tsx
const WORKS_SEARCH_LABELS: Record<'book' | 'movie' | 'game', { aria: string; placeholder: string }> = {
  book: { aria: '책 검색', placeholder: '책 제목·저자 검색' },
  movie: { aria: '영화 검색', placeholder: '영화 제목 검색' },
  game: { aria: '게임 검색', placeholder: '게임 제목 검색' },
}
// aria-label={WORKS_SEARCH_LABELS[type].aria} / placeholder={WORKS_SEARCH_LABELS[type].placeholder}
```

`type` prop 타입을 `DomainType`(domains/config)으로 교체해 단일 소스화.

- [ ] **Step 4: 테스트 + e2e(works) + 커밋**

Run: `pnpm test --reporter=dot 2>&1 | tail -10 && pnpm e2e 2>&1 | tail -15`
Expected: PASS (works-search·stats-panel e2e 포함)

```bash
git add src/components/stats/StatsDashboard.tsx src/components/works/ src/app/works/
git commit -m "refactor(works,stats): 도메인 삼항 체인을 맵 lookup으로 — 도메인 추가 O(1)화"
```

---

### Task 12: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: 에러 0
Run: `pnpm test --reporter=dot 2>&1 | tail -10`
Expected: 전체 PASS
Run: `pnpm e2e 2>&1 | tail -15`
Expected: 전체 PASS
Run: `git diff --stat main | tail -3` — 변경 규모 확인 (순삭감 기대)

- [ ] **Step 2: 변경 파일 lint**

Run: `git diff --name-only main | grep -E '\.(ts|tsx)$' | xargs pnpm exec biome check 2>&1 | tail -5`
Expected: 신규 에러 0 (main 기존 18건 외)

- [ ] **Step 3: 캐시 태그 불변 검증**

Run: `grep -rn "public-books-feed\|public-movies-feed\|public-games-feed\|works-book-detail\|works-movie-detail\|works-game-detail" src/ | wc -l`
Expected: main과 동일 개수 (`git stash` 없이 `git grep ... main -- src | wc -l`과 비교)

- [ ] **Step 4: 백로그 문서 갱신**

`docs/refactor-backlog.md`에서 1·2·3·4·5·8·10·11 항목에 완료 표시(처리 커밋 해시·날짜), 6·7·9·12·13은 잔존 명시.

```bash
git add docs/refactor-backlog.md
git commit -m "docs(backlog): 제네릭 추출로 1~5·8·10·11 완료 처리"
```

- [ ] **Step 5: `/code-review` 실행** (사용자 메모리 규칙 — 브랜치 마무리 전 필수). 발견 사항 수정 후 머지 여부는 사용자 확인.

---

## Self-Review 결과 반영 사항

- 스펙의 `domains/auth.ts`는 **불필요** — `auth-helpers.ts`에 `makeOwnershipHelpers` 팩토리가 이미 존재 (구현 중 발견 사항을 스펙에도 반영함).
- by-external 라우트는 도메인별 ID 파싱 차이(ISBN 문자열 vs 정수 canonical check)로 제네릭 제외 — CLAUDE.md 기존 예외와 일치.
- Task 3 팩토리의 `buildJunctionRows` 3분기 코드는 Task 1 config에 `junctionFkField` 추가로 대체할 것 (해당 Step에 명시).
- 모든 "기존 파일을 읽고 문구 차이 목록화" Step은 e2e 텍스트 셀렉터 보호 목적 — 문구는 추측 금지, 원문 복사.
