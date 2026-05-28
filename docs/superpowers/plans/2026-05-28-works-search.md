# /works Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 API (Naver Book / TMDB) 키워드로 작품을 찾고, 사이트 published 사용자들이 남긴 별점·한줄평 모음을 보여주는 `/works` 섹션을 추가한다.

**Architecture:** 서버 컴포넌트가 외부 API + DB 집계를 합쳐 단일 응답을 그린다. URL은 외부 ID(`isbn`·`tmdbId`)로 영구화. DB 마이그레이션 없음 — 기존 `(isPublic, isbn)`·`(isPublic, tmdbId)` 복합 인덱스 재사용. 멀티테넌트 invariant는 신규 cross-user read 4×2 함수에 `// MULTITENANT INVARIANT EXCEPTION:` 주석으로 의도 명시.

**Tech Stack:** Next.js 16 App Router (server components), Drizzle ORM (libSQL/Turso), zod, Vitest + Playwright, Biome.

**Spec:** [`../specs/2026-05-28-works-search-design.md`](../specs/2026-05-28-works-search-design.md)

---

## 사전 준비

작업 시작 전 새 브랜치를 만든다.

```bash
git checkout -b feat/works-search
```

---

## Task 1: Validation Schemas

**Files:**
- Modify: `src/lib/validations.ts`
- Test: `tests/unit/validations.test.ts`

세 개 zod 스키마 — `/works` 검색 query, ISBN path param, TMDB id path param.

- [ ] **Step 1: Add failing tests**

`tests/unit/validations.test.ts`의 import 줄에 추가:

```ts
import {
  // ...기존 import 유지...
  WorksSearchQuerySchema,
  IsbnParamSchema,
  TmdbIdParamSchema,
} from '@/lib/validations'
```

파일 끝에 추가:

```ts
describe('WorksSearchQuerySchema', () => {
  test('type defaults to book', () => {
    const parsed = WorksSearchQuerySchema.parse({ q: '어린왕자' })
    expect(parsed.type).toBe('book')
  })
  test('q is required and trimmed', () => {
    expect(WorksSearchQuerySchema.safeParse({ q: '  ' }).success).toBe(false)
    expect(WorksSearchQuerySchema.parse({ q: '  어린왕자  ' }).q).toBe('어린왕자')
  })
  test('q max length 100', () => {
    expect(WorksSearchQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })
  test('type=movie accepted', () => {
    expect(WorksSearchQuerySchema.parse({ q: 'x', type: 'movie' }).type).toBe('movie')
  })
  test('unknown type rejected', () => {
    expect(WorksSearchQuerySchema.safeParse({ q: 'x', type: 'foo' }).success).toBe(false)
  })
  test('page coerced from string', () => {
    expect(WorksSearchQuerySchema.parse({ q: 'x', page: '3' }).page).toBe(3)
  })
})

describe('IsbnParamSchema', () => {
  test('accepts ISBN-13', () => {
    expect(IsbnParamSchema.safeParse('9788937462788').success).toBe(true)
  })
  test('accepts ISBN-10', () => {
    expect(IsbnParamSchema.safeParse('8937462788').success).toBe(true)
  })
  test('rejects non-digit', () => {
    expect(IsbnParamSchema.safeParse('978-8937462788').success).toBe(false)
    expect(IsbnParamSchema.safeParse('abc').success).toBe(false)
  })
  test('rejects wrong length', () => {
    expect(IsbnParamSchema.safeParse('123').success).toBe(false)
    expect(IsbnParamSchema.safeParse('12345678901234').success).toBe(false)
  })
})

describe('TmdbIdParamSchema', () => {
  test('coerces digit string to positive integer', () => {
    expect(TmdbIdParamSchema.parse('157336')).toBe(157336)
  })
  test('rejects zero/negative', () => {
    expect(TmdbIdParamSchema.safeParse('0').success).toBe(false)
    expect(TmdbIdParamSchema.safeParse('-5').success).toBe(false)
  })
  test('rejects non-integer', () => {
    expect(TmdbIdParamSchema.safeParse('1.5').success).toBe(false)
    expect(TmdbIdParamSchema.safeParse('abc').success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failure (schemas undefined)**

```bash
pnpm test -- tests/unit/validations.test.ts 2>&1 | tail -10
```
Expected: `WorksSearchQuerySchema is not defined` 또는 import error.

- [ ] **Step 3: Add schemas in `src/lib/validations.ts`**

`FeedQuerySchema` 정의 직후에 삽입:

```ts
export const WorksSearchQuerySchema = z.object({
  type: z.enum(['book', 'movie']).default('book'),
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const IsbnParamSchema = z.string().regex(/^\d{10}(\d{3})?$/)
export const TmdbIdParamSchema = z.coerce.number().int().positive()
```

- [ ] **Step 4: Run tests — pass**

```bash
pnpm test -- tests/unit/validations.test.ts 2>&1 | tail -10
```
Expected: 모든 새 describe 블록 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(works): add validation schemas for /works search and detail params"
```

---

## Task 2: External Book Lookup Adapter

**Files:**
- Create: `src/lib/external/book-lookup.ts`
- Modify: `src/lib/external/types.ts`

Naver Book Search의 `d_isbn` 파라미터로 단건 lookup. 검색 adapter와 분리 — 응답 shape이 같지만 의도(검색 vs lookup)와 사용 위치(`/works` detail 페이지 deep link)가 다름.

- [ ] **Step 1: Extend types**

`src/lib/external/types.ts` 끝에 추가:

```ts
export interface BookLookupResult {
  isbn: string
  title: string
  author: string
  publisher: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
}
```

- [ ] **Step 2: Implement adapter — `src/lib/external/book-lookup.ts`**

```ts
import type { BookLookupResult } from './types'

const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/book.json'

function stripBoldTags(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<\/?b>/g, '').trim()
}

function pickIsbn13(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.trim().split(/\s+/)
  return parts.find((p) => /^\d{13}$/.test(p)) ?? ''
}

function parsePubYear(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{4})/.exec(s.trim())
  if (!m) return undefined
  const y = Number(m[1])
  return y >= 1500 && y <= 2100 ? y : undefined
}

function safeCoverUrl(raw: string | undefined): string | undefined {
  const u = raw?.trim()
  if (!u) return undefined
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

interface NaverBookItem {
  title?: string
  image?: string
  author?: string
  publisher?: string
  pubdate?: string
  isbn?: string
  description?: string
}

interface NaverSearchResponse {
  items?: NaverBookItem[]
}

export async function lookupBookByIsbn(
  isbn: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BookLookupResult | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env vars not set')
  }
  if (!/^\d{10}(\d{3})?$/.test(isbn)) return null

  const url = new URL(NAVER_ENDPOINT)
  url.searchParams.set('d_isbn', isbn)
  url.searchParams.set('display', '1')

  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (res.status === 429) throw new Error('Naver rate limited')
  if (res.status === 401 || res.status === 403) throw new Error(`Naver auth ${res.status}`)
  if (res.status >= 500) throw new Error(`Naver upstream ${res.status}`)
  if (res.status >= 400) return null

  const data = (await res.json()) as NaverSearchResponse
  const item = data.items?.[0]
  if (!item) return null

  const normalizedIsbn = pickIsbn13(item.isbn) || isbn
  return {
    isbn: normalizedIsbn,
    title: stripBoldTags(item.title),
    author: stripBoldTags(item.author),
    publisher: item.publisher?.trim() || undefined,
    year: parsePubYear(item.pubdate),
    coverUrl: safeCoverUrl(item.image),
    description: item.description ? stripBoldTags(item.description) : undefined,
  }
}
```

- [ ] **Step 3: Quick smoke check via type check**

```bash
pnpm build 2>&1 | tail -10
```
Expected: type errors 없음 (build 통과까지 안 가도 됨 — 컴파일 에러가 없는지만).

- [ ] **Step 4: Commit**

```bash
git add src/lib/external/types.ts src/lib/external/book-lookup.ts
git commit -m "feat(works): add Naver book lookup adapter (single ISBN fetch)"
```

---

## Task 3: External Movie Lookup Adapter

**Files:**
- Create: `src/lib/external/movie-lookup.ts`
- Modify: `src/lib/external/types.ts`

TMDB `/movie/<id>` detail 엔드포인트.

- [ ] **Step 1: Extend types**

`src/lib/external/types.ts` 끝에 추가:

```ts
export interface MovieLookupResult {
  tmdbId: number
  title: string
  originalTitle: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
  externalRating: number | undefined  // TMDB vote_average (0–10)
}
```

- [ ] **Step 2: Implement adapter — `src/lib/external/movie-lookup.ts`**

```ts
import type { MovieLookupResult } from './types'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const POSTER_PREFIX = 'https://image.tmdb.org/t/p/w342'

interface TmdbMovieDetail {
  id?: number
  title?: string
  original_title?: string
  release_date?: string
  poster_path?: string | null
  overview?: string
  vote_average?: number
}

export async function lookupMovieByTmdbId(
  tmdbId: number,
  opts: { signal?: AbortSignal } = {},
): Promise<MovieLookupResult | null> {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB_API_KEY env var not set')
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null

  const url = new URL(`${TMDB_BASE}/movie/${tmdbId}`)
  url.searchParams.set('language', 'ko-KR')

  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  })

  if (res.status === 404) return null
  if (res.status === 429) throw new Error('TMDB rate limited')
  if (res.status === 401 || res.status === 403) throw new Error(`TMDB auth ${res.status}`)
  if (res.status >= 500) throw new Error(`TMDB upstream ${res.status}`)
  if (res.status >= 400) return null

  const data = (await res.json()) as TmdbMovieDetail
  if (!data.id || !data.title) return null

  const year =
    data.release_date && /^\d{4}-/.test(data.release_date)
      ? Number(data.release_date.slice(0, 4))
      : undefined

  return {
    tmdbId: data.id,
    title: data.title,
    originalTitle:
      data.original_title && data.original_title !== data.title ? data.original_title : undefined,
    year,
    coverUrl: data.poster_path ? `${POSTER_PREFIX}${data.poster_path}` : undefined,
    description: data.overview?.trim() || undefined,
    externalRating:
      typeof data.vote_average === 'number' && data.vote_average > 0
        ? Math.round(data.vote_average * 10) / 10
        : undefined,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/external/types.ts src/lib/external/movie-lookup.ts
git commit -m "feat(works): add TMDB movie lookup adapter (single id fetch)"
```

---

## Task 4: DB Queries — Books Aggregation (TDD)

**Files:**
- Modify: `src/lib/db/queries/books.ts`
- Test: `tests/integration/works-aggregation.test.ts`

신규 4함수 — `getBookAggregatesByIsbns`, `listBookReviewsByIsbn`, `countBookReviewsByIsbn`, `getBookRatingDistributionByIsbn`. 모두 **multitenant invariant 예외 — `authorUserId` 필터 없음**.

- [ ] **Step 1: Write failing tests — `tests/integration/works-aggregation.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getBookAggregatesByIsbns,
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

describe('books works aggregation', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('aggregates published items by isbn — counts + average rating', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const c = await createUser(db, { username: 'carol' })
    const t = Date.now()
    await createBook(db, a.id, { title: 'X', isbn: '9788937462788', rating: 10, isPublic: 1, publishedAt: t })
    await createBook(db, b.id, { title: 'X', isbn: '9788937462788', rating: 8, isPublic: 1, publishedAt: t - 1000 })
    await createBook(db, c.id, { title: 'X', isbn: '9788937462788', rating: 6, isPublic: 1, publishedAt: t - 2000 })

    const map = await getBookAggregatesByIsbns(db, ['9788937462788'])
    const agg = map.get('9788937462788')
    expect(agg?.cnt).toBe(3)
    expect(agg?.avg).toBe(8)
  })

  it('excludes non-public and unpublished', async () => {
    const a = await createUser(db, { username: 'alice' })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 9, isPublic: 1, publishedAt: Date.now() })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 5, isPublic: 0, publishedAt: null })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 7, isPublic: 1, publishedAt: null })

    const map = await getBookAggregatesByIsbns(db, ['9780000000001'])
    expect(map.get('9780000000001')?.cnt).toBe(1)
    expect(map.get('9780000000001')?.avg).toBe(9)
  })

  it('INCLUDES published items even when oneLineReview is null/empty', async () => {
    // 회귀 가드: 메모리 invariant works-review-aggregation-includes-no-text
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { isbn: '9780000000002', rating: 8, oneLineReview: null, isPublic: 1, publishedAt: Date.now() })
    await createBook(db, b.id, { isbn: '9780000000002', rating: 10, oneLineReview: '좋아요', isPublic: 1, publishedAt: Date.now() })

    const map = await getBookAggregatesByIsbns(db, ['9780000000002'])
    expect(map.get('9780000000002')?.cnt).toBe(2)
    expect(map.get('9780000000002')?.avg).toBe(9)
  })

  it('returns empty Map when isbn list is empty', async () => {
    const map = await getBookAggregatesByIsbns(db, [])
    expect(map.size).toBe(0)
  })

  it('listBookReviewsByIsbn returns rows ordered publishedAt DESC with displayName', async () => {
    const a = await createUser(db, { username: 'alice', displayName: '앨리스' })
    const b = await createUser(db, { username: 'bob', displayName: '밥' })
    const t = Date.now()
    await createBook(db, a.id, { isbn: '9780000000003', rating: 9, oneLineReview: '좋음', isPublic: 1, publishedAt: t })
    await createBook(db, b.id, { isbn: '9780000000003', rating: 7, oneLineReview: null, isPublic: 1, publishedAt: t - 1000 })

    const rows = await listBookReviewsByIsbn(db, '9780000000003', { limit: 10 })
    expect(rows.length).toBe(2)
    expect(rows[0].authorDisplayName).toBe('앨리스')
    expect(rows[0].oneLineReview).toBe('좋음')
    expect(rows[1].authorDisplayName).toBe('밥')
    expect(rows[1].oneLineReview).toBeNull()
  })

  it('countBookReviewsByIsbn matches list size', async () => {
    const a = await createUser(db, { username: 'alice' })
    for (let i = 0; i < 5; i++) {
      await createBook(db, a.id, { isbn: '9780000000004', rating: 8, isPublic: 1, publishedAt: Date.now() - i * 1000 })
    }
    expect(await countBookReviewsByIsbn(db, '9780000000004')).toBe(5)
  })

  it('getBookRatingDistributionByIsbn builds 1..10 buckets', async () => {
    const a = await createUser(db, { username: 'alice' })
    for (const r of [10, 10, 8, 8, 8, 5, 1]) {
      await createBook(db, a.id, { isbn: '9780000000005', rating: r, isPublic: 1, publishedAt: Date.now() })
    }
    const d = await getBookRatingDistributionByIsbn(db, '9780000000005')
    expect(d.cnt).toBe(7)
    expect(d.buckets[10]).toBe(2)
    expect(d.buckets[8]).toBe(3)
    expect(d.buckets[5]).toBe(1)
    expect(d.buckets[1]).toBe(1)
    expect(d.buckets[2]).toBe(0)
    expect(d.avg).toBeCloseTo(7.14, 1)
  })
})
```

**중요**: `createBook` factory에 `isbn`, `oneLineReview` 옵션이 이미 있는지 확인. 없으면 `tests/factories.ts`에 추가하는 보조 step 필요 (Task 4a 분리).

- [ ] **Step 1a (조건부): factory 확장 확인**

```bash
grep -n "isbn\|oneLineReview" /home/kjh/workspace/book-report/tests/factories.ts
```

`isbn`·`oneLineReview` 키워드가 createBook 옵션에 없으면 factory에 옵셔널 필드로 추가하고 별도 commit. (DB schema에 컬럼이 이미 있으니 factory만 갱신.)

- [ ] **Step 2: Run tests — expect failure (functions undefined)**

```bash
pnpm test -- tests/integration/works-aggregation.test.ts 2>&1 | tail -15
```
Expected: `getBookAggregatesByIsbns is not exported` 또는 유사.

- [ ] **Step 3: Implement queries in `src/lib/db/queries/books.ts`**

기존 `// ─── public feed ───` 섹션 아래에 다음 섹션 추가 (파일 끝부분의 적절한 위치, listGenresWithCounts 옆이나 직후):

```ts
// ─── works (external-id aggregation) ─────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 4개 함수는 authorUserId 필터가 없는
// cross-user read 경로 — /works 작품별 별점·한줄평 묶음용.
// 한줄평 유무와 무관하게 published 항목 모두 포함 (별점 집계 왜곡 방지).
// 다른 모든 user-scoped 쿼리는 본인 스코프 유지.

export type BookSiteAggregate = { avg: number; cnt: number }

export async function getBookAggregatesByIsbns(
  db: Db,
  isbns: string[],
): Promise<Map<string, BookSiteAggregate>> {
  const out = new Map<string, BookSiteAggregate>()
  if (isbns.length === 0) return out
  const rows = await db
    .select({
      isbn: books.isbn,
      avg: sql<number>`AVG(${books.rating})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(books)
    .where(
      and(
        eq(books.isPublic, 1),
        sql`${books.publishedAt} IS NOT NULL`,
        inArray(books.isbn, isbns),
      ),
    )
    .groupBy(books.isbn)
  for (const r of rows) {
    if (r.isbn) out.set(r.isbn, { avg: Number(r.avg), cnt: Number(r.cnt) })
  }
  return out
}

export type BookReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

export async function listBookReviewsByIsbn(
  db: Db,
  isbn: string,
  opts: { limit: number; offset?: number },
): Promise<BookReviewItem[]> {
  let q = db
    .select({
      id: books.id,
      slug: books.slug,
      oneLineReview: books.oneLineReview,
      rating: books.rating,
      publishedAt: books.publishedAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(books)
    .innerJoin(users, eq(books.authorUserId, users.id))
    .where(
      and(
        eq(books.isPublic, 1),
        sql`${books.publishedAt} IS NOT NULL`,
        eq(books.isbn, isbn),
      ),
    )
    .orderBy(desc(books.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countBookReviewsByIsbn(db: Db, isbn: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(books)
    .where(
      and(
        eq(books.isPublic, 1),
        sql`${books.publishedAt} IS NOT NULL`,
        eq(books.isbn, isbn),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export type RatingDistribution = {
  avg: number
  cnt: number
  buckets: Record<number, number>  // keys 1..10
}

export async function getBookRatingDistributionByIsbn(
  db: Db,
  isbn: string,
): Promise<RatingDistribution> {
  const rows = await db
    .select({
      rating: books.rating,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(books)
    .where(
      and(
        eq(books.isPublic, 1),
        sql`${books.publishedAt} IS NOT NULL`,
        eq(books.isbn, isbn),
      ),
    )
    .groupBy(books.rating)

  const buckets: Record<number, number> = {}
  for (let r = 1; r <= 10; r++) buckets[r] = 0
  let total = 0
  let weightedSum = 0
  for (const row of rows) {
    const r = Number(row.rating)
    const c = Number(row.cnt)
    buckets[r] = c
    total += c
    weightedSum += r * c
  }
  return {
    avg: total === 0 ? 0 : weightedSum / total,
    cnt: total,
    buckets,
  }
}
```

`inArray` import 확인 — 파일 상단 drizzle import 줄에 `inArray`가 없으면 추가:

```ts
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
```

- [ ] **Step 4: Re-export from queries entry**

`src/lib/db/queries/index.ts` (또는 barrel 파일)에서 모듈 re-export 패턴을 확인하고 동일하게 노출. 기존 `listRecentPublicBooks` 와 같은 경로로 export되도록.

`grep -n "listRecentPublicBooks\|listBookReviewsByIsbn" src/lib/db/queries/index.ts` 로 barrel 파일이 어떻게 노출하는지 확인. 일반적으로 `export * from './books'` 패턴이면 자동 노출.

- [ ] **Step 5: Run tests — pass**

```bash
pnpm test -- tests/integration/works-aggregation.test.ts 2>&1 | tail -15
```
Expected: 모든 it() PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries/books.ts src/lib/db/queries/index.ts tests/integration/works-aggregation.test.ts tests/factories.ts
git commit -m "feat(works): add books aggregation queries (per-isbn avg, count, list, distribution)

- 멀티테넌트 invariant 예외 4함수 추가 (authorUserId 필터 없음)
- WHERE 표준: isPublic=1 AND publishedAt IS NOT NULL AND isbn=?
- 한줄평 null인 published도 집계 포함 — 별점 왜곡 방지
- (isPublic, isbn) 복합 인덱스 hit"
```

---

## Task 5: DB Queries — Movies Aggregation (Mirror)

**Files:**
- Modify: `src/lib/db/queries/movies.ts`
- Test: `tests/integration/works-aggregation.test.ts` (append movie suite)

Task 4와 같은 패턴, `isbn: string` → `tmdbId: number` 치환.

- [ ] **Step 1: Append movie tests to existing aggregation file**

`tests/integration/works-aggregation.test.ts` 파일 끝에 `describe('movies works aggregation', ...)` 블록 추가. 위 Task 4 테스트들을 책→영화 미러:

```ts
import {
  getMovieAggregatesByTmdbIds,
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'
import { createMovie } from '../factories'

describe('movies works aggregation', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('aggregates published items by tmdbId', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createMovie(db, a.id, { tmdbId: 157336, rating: 10, isPublic: 1, publishedAt: Date.now() })
    await createMovie(db, b.id, { tmdbId: 157336, rating: 8, isPublic: 1, publishedAt: Date.now() - 1000 })

    const map = await getMovieAggregatesByTmdbIds(db, [157336])
    expect(map.get(157336)?.cnt).toBe(2)
    expect(map.get(157336)?.avg).toBe(9)
  })

  it('INCLUDES published movies with null oneLineReview (regression guard)', async () => {
    const a = await createUser(db, { username: 'alice' })
    await createMovie(db, a.id, { tmdbId: 27205, rating: 9, oneLineReview: null, isPublic: 1, publishedAt: Date.now() })
    await createMovie(db, a.id, { tmdbId: 27205, rating: 7, oneLineReview: '인셉션 굿', isPublic: 1, publishedAt: Date.now() })

    const d = await getMovieRatingDistributionByTmdbId(db, 27205)
    expect(d.cnt).toBe(2)
    expect(d.avg).toBe(8)
  })

  it('listMovieReviewsByTmdbId joins username and orders DESC', async () => {
    const a = await createUser(db, { username: 'alice', displayName: '앨리스' })
    await createMovie(db, a.id, { tmdbId: 99999, rating: 10, oneLineReview: '★', isPublic: 1, publishedAt: Date.now() })
    const rows = await listMovieReviewsByTmdbId(db, 99999, { limit: 10 })
    expect(rows[0].authorDisplayName).toBe('앨리스')
    expect(rows[0].authorUsername).toBe('alice')
  })
})
```

- [ ] **Step 2: Implement in `src/lib/db/queries/movies.ts`**

같은 패턴, `movies` 테이블·`tmdbId` 컬럼 사용:

```ts
// ─── works (external-id aggregation) ─────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: /works 작품별 cross-user read.
// 한줄평 null인 published도 별점 집계에 포함.

export type MovieSiteAggregate = { avg: number; cnt: number }

export async function getMovieAggregatesByTmdbIds(
  db: Db,
  tmdbIds: number[],
): Promise<Map<number, MovieSiteAggregate>> {
  const out = new Map<number, MovieSiteAggregate>()
  if (tmdbIds.length === 0) return out
  const rows = await db
    .select({
      tmdbId: movies.tmdbId,
      avg: sql<number>`AVG(${movies.rating})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(movies)
    .where(
      and(
        eq(movies.isPublic, 1),
        sql`${movies.publishedAt} IS NOT NULL`,
        inArray(movies.tmdbId, tmdbIds),
      ),
    )
    .groupBy(movies.tmdbId)
  for (const r of rows) {
    if (r.tmdbId != null) out.set(r.tmdbId, { avg: Number(r.avg), cnt: Number(r.cnt) })
  }
  return out
}

export type MovieReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

export async function listMovieReviewsByTmdbId(
  db: Db,
  tmdbId: number,
  opts: { limit: number; offset?: number },
): Promise<MovieReviewItem[]> {
  let q = db
    .select({
      id: movies.id,
      slug: movies.slug,
      oneLineReview: movies.oneLineReview,
      rating: movies.rating,
      publishedAt: movies.publishedAt,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
    })
    .from(movies)
    .innerJoin(users, eq(movies.authorUserId, users.id))
    .where(
      and(
        eq(movies.isPublic, 1),
        sql`${movies.publishedAt} IS NOT NULL`,
        eq(movies.tmdbId, tmdbId),
      ),
    )
    .orderBy(desc(movies.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countMovieReviewsByTmdbId(db: Db, tmdbId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(movies)
    .where(
      and(
        eq(movies.isPublic, 1),
        sql`${movies.publishedAt} IS NOT NULL`,
        eq(movies.tmdbId, tmdbId),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export async function getMovieRatingDistributionByTmdbId(
  db: Db,
  tmdbId: number,
): Promise<RatingDistribution> {
  const rows = await db
    .select({
      rating: movies.rating,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(movies)
    .where(
      and(
        eq(movies.isPublic, 1),
        sql`${movies.publishedAt} IS NOT NULL`,
        eq(movies.tmdbId, tmdbId),
      ),
    )
    .groupBy(movies.rating)
  const buckets: Record<number, number> = {}
  for (let r = 1; r <= 10; r++) buckets[r] = 0
  let total = 0
  let weightedSum = 0
  for (const row of rows) {
    const r = Number(row.rating)
    const c = Number(row.cnt)
    buckets[r] = c
    total += c
    weightedSum += r * c
  }
  return { avg: total === 0 ? 0 : weightedSum / total, cnt: total, buckets }
}
```

`RatingDistribution` 타입은 books.ts에서 export — `import type { RatingDistribution } from './books'` 한 줄 위에 추가.

`inArray` import 확인.

- [ ] **Step 3: Run tests — pass**

```bash
pnpm test -- tests/integration/works-aggregation.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/movies.ts tests/integration/works-aggregation.test.ts
git commit -m "feat(works): add movies aggregation queries (mirror of books, tmdbId-keyed)"
```

---

## Task 6: External Lookup API Routes

**Files:**
- Create: `src/app/api/external/books/lookup/route.ts`
- Create: `src/app/api/external/movies/lookup/route.ts`

`requireUser()` + path/query validation + adapter 호출. CSRF는 GET이라 미들웨어가 통과.

- [ ] **Step 1: Books lookup — `src/app/api/external/books/lookup/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { IsbnParamSchema } from '@/lib/validations'
import { lookupBookByIsbn } from '@/lib/external/book-lookup'

const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = IsbnParamSchema.safeParse(url.searchParams.get('isbn') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid isbn' }, { status: 400 })
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const result = await lookupBookByIsbn(parsed.data, { signal: ctl.signal })
      if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('[external/books/lookup] error:', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
```

- [ ] **Step 2: Movies lookup — `src/app/api/external/movies/lookup/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { TmdbIdParamSchema } from '@/lib/validations'
import { lookupMovieByTmdbId } from '@/lib/external/movie-lookup'

const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = TmdbIdParamSchema.safeParse(url.searchParams.get('tmdbId') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid tmdbId' }, { status: 400 })
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const result = await lookupMovieByTmdbId(parsed.data, { signal: ctl.signal })
      if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('[external/movies/lookup] error:', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
```

- [ ] **Step 3: Build check**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/external/books/lookup src/app/api/external/movies/lookup
git commit -m "feat(works): add external lookup API routes (book by ISBN, movie by tmdbId)"
```

---

## Task 7: /api/works/search Route

**Files:**
- Create: `src/app/api/works/search/route.ts`

외부 검색 + 사이트 집계 합쳐 단일 응답. 클라이언트 인터랙션·테스트용. 페이지 컴포넌트는 같은 로직을 직접 호출하지만 라우트로도 노출.

- [ ] **Step 1: Implement route**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { WorksSearchQuerySchema } from '@/lib/validations'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'
import {
  getBookAggregatesByIsbns,
  getMovieAggregatesByTmdbIds,
} from '@/lib/db/queries'

const PAGE_SIZE = 24
const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = WorksSearchQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid query' }, { status: 400 })
    }
    const { type, q, page = 1 } = parsed.data
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      if (type === 'book') {
        const externalItems = await searchBooksExternal(q, { limit: PAGE_SIZE, signal: ctl.signal })
        const isbns = Array.from(new Set(externalItems.map((it) => it.externalId).filter(Boolean)))
        const agg = await getBookAggregatesByIsbns(db, isbns)
        const items = externalItems.map((it) => ({
          ...it,
          siteAgg: agg.get(it.externalId) ?? { avg: 0, cnt: 0 },
        }))
        return NextResponse.json({ items, total: items.length, page, pageSize: PAGE_SIZE, type })
      }
      const externalItems = await searchMoviesExternal(q, { limit: PAGE_SIZE, signal: ctl.signal })
      const tmdbIds = Array.from(new Set(externalItems.map((it) => it.externalId)))
      const agg = await getMovieAggregatesByTmdbIds(db, tmdbIds)
      const items = externalItems.map((it) => ({
        ...it,
        siteAgg: agg.get(it.externalId) ?? { avg: 0, cnt: 0 },
      }))
      return NextResponse.json({ items, total: items.length, page, pageSize: PAGE_SIZE, type })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('[works/search] error:', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/works/search/route.ts
git commit -m "feat(works): add /api/works/search route (external search + site aggregate merge)"
```

---

## Task 8: /api/works/{book,movie}/[id] Routes

**Files:**
- Create: `src/app/api/works/book/[isbn]/route.ts`
- Create: `src/app/api/works/movie/[tmdbId]/route.ts`

상세 페이지 리뷰 리스트 페이지네이션 + 분포 한 응답.

- [ ] **Step 1: Books detail — `src/app/api/works/book/[isbn]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { IsbnParamSchema } from '@/lib/validations'
import {
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
} from '@/lib/db/queries'

const PAGE_SIZE = 24

export async function GET(req: Request, { params }: { params: Promise<{ isbn: string }> }) {
  try {
    await requireUser()
    const { isbn: rawIsbn } = await params
    const parsedIsbn = IsbnParamSchema.safeParse(rawIsbn)
    if (!parsedIsbn.success) {
      return NextResponse.json({ error: 'invalid isbn' }, { status: 400 })
    }
    const url = new URL(req.url)
    const pageRaw = Number(url.searchParams.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listBookReviewsByIsbn(db, parsedIsbn.data, { limit: PAGE_SIZE, offset }),
      countBookReviewsByIsbn(db, parsedIsbn.data),
      getBookRatingDistributionByIsbn(db, parsedIsbn.data),
    ])
    return NextResponse.json({
      isbn: parsedIsbn.data,
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      distribution,
    })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 2: Movies detail — `src/app/api/works/movie/[tmdbId]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { TmdbIdParamSchema } from '@/lib/validations'
import {
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'

const PAGE_SIZE = 24

export async function GET(req: Request, { params }: { params: Promise<{ tmdbId: string }> }) {
  try {
    await requireUser()
    const { tmdbId: rawTmdbId } = await params
    const parsedTmdb = TmdbIdParamSchema.safeParse(rawTmdbId)
    if (!parsedTmdb.success) {
      return NextResponse.json({ error: 'invalid tmdbId' }, { status: 400 })
    }
    const url = new URL(req.url)
    const pageRaw = Number(url.searchParams.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listMovieReviewsByTmdbId(db, parsedTmdb.data, { limit: PAGE_SIZE, offset }),
      countMovieReviewsByTmdbId(db, parsedTmdb.data),
      getMovieRatingDistributionByTmdbId(db, parsedTmdb.data),
    ])
    return NextResponse.json({
      tmdbId: parsedTmdb.data,
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      distribution,
    })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/works/book src/app/api/works/movie
git commit -m "feat(works): add /api/works/{book,movie}/<id> detail routes with pagination + distribution"
```

---

## Task 9: UI Components — RatingDistribution + ReviewListItem

**Files:**
- Create: `src/components/works/RatingDistribution.tsx`
- Create: `src/components/works/ReviewListItem.tsx`

작은 server component 두 개.

- [ ] **Step 1: `src/components/works/RatingDistribution.tsx`**

```tsx
import type { RatingDistribution as RatingDistType } from '@/lib/db/queries'

interface Props {
  distribution: RatingDistType
}

export function RatingDistribution({ distribution }: Props) {
  if (distribution.cnt === 0) return null
  const maxBucket = Math.max(...Object.values(distribution.buckets))
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 10 }, (_, i) => 10 - i).map((rating) => {
        const count = distribution.buckets[rating] ?? 0
        const ratio = maxBucket === 0 ? 0 : (count / maxBucket) * 100
        return (
          <div key={rating} className="flex items-center gap-3 text-[12px] font-tabular">
            <span className="w-6 text-right text-[var(--color-text-muted)]">{rating}</span>
            <div className="flex-1 h-3 rounded-sm bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-toss-blue)]"
                style={{ width: `${ratio}%` }}
              />
            </div>
            <span className="w-8 text-right text-[var(--color-text-weak)] tabular-nums">
              {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: `src/components/works/ReviewListItem.tsx`**

```tsx
import Link from 'next/link'
import { RatingStars } from '../RatingStars'

interface Props {
  item: {
    rating: number
    oneLineReview: string | null
    publishedAt: number
    authorUsername: string
    authorDisplayName: string
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function ReviewListItem({ item }: Props) {
  return (
    <article className="py-4 border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center justify-between gap-3">
        <RatingStars value={item.rating} size="sm" />
        <Link
          href={`/u/${item.authorUsername}`}
          className="text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-toss-blue)] transition"
        >
          {item.authorDisplayName}
        </Link>
      </div>
      {item.oneLineReview && (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-strong)]">
          {item.oneLineReview}
        </p>
      )}
      <time className="mt-2 block text-[11px] text-[var(--color-text-weak)] font-tabular tabular-nums">
        {formatDate(item.publishedAt)}
      </time>
    </article>
  )
}
```

**중요**: `/u/<username>` 라우트 존재 확인. 없으면 링크는 그냥 plain text로 갱신 (해당 라우트가 별도 PR이라면).

```bash
ls src/app/u/ 2>&1
```

존재 안 하면 `<Link>` 대신 `<span>`로 교체.

- [ ] **Step 3: Type check**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/components/works/RatingDistribution.tsx src/components/works/ReviewListItem.tsx
git commit -m "feat(works): add RatingDistribution + ReviewListItem components"
```

---

## Task 10: UI Components — WorksSearchCard + WorksDetailHeader

**Files:**
- Create: `src/components/works/WorksSearchCard.tsx`
- Create: `src/components/works/WorksDetailHeader.tsx`

- [ ] **Step 1: `src/components/works/WorksSearchCard.tsx`**

```tsx
import Link from 'next/link'
import Image from 'next/image'

interface BookCardProps {
  type: 'book'
  externalId: string
  title: string
  byline: string
  year: number | undefined
  coverUrl: string | undefined
  siteAgg: { avg: number; cnt: number }
}

interface MovieCardProps {
  type: 'movie'
  externalId: number
  title: string
  byline: string
  year: number | undefined
  coverUrl: string | undefined
  siteAgg: { avg: number; cnt: number }
}

type Props = BookCardProps | MovieCardProps

export function WorksSearchCard(props: Props) {
  const href =
    props.type === 'book' ? `/works/book/${props.externalId}` : `/works/movie/${props.externalId}`
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition"
    >
      <div className="flex gap-3">
        {props.coverUrl ? (
          <Image
            src={props.coverUrl}
            alt=""
            width={56}
            height={84}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        ) : (
          <div className="w-14 h-21 flex-shrink-0 rounded-sm bg-[var(--color-surface-2)]" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-[var(--color-text-strong)] line-clamp-2">
            {props.title}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--color-text-muted)] line-clamp-1">
            {props.byline}
            {props.year ? ` · ${props.year}` : ''}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[12px]">
            {props.siteAgg.cnt > 0 ? (
              <>
                <span className="font-semibold text-[var(--color-text-strong)] font-tabular tabular-nums">
                  ★ {props.siteAgg.avg.toFixed(1)}
                </span>
                <span className="text-[var(--color-text-weak)] font-tabular tabular-nums">
                  📝 {props.siteAgg.cnt}
                </span>
              </>
            ) : (
              <span className="text-[var(--color-text-weak)]">아직 평가 없음</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: `src/components/works/WorksDetailHeader.tsx`**

```tsx
import Image from 'next/image'

interface Props {
  title: string
  subtitle?: string
  coverUrl?: string
  byline?: string
  description?: string
  externalRating?: number
  siteAvg: number
  siteCnt: number
}

export function WorksDetailHeader(props: Props) {
  return (
    <header className="flex flex-col gap-6 md:flex-row">
      {props.coverUrl ? (
        <Image
          src={props.coverUrl}
          alt=""
          width={160}
          height={240}
          className="flex-shrink-0 rounded-[var(--radius-toss)] object-cover shadow-[var(--shadow-toss)]"
        />
      ) : (
        <div className="w-40 h-60 flex-shrink-0 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)]" />
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">{props.title}</h1>
          {props.subtitle && (
            <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">{props.subtitle}</p>
          )}
          {props.byline && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">{props.byline}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[14px]">
          {typeof props.externalRating === 'number' && (
            <div>
              <span className="text-[var(--color-text-weak)]">외부 평점</span>
              <span className="ml-2 font-bold text-[var(--color-text-strong)] font-tabular tabular-nums">
                ★ {props.externalRating.toFixed(1)}
              </span>
            </div>
          )}
          <div>
            <span className="text-[var(--color-text-weak)]">사이트 평균</span>
            {props.siteCnt > 0 ? (
              <span className="ml-2 font-bold text-[var(--color-text-strong)] font-tabular tabular-nums">
                ★ {props.siteAvg.toFixed(1)} · {props.siteCnt}명
              </span>
            ) : (
              <span className="ml-2 text-[var(--color-text-weak)]">아직 평가 없음</span>
            )}
          </div>
        </div>
        {props.description && (
          <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)] line-clamp-5">
            {props.description}
          </p>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/works/WorksSearchCard.tsx src/components/works/WorksDetailHeader.tsx
git commit -m "feat(works): add WorksSearchCard + WorksDetailHeader components"
```

---

## Task 11: WorksSearchBar (Client Component)

**Files:**
- Create: `src/components/works/WorksSearchBar.tsx`

URL-driven submit input.

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  type: 'book' | 'movie'
  initialQuery: string
}

export function WorksSearchBar({ type, initialQuery }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    const params = new URLSearchParams({ type, q: trimmed })
    router.push(`/works?${params.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
        placeholder={type === 'book' ? '책 제목·저자 검색' : '영화 제목 검색'}
        className="flex-1 h-11 px-4 rounded-[var(--radius-toss)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      />
      <button
        type="submit"
        className="h-11 px-5 rounded-[var(--radius-toss)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        검색
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/works/WorksSearchBar.tsx
git commit -m "feat(works): add WorksSearchBar client component (submit-only, no debounce)"
```

---

## Task 12: /works Search Page

**Files:**
- Create: `src/app/works/page.tsx`

Server component — 외부 검색 + 사이트 집계 merge + 렌더.

- [ ] **Step 1: Implement**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { WorksSearchQuerySchema } from '@/lib/validations'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'
import {
  getBookAggregatesByIsbns,
  getMovieAggregatesByTmdbIds,
} from '@/lib/db/queries'
import { WorksSearchBar } from '@/components/works/WorksSearchBar'
import { WorksSearchCard } from '@/components/works/WorksSearchCard'
import { EmptyState } from '@/components/EmptyState'

type SP = { searchParams: Promise<{ type?: string; q?: string; page?: string }> }

export default async function WorksSearchPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/works')

  const sp = await searchParams
  const parsed = WorksSearchQuerySchema.safeParse({ type: sp.type, q: sp.q ?? '', page: sp.page })
  const type = parsed.success ? parsed.data.type : 'book'
  const q = parsed.success ? parsed.data.q : ''

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          작품 검색
        </h1>
      </div>

      <div className="flex gap-2">
        <TabLink href={`/works?type=book${q ? `&q=${encodeURIComponent(q)}` : ''}`} active={type === 'book'} label="📚 책" />
        <TabLink href={`/works?type=movie${q ? `&q=${encodeURIComponent(q)}` : ''}`} active={type === 'movie'} label="🎬 영화" />
      </div>

      <WorksSearchBar type={type} initialQuery={q} />

      {!q ? (
        <EmptyState emoji="🔍" title="키워드로 검색해보세요" description={type === 'book' ? '제목이나 저자를 입력해보세요' : '영화 제목을 입력해보세요'} />
      ) : type === 'book' ? (
        <BookResults q={q} />
      ) : (
        <MovieResults q={q} />
      )}
    </div>
  )
}

async function BookResults({ q }: { q: string }) {
  let items
  try {
    items = await searchBooksExternal(q, { limit: 24 })
  } catch (e) {
    console.error('[works/search] books external error:', e)
    return <EmptyState emoji="📡" title="외부 검색 서비스 일시 불가" description="잠시 후 다시 시도해주세요" />
  }
  if (items.length === 0) {
    return <EmptyState emoji="📭" title="검색 결과가 없어요" description={`"${q}"에 대한 책을 찾지 못했어요`} />
  }
  const isbns = Array.from(new Set(items.map((it) => it.externalId).filter(Boolean)))
  const agg = await getBookAggregatesByIsbns(db, isbns)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map((it) => (
        <WorksSearchCard
          key={it.externalId}
          type="book"
          externalId={it.externalId}
          title={it.title}
          byline={it.byline}
          year={it.year}
          coverUrl={it.coverUrl}
          siteAgg={agg.get(it.externalId) ?? { avg: 0, cnt: 0 }}
        />
      ))}
    </div>
  )
}

async function MovieResults({ q }: { q: string }) {
  let items
  try {
    items = await searchMoviesExternal(q, { limit: 24 })
  } catch (e) {
    console.error('[works/search] movies external error:', e)
    return <EmptyState emoji="📡" title="외부 검색 서비스 일시 불가" description="잠시 후 다시 시도해주세요" />
  }
  if (items.length === 0) {
    return <EmptyState emoji="📭" title="검색 결과가 없어요" description={`"${q}"에 대한 영화를 찾지 못했어요`} />
  }
  const tmdbIds = Array.from(new Set(items.map((it) => it.externalId)))
  const agg = await getMovieAggregatesByTmdbIds(db, tmdbIds)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map((it) => (
        <WorksSearchCard
          key={it.externalId}
          type="movie"
          externalId={it.externalId}
          title={it.title}
          byline={it.byline}
          year={it.year}
          coverUrl={it.coverUrl}
          siteAgg={agg.get(it.externalId) ?? { avg: 0, cnt: 0 }}
        />
      ))}
    </div>
  )
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        'h-9 px-4 inline-flex items-center rounded-full text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 ' +
        (active
          ? 'bg-[var(--color-toss-blue)] text-white'
          : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]')
      }
    >
      {label}
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/works/page.tsx
git commit -m "feat(works): add /works search page with book/movie tabs"
```

---

## Task 13: Detail Pages — book/[isbn] + movie/[tmdbId]

**Files:**
- Create: `src/app/works/book/[isbn]/page.tsx`
- Create: `src/app/works/movie/[tmdbId]/page.tsx`

- [ ] **Step 1: Books detail**

```tsx
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { IsbnParamSchema } from '@/lib/validations'
import { lookupBookByIsbn } from '@/lib/external/book-lookup'
import {
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
} from '@/lib/db/queries'
import { WorksDetailHeader } from '@/components/works/WorksDetailHeader'
import { RatingDistribution } from '@/components/works/RatingDistribution'
import { ReviewListItem } from '@/components/works/ReviewListItem'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'

const PAGE_SIZE = 24

type SP = {
  params: Promise<{ isbn: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function WorksBookDetailPage({ params, searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { isbn: rawIsbn } = await params
  const parsedIsbn = IsbnParamSchema.safeParse(rawIsbn)
  if (!parsedIsbn.success) notFound()
  const isbn = parsedIsbn.data

  const sp = await searchParams
  const pageRaw = Number(sp.page ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const offset = (page - 1) * PAGE_SIZE

  const [meta, items, total, distribution] = await Promise.all([
    safeBookLookup(isbn),
    listBookReviewsByIsbn(db, isbn, { limit: PAGE_SIZE, offset }),
    countBookReviewsByIsbn(db, isbn),
    getBookRatingDistributionByIsbn(db, isbn),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <WorksDetailHeader
        title={meta?.title ?? `ISBN ${isbn}`}
        byline={meta?.author}
        coverUrl={meta?.coverUrl}
        description={meta?.description}
        siteAvg={distribution.avg}
        siteCnt={distribution.cnt}
      />

      {distribution.cnt > 0 ? (
        <section>
          <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">별점 분포</h2>
          <RatingDistribution distribution={distribution} />
        </section>
      ) : null}

      <section>
        <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">
          한줄평 {total > 0 ? total : ''}
        </h2>
        {items.length === 0 ? (
          <EmptyState emoji="📝" title="아직 평가가 없어요" description="이 책을 읽고 별점·한줄평을 남겨보세요" />
        ) : (
          <>
            <ul>
              {items.map((it) => (
                <li key={it.id}>
                  <ReviewListItem item={it} />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} basePath={`/works/book/${isbn}`} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

async function safeBookLookup(isbn: string) {
  try {
    return await lookupBookByIsbn(isbn)
  } catch (e) {
    console.error('[works/book] lookup error:', e)
    return null
  }
}
```

- [ ] **Step 2: Movies detail**

```tsx
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { TmdbIdParamSchema } from '@/lib/validations'
import { lookupMovieByTmdbId } from '@/lib/external/movie-lookup'
import {
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'
import { WorksDetailHeader } from '@/components/works/WorksDetailHeader'
import { RatingDistribution } from '@/components/works/RatingDistribution'
import { ReviewListItem } from '@/components/works/ReviewListItem'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'

const PAGE_SIZE = 24

type SP = {
  params: Promise<{ tmdbId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function WorksMovieDetailPage({ params, searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { tmdbId: rawTmdbId } = await params
  const parsedTmdb = TmdbIdParamSchema.safeParse(rawTmdbId)
  if (!parsedTmdb.success) notFound()
  const tmdbId = parsedTmdb.data

  const sp = await searchParams
  const pageRaw = Number(sp.page ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const offset = (page - 1) * PAGE_SIZE

  const [meta, items, total, distribution] = await Promise.all([
    safeMovieLookup(tmdbId),
    listMovieReviewsByTmdbId(db, tmdbId, { limit: PAGE_SIZE, offset }),
    countMovieReviewsByTmdbId(db, tmdbId),
    getMovieRatingDistributionByTmdbId(db, tmdbId),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <WorksDetailHeader
        title={meta?.title ?? `TMDB ${tmdbId}`}
        subtitle={meta?.originalTitle}
        coverUrl={meta?.coverUrl}
        description={meta?.description}
        externalRating={meta?.externalRating}
        siteAvg={distribution.avg}
        siteCnt={distribution.cnt}
      />

      {distribution.cnt > 0 ? (
        <section>
          <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">별점 분포</h2>
          <RatingDistribution distribution={distribution} />
        </section>
      ) : null}

      <section>
        <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">
          한줄평 {total > 0 ? total : ''}
        </h2>
        {items.length === 0 ? (
          <EmptyState emoji="📝" title="아직 평가가 없어요" description="이 영화를 보고 별점·한줄평을 남겨보세요" />
        ) : (
          <>
            <ul>
              {items.map((it) => (
                <li key={it.id}>
                  <ReviewListItem item={it} />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} basePath={`/works/movie/${tmdbId}`} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

async function safeMovieLookup(tmdbId: number) {
  try {
    return await lookupMovieByTmdbId(tmdbId)
  } catch (e) {
    console.error('[works/movie] lookup error:', e)
    return null
  }
}
```

- [ ] **Step 3: Build check**

```bash
pnpm build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/app/works/book src/app/works/movie
git commit -m "feat(works): add detail pages for /works/book/<isbn> and /works/movie/<tmdbId>"
```

---

## Task 14: Nav Integration

**Files:**
- Modify: `src/app/layout.tsx`

`/movies` 와 `/writings` 사이에 `/works` 링크 삽입.

- [ ] **Step 1: Edit `src/app/layout.tsx`**

기존 `/movies` Link 직후에 다음 Link 추가:

```tsx
<Link
  href="/works"
  className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
>
  🔍 작품 검색
</Link>
```

- [ ] **Step 2: Build check + manual smoke**

```bash
pnpm dev &  # 백그라운드로 dev 서버
sleep 8
curl -s http://localhost:3000/works -L | head -20
# 헤더에 "작품 검색" 노출 확인
pkill -f "next dev"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(works): add /works nav link between movies and writings"
```

---

## Task 15: E2E Tests

**Files:**
- Create: `tests/e2e/works-search.spec.ts`
- Create: `tests/e2e/works-detail-empty.spec.ts`

기존 `tests/e2e/public-feed.spec.ts` 패턴 따라가기 — 로그인 헬퍼 활용.

- [ ] **Step 1: `tests/e2e/works-search.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'

test('works search → detail navigation', async ({ page }) => {
  await loginAsTestUser(page)
  await page.goto('/works?type=book')
  await page.getByPlaceholder('책 제목·저자 검색').fill('어린왕자')
  await page.getByRole('button', { name: '검색' }).click()
  // 외부 API 결과 도착 대기
  await expect(page.getByRole('heading', { name: /어린왕자/i }).first()).toBeVisible({ timeout: 10000 })
  // 첫 카드 클릭
  await page.locator('a[href^="/works/book/"]').first().click()
  await expect(page).toHaveURL(/\/works\/book\/\d{10,13}/)
  await expect(page.getByRole('heading', { name: /한줄평/i })).toBeVisible()
})
```

- [ ] **Step 2: `tests/e2e/works-detail-empty.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'

test('works detail with no site reviews shows empty state', async ({ page }) => {
  await loginAsTestUser(page)
  // 사이트 한줄평 없을 ISBN deep link
  await page.goto('/works/book/9999999999999')
  await expect(page.getByText('아직 평가가 없어요')).toBeVisible({ timeout: 10000 })
})
```

`loginAsTestUser` helper가 없으면 기존 e2e 테스트 (public-feed.spec.ts 등)에서 사용하는 로그인 헬퍼 경로 확인 후 동일하게 import. 없으면 인라인으로 login 수행.

- [ ] **Step 3: Run E2E (앱 dev 띄운 상태에서)**

```bash
pnpm e2e tests/e2e/works-search.spec.ts tests/e2e/works-detail-empty.spec.ts 2>&1 | tail -20
```

flaky 가능성 (외부 API 의존) — 2회 재시도 후에도 실패하면 외부 API 호출 부분을 mock으로 격리 고려 (별도 PR).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/works-search.spec.ts tests/e2e/works-detail-empty.spec.ts
git commit -m "test(e2e): add works search + empty detail flows"
```

---

## Task 16: README Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append `/works` section**

기존 `/feed` 섹션 옆에 한 문단 추가:

```md
### `/works` — 작품 검색

외부 API(Naver Book Search / TMDB)로 책·영화를 검색하면, 사이트 사용자들이 그 작품에
남긴 별점·한줄평을 모아 볼 수 있다. URL 영구화를 위해 외부 ID(ISBN, tmdbId)를
사용한다.

- `/works?type=book&q=어린왕자` — 검색
- `/works/book/<isbn>` — 책 상세 (사이트 별점 분포 + 한줄평 리스트)
- `/works/movie/<tmdbId>` — 영화 상세

요구 환경 변수는 기존과 동일 — `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`, `TMDB_API_KEY`.
DB 마이그레이션 없음.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(works): document /works section in README"
```

---

## Task 17: Final — Branch-wide `/code-review` Phase

브랜치 전체에 대해 multi-agent code review 실행, 발견된 defects 우선순위별 commit.

- [ ] **Step 1: Push branch to remote**

```bash
git push -u origin feat/works-search
```

- [ ] **Step 2: Run branch-scoped code review**

본 세션에서 `/code-review` slash command 또는 `/ultrareview` 호출:

```
/code-review
```

또는 더 광범위한 multi-agent review를 원하면 `/ultrareview` (cloud-hosted, billed) 호출 — 자동 launch는 못 하므로 사용자가 직접 트리거.

- [ ] **Step 3: Categorize findings**

리뷰 결과를 HIGH / MEDIUM / LOW severity로 분류. 본 프로젝트의 기존 패턴:

- HIGH: 멀티테넌트·인증·invariant 위반, 데이터 누출, SQL injection 표면
- MEDIUM: validation gap, race condition, error handling 누락, UX 회귀
- LOW: comment·log·UI polish, dead code

- [ ] **Step 4: Fix HIGH severity → commit**

```bash
# 수정 후
git add <files>
git commit -m "fix(review): HIGH severity — <간략 요약>

<bullet 리스트 of fixes>"
```

- [ ] **Step 5: Fix MEDIUM severity → commit**

```bash
git commit -m "fix(review): MEDIUM severity — <간략 요약>

<bullet 리스트>"
```

- [ ] **Step 6: Fix LOW severity → commit**

```bash
git commit -m "fix(review): LOW severity — <간략 요약>

<bullet 리스트>"
```

- [ ] **Step 7: Final verify — full test suite + build**

```bash
pnpm lint 2>&1 | tail -5
pnpm test 2>&1 | tail -10
pnpm build 2>&1 | tail -10
```

세 명령 모두 통과해야 머지 준비 완료.

- [ ] **Step 8: Push final fixes + open PR**

```bash
git push
gh pr create --title "feat: /works — external-search + site review aggregation" --body "$(cat <<'EOF'
## Summary
- 외부 API (Naver Book / TMDB) 키워드 검색 → 작품별 사이트 별점·한줄평 묶음 노출
- 새 섹션 `/works` — `/feed` (timeline) 와 별개의 lookup metaphor
- DB 마이그레이션 없음, 기존 (isPublic, isbn|tmdbId) 인덱스 hit
- 멀티테넌트 invariant 예외 4×2 함수에 의도 주석 명시

## Test plan
- [ ] `pnpm test` — unit + integration 모두 통과
- [ ] `pnpm e2e tests/e2e/works-*` — 검색 → 상세 흐름 + empty state
- [ ] Naver 키 누락 환경에서 graceful fallback
- [ ] TMDB 키 누락 환경에서 graceful fallback
- [ ] /works 페이지 미인증 접근 시 /login 리다이렉트
- [ ] 한줄평 없는 published rating-only 항목이 별점 집계에 포함됨 (회귀 가드)
EOF
)"
```

---

## Self-Review Checklist (작업 시작 전 한 번)

**Spec coverage** — spec 각 섹션이 task로 커버되는지 확인:

| Spec § | Task | Coverage |
|---|---|---|
| 3. URL | 6, 7, 8, 12, 13 | API + page routes |
| 4. 데이터 흐름 | 7, 8, 12, 13 | server-side merge |
| 5. DB 쿼리 | 4, 5 | 4×2 functions + invariant 주석 |
| 6. Validation | 1 | 3 schemas + unit tests |
| 7. UI 컴포넌트 | 9, 10, 11 | 5 components |
| 8. 빈 상태·에러 | 12, 13 | try/catch + EmptyState branches |
| 9. 보안 | 6,7,8,12,13 | requireUser + IsbnParamSchema notFound |
| 10. 테스트 | 1, 4, 5, 15 | unit + integration + e2e |
| 11. README | 16 | docs 갱신 |
| 12. 후속 분리 | (out of scope) | 캐싱 별도 PR |

**Type consistency** — 함수 시그니처 점검:

- `getBookAggregatesByIsbns(db, isbns: string[])` → `Map<string, BookSiteAggregate>` — Task 4, 7, 12 일치
- `listBookReviewsByIsbn(db, isbn, { limit, offset? })` → `BookReviewItem[]` — Task 4, 8, 13 일치
- `lookupBookByIsbn(isbn)` → `BookLookupResult | null` — Task 2, 6, 13 일치
- 영화 동등 시그니처 일치 — Task 5, 8, 13

**No placeholders** — 모든 step에 실제 코드 또는 명령. ✓

**Memory invariant tied to test** — Task 4 step 1의 `'INCLUDES published items even when oneLineReview is null/empty'` 케이스가 메모리 `works-review-aggregation-includes-no-text` 의도와 직결. 회귀 가드. ✓

---

## 실행 모드 선택

작업 시작 시 두 방법 중 선택:

1. **Subagent-Driven (추천)** — `superpowers:subagent-driven-development` 사용. task당 fresh subagent dispatch, 사이에 review.
2. **Inline Execution** — `superpowers:executing-plans` 사용. batch + checkpoint review.
