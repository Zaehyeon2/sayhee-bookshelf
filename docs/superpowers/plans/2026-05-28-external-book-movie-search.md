# External Book/Movie Search Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 책·영화 리뷰 작성 시 국립중앙도서관 SRU(책) / TMDB(영화) API를 통한 작품 검색 + autofill + 외부 식별자/표지 URL 저장 기능 추가.

**Architecture:** 폼 최상단에 `cmdk` 기반 autocomplete 검색 바. 서버 프록시 라우트(`/api/external/{books,movies}/search`)가 외부 API 호출(API 키 서버측 보호) + per-user in-memory rate limit + 정규화 DTO 반환. 본인 레코드 중 외부 ID 일치 카운트는 별도 `/api/{books,movies}/by-external` endpoint로 batch lookup. 신규 컬럼(`isbn`/`tmdbId`/`coverUrl`/`externalSource`)은 nullable로 추가, 기존 레코드는 그대로.

**Tech Stack:**
- Next.js 16 App Router, TypeScript
- libSQL/Turso + Drizzle ORM
- `cmdk` (combobox primitives, ~3kb gz)
- `fast-xml-parser` (SRU XML 파싱)
- zod (validation), vitest (unit/integration), Playwright (E2E)
- Biome (lint/format)

**Spec:** `docs/superpowers/specs/2026-05-28-external-book-movie-search-design.md`

---

## File Structure

### 신규 파일

| 경로 | 책임 |
|---|---|
| `src/lib/external/types.ts` | `ExternalSearchItem`/`ExternalSearchResponse` 인터페이스 |
| `src/lib/external/rate-limit.ts` | per-user in-memory rate limit (Map 기반) |
| `src/lib/external/books.ts` | 국립중앙 SRU 호출 + XML 파싱 + 정규화 |
| `src/lib/external/movies.ts` | TMDB v3 호출 + JSON 정규화 + 장르 매핑 |
| `src/app/api/external/books/search/route.ts` | proxy GET (requireUser + rate limit + adapter 호출) |
| `src/app/api/external/movies/search/route.ts` | 동일 패턴 |
| `src/app/api/books/by-external/route.ts` | 본인 books 중 isbn 카운트 GET |
| `src/app/api/movies/by-external/route.ts` | 본인 movies 중 tmdbId 카운트 GET |
| `src/components/external/useExternalSearch.ts` | debounce + AbortController + state machine hook |
| `src/components/external/SearchDropdown.tsx` | cmdk Command 래퍼 (item 렌더 prop) |
| `src/components/external/SelectedChip.tsx` | 표지+제목+× 버튼 |
| `src/components/ExternalBookSearchBar.tsx` | 책 도메인 검색 바 (onSelect 콜백) |
| `src/components/ExternalMovieSearchBar.tsx` | 영화 도메인 검색 바 |
| `tests/unit/external/books.test.ts` | XML 파싱·정규화 단위 테스트 |
| `tests/unit/external/movies.test.ts` | TMDB 정규화 단위 테스트 |
| `tests/unit/external/rate-limit.test.ts` | 윈도우·격리 단위 테스트 |
| `tests/integration/external-search.test.ts` | proxy route 통합 테스트 (fetch stub) |
| `tests/integration/by-external-scoping.test.ts` | 본인 isbn 카운트 + cross-user 격리 |
| `tests/e2e/external-search.spec.ts` | new book/movie 플로우 E2E |

### 수정 파일

| 경로 | 변경 |
|---|---|
| `src/lib/db/schema.ts` | books/movies에 새 컬럼 4종 + 인덱스 4종 |
| `src/lib/validations.ts` | Create/Update Book/Movie 스키마 + ExternalIdsQuerySchema |
| `src/lib/db/queries/books.ts` | createBook/updateBook 새 필드 전파 + countBooksByExternalIds |
| `src/lib/db/queries/movies.ts` | 동일 |
| `src/lib/db/queries/shared.ts` | `BookWithTags`/`MovieWithTags` 타입은 schema 변경으로 자동 갱신 (조치 불필요) |
| `src/app/api/books/route.ts` | POST handler에 새 필드 zod parse 후 createBook 호출 (스키마 변경만으로 자동) |
| `src/app/api/books/[id]/route.ts` | PATCH 동일 |
| `src/app/api/movies/route.ts` | 동일 |
| `src/app/api/movies/[id]/route.ts` | 동일 |
| `src/components/BookForm.tsx` | ExternalBookSearchBar 끼움, 새 state 3종, 제출 payload 확장 |
| `src/components/MovieForm.tsx` | 동일 |
| `src/app/books/[slug]/page.tsx` | 표지 URL 있으면 `<Image>` 렌더 |
| `src/app/movies/[slug]/page.tsx` | 동일 |
| `src/components/BookCard.tsx` | 표지 썸네일 (선택적 시각 보강) |
| `src/components/MovieCard.tsx` | 동일 |
| `next.config.ts` | `images.remotePatterns` 추가 |
| `package.json` | `cmdk`, `fast-xml-parser` deps |
| `.env.example` (없으면 신규) | `NL_KR_API_KEY`, `TMDB_API_KEY` 자리표시 |
| `README.md` | 환경변수 안내 한 줄 |

---

## Conventions for All Tasks

- **Run from repo root** unless otherwise specified.
- **All commands use `pnpm`**, not npm/yarn.
- **DB migrations**: `pnpm exec dotenv -e .env.local -- drizzle-kit ...` (dotenv prefix 필수).
- **Commits**: 한 작업 단위 = 한 커밋. Conventional Commits.
- **TDD where applicable**: 테스트 가능한 순수 로직(adapters, rate-limit, validations) 먼저 실패 테스트 → 구현. UI/E2E는 happy path 우선.
- **No backwards-compat shims**: 새 nullable 컬럼만 추가하므로 기존 데이터 무영향. 기존 레코드 backfill 안 함.

---

## Task 1: Dependencies & Drizzle Schema

**Files:**
- Modify: `package.json`
- Modify: `src/lib/db/schema.ts:31-64` (books), `src/lib/db/schema.ts:151-183` (movies)

- [ ] **Step 1: Install dependencies**

```bash
pnpm add cmdk fast-xml-parser
```

Verify `package.json` has both under `dependencies`.

- [ ] **Step 2: Add books external columns + indexes**

Edit `src/lib/db/schema.ts`. In the `books` table definition (currently lines 31-64), add three new nullable columns after `slug` and before `createdAt`:

```ts
// 기존 컬럼들 …
    slug: text('slug').notNull(),
    // 신규: 외부 API 메타데이터 (모두 nullable)
    isbn: text('isbn'),
    coverUrl: text('cover_url'),
    externalSource: text('external_source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
```

In the same table's index block, add after `publicPublishedIdx`:

```ts
    isbnIdx: index('idx_books_isbn').on(t.isbn),
    publicIsbnIdx: index('idx_books_public_isbn').on(t.isPublic, t.isbn),
```

- [ ] **Step 3: Add movies external columns + indexes**

In the `movies` table definition (currently lines 151-183), add after `slug`:

```ts
    slug: text('slug').notNull(),
    tmdbId: integer('tmdb_id'),
    coverUrl: text('cover_url'),
    externalSource: text('external_source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
```

In the same table's index block, add after `publicPublishedIdx`:

```ts
    tmdbIdx: index('idx_movies_tmdb').on(t.tmdbId),
    publicTmdbIdx: index('idx_movies_public_tmdb').on(t.isPublic, t.tmdbId),
```

- [ ] **Step 4: Generate migration**

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
```

Inspect the generated file under `drizzle/` — verify:
- ALTER TABLE ADD COLUMN for all 6 new columns (3 per table), all NULL allowed
- 4 new CREATE INDEX statements
- No DROP/RENAME

- [ ] **Step 5: Apply to local DB**

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit push
```

Confirm no warnings. (If warning about data loss appears, **abort and re-inspect** — migration should be additive only.)

- [ ] **Step 6: Verify build still passes**

```bash
pnpm build 2>&1 | tail -30
```

Expected: build OK. Schema types regenerate automatically; downstream code still compiles because all new columns are nullable.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(schema): add external metadata columns to books/movies

isbn(책)·tmdbId(영화)·coverUrl·externalSource 컬럼 추가 (모두 nullable).
모아보기·중복 감지 대비 보조 인덱스 4종 포함. cmdk + fast-xml-parser
의존성 설치.
EOF
)"
```

---

## Task 2: Validation Schemas

**Files:**
- Modify: `src/lib/validations.ts:17-110` (Create/Update Book/Movie 4종)
- Modify: `src/lib/validations.ts` (append `ExternalIdsQuerySchema`, `ExternalSearchQuerySchema`)
- Test: `tests/unit/validations.test.ts`

- [ ] **Step 1: Write failing test for new fields**

Append to `tests/unit/validations.test.ts`:

```ts
import {
  CreateBookSchema,
  CreateMovieSchema,
  UpdateBookSchema,
  UpdateMovieSchema,
  ExternalIdsQuerySchema,
  ExternalSearchQuerySchema,
} from '@/lib/validations'

describe('external metadata fields', () => {
  const baseBook = {
    title: '책',
    author: '저자',
    genre: '소설',
    readDate: '2026-01-01',
    rating: 8,
  }
  const baseMovie = {
    title: '영화',
    director: '감독',
    genre: '드라마',
    watchedDate: '2026-01-01',
    rating: 8,
  }

  it('accepts isbn/coverUrl/externalSource on CreateBookSchema', () => {
    const r = CreateBookSchema.parse({
      ...baseBook,
      isbn: '9781234567890',
      coverUrl: 'https://example.com/x.jpg',
      externalSource: 'nl-kr',
    })
    expect(r.isbn).toBe('9781234567890')
    expect(r.externalSource).toBe('nl-kr')
  })

  it('rejects non-http coverUrl', () => {
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, coverUrl: 'javascript:alert(1)' }),
    ).toThrow()
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, coverUrl: 'ftp://x/y.jpg' }),
    ).toThrow()
  })

  it('rejects invalid externalSource enum', () => {
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, externalSource: 'tmdb' }),
    ).toThrow()
  })

  it('accepts null to clear coverUrl in update', () => {
    const r = UpdateBookSchema.parse({ coverUrl: null, isbn: null })
    expect(r.coverUrl).toBeNull()
  })

  it('accepts tmdbId positive integer on CreateMovieSchema', () => {
    const r = CreateMovieSchema.parse({ ...baseMovie, tmdbId: 12345, externalSource: 'tmdb' })
    expect(r.tmdbId).toBe(12345)
  })

  it('rejects non-positive tmdbId', () => {
    expect(() => CreateMovieSchema.parse({ ...baseMovie, tmdbId: 0 })).toThrow()
    expect(() => CreateMovieSchema.parse({ ...baseMovie, tmdbId: -1 })).toThrow()
  })

  it('UpdateMovieSchema accepts null tmdbId', () => {
    const r = UpdateMovieSchema.parse({ tmdbId: null })
    expect(r.tmdbId).toBeNull()
  })
})

describe('ExternalSearchQuerySchema', () => {
  it('accepts q with 2-80 chars', () => {
    expect(ExternalSearchQuerySchema.parse({ q: '해리포터' }).q).toBe('해리포터')
  })
  it('rejects q under 2 chars', () => {
    expect(() => ExternalSearchQuerySchema.parse({ q: 'a' })).toThrow()
  })
  it('rejects q over 80 chars', () => {
    expect(() => ExternalSearchQuerySchema.parse({ q: 'x'.repeat(81) })).toThrow()
  })
})

describe('ExternalIdsQuerySchema', () => {
  it('parses comma-separated string ids', () => {
    const r = ExternalIdsQuerySchema.parse({ ids: 'isbn1,isbn2,isbn3' })
    expect(r.ids).toEqual(['isbn1', 'isbn2', 'isbn3'])
  })
  it('trims and dedupes', () => {
    const r = ExternalIdsQuerySchema.parse({ ids: ' a , b ,a, ' })
    expect(r.ids).toEqual(['a', 'b'])
  })
  it('rejects empty', () => {
    expect(() => ExternalIdsQuerySchema.parse({ ids: '' })).toThrow()
  })
  it('caps at 50 ids', () => {
    const many = Array.from({ length: 51 }, (_, i) => `id${i}`).join(',')
    expect(() => ExternalIdsQuerySchema.parse({ ids: many })).toThrow()
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test tests/unit/validations.test.ts 2>&1 | tail -30
```

Expected: failures referencing missing `ExternalIdsQuerySchema`, `ExternalSearchQuerySchema`, missing fields on Create/Update schemas.

- [ ] **Step 3: Extend CreateBookSchema**

Edit `src/lib/validations.ts`. In `CreateBookSchema` (around line 17), inside `.object({ ... })` before the closing `})`, add:

```ts
    isbn: z.string().trim().max(40).nullable().optional(),
    coverUrl: z
      .string()
      .url()
      .max(500)
      .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
        message: 'http/https URL만 허용됩니다',
      })
      .nullable()
      .optional(),
    externalSource: z.enum(['nl-kr']).nullable().optional(),
```

- [ ] **Step 4: Extend UpdateBookSchema**

Same three fields appended to `UpdateBookSchema` `.object({ ... })`. Already `.optional()` semantics; `nullable()` allows clearing.

- [ ] **Step 5: Extend CreateMovieSchema / UpdateMovieSchema**

In both:

```ts
    tmdbId: z.number().int().positive().nullable().optional(),
    coverUrl: z
      .string()
      .url()
      .max(500)
      .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
        message: 'http/https URL만 허용됩니다',
      })
      .nullable()
      .optional(),
    externalSource: z.enum(['tmdb']).nullable().optional(),
```

- [ ] **Step 6: Append ExternalSearchQuerySchema and ExternalIdsQuerySchema**

Append at end of `src/lib/validations.ts`:

```ts
export const ExternalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, '검색어는 2자 이상').max(80, '검색어는 80자 이하'),
})

const MAX_EXTERNAL_IDS = 50

export const ExternalIdsQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) =>
      Array.from(
        new Set(
          s
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x.length > 0),
        ),
      ),
    )
    .refine((arr) => arr.length >= 1 && arr.length <= MAX_EXTERNAL_IDS, {
      message: `id는 1~${MAX_EXTERNAL_IDS}개`,
    }),
})
```

(The transform-then-refine pattern: zod parses `{ ids: string }` from the URLSearchParams and returns `{ ids: string[] }`.)

- [ ] **Step 7: Run tests, verify pass**

```bash
pnpm test tests/unit/validations.test.ts 2>&1 | tail -20
```

Expected: all new tests pass; existing validation tests still pass.

- [ ] **Step 8: Verify lint**

```bash
pnpm lint 2>&1 | tail -10
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(validations): accept external metadata fields on book/movie schemas

Create/Update Book/Movie 스키마에 isbn|tmdbId/coverUrl/externalSource 추가.
ExternalSearchQuerySchema·ExternalIdsQuerySchema 신규 — proxy route 입력 검증용.
coverUrl은 http/https + max 500자."
```

---

## Task 3: External Types & Rate Limit Util

**Files:**
- Create: `src/lib/external/types.ts`
- Create: `src/lib/external/rate-limit.ts`
- Test: `tests/unit/external/rate-limit.test.ts`

- [ ] **Step 1: Create types**

`src/lib/external/types.ts`:

```ts
export interface ExternalSearchItem<TId extends string | number> {
  externalId: TId
  title: string
  subtitle?: string
  byline: string
  year?: number
  genre?: string
  coverUrl?: string
}

export interface ExternalSearchResponse<TId extends string | number> {
  items: ExternalSearchItem<TId>[]
  source: 'nl-kr' | 'tmdb'
}

export type BookSearchItem = ExternalSearchItem<string>
export type MovieSearchItem = ExternalSearchItem<number>
```

- [ ] **Step 2: Write failing rate-limit test**

`tests/unit/external/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, _resetRateLimitForTest } from '@/lib/external/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => _resetRateLimitForTest())

  it('allows up to the configured limit per minute per user', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(42).ok).toBe(true)
    }
    expect(checkRateLimit(42).ok).toBe(false)
  })

  it('isolates users', () => {
    for (let i = 0; i < 20; i++) checkRateLimit(1)
    expect(checkRateLimit(1).ok).toBe(false)
    expect(checkRateLimit(2).ok).toBe(true)
  })

  it('returns retryAfterSeconds on rejection', () => {
    for (let i = 0; i < 20; i++) checkRateLimit(7)
    const r = checkRateLimit(7)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryAfterSeconds).toBeGreaterThan(0)
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('resets window after expiry', () => {
    for (let i = 0; i < 20; i++) checkRateLimit(9)
    expect(checkRateLimit(9).ok).toBe(false)
    // simulate clock advance via injected now
    const future = Date.now() + 61_000
    expect(checkRateLimit(9, future).ok).toBe(true)
  })
})
```

- [ ] **Step 3: Run test, verify fail**

```bash
pnpm test tests/unit/external/rate-limit.test.ts 2>&1 | tail -20
```

Expected: fail with "Cannot find module".

- [ ] **Step 4: Implement rate-limit**

`src/lib/external/rate-limit.ts`:

```ts
const WINDOW_MS = 60_000
export const EXTERNAL_SEARCH_RATE_LIMIT = 20

interface Entry {
  count: number
  resetAt: number
}

const buckets = new Map<number, Entry>()

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number }

export function checkRateLimit(userId: number, nowMs: number = Date.now()): RateLimitResult {
  const entry = buckets.get(userId)
  if (!entry || entry.resetAt <= nowMs) {
    buckets.set(userId, { count: 1, resetAt: nowMs + WINDOW_MS })
    return { ok: true }
  }
  if (entry.count >= EXTERNAL_SEARCH_RATE_LIMIT) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000)) }
  }
  entry.count += 1
  return { ok: true }
}

export function _resetRateLimitForTest(): void {
  buckets.clear()
}
```

- [ ] **Step 5: Run test, verify pass**

```bash
pnpm test tests/unit/external/rate-limit.test.ts 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/external/types.ts src/lib/external/rate-limit.ts tests/unit/external/rate-limit.test.ts
git commit -m "feat(external): add normalized DTO types and per-user rate limit

ExternalSearchItem/ExternalSearchResponse 정규화 인터페이스.
Rate limit: 분당 20회/유저, in-memory Map, injectable clock for tests."
```

---

## Task 4: TMDB Movies Adapter

**Files:**
- Create: `src/lib/external/movies.ts`
- Test: `tests/unit/external/movies.test.ts`

- [ ] **Step 1: Write failing test with fetch stub**

`tests/unit/external/movies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchMoviesExternal } from '@/lib/external/movies'

const realFetch = globalThis.fetch

function stub(json: unknown, init: { status?: number } = {}) {
  return Object.assign(
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(json), { status: init.status ?? 200 }),
    ),
  )
}

describe('searchMoviesExternal', () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('normalizes TMDB results', async () => {
    globalThis.fetch = stub({
      results: [
        {
          id: 550,
          title: '파이트 클럽',
          original_title: 'Fight Club',
          release_date: '1999-10-15',
          poster_path: '/abc.jpg',
          genre_ids: [18, 53],
        },
      ],
    })
    const r = await searchMoviesExternal('파이트', { limit: 10 })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      externalId: 550,
      title: '파이트 클럽',
      subtitle: 'Fight Club',
      year: 1999,
      coverUrl: 'https://image.tmdb.org/t/p/w185/abc.jpg',
    })
    expect(r[0].genre).toBe('드라마')
  })

  it('omits poster when poster_path null', async () => {
    globalThis.fetch = stub({
      results: [{ id: 1, title: 't', genre_ids: [], release_date: '' }],
    })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r[0].coverUrl).toBeUndefined()
  })

  it('omits year when release_date empty/invalid', async () => {
    globalThis.fetch = stub({
      results: [{ id: 1, title: 't', genre_ids: [], release_date: '' }],
    })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r[0].year).toBeUndefined()
  })

  it('throws when TMDB returns 5xx', async () => {
    globalThis.fetch = stub({ status_message: 'err' }, { status: 500 })
    await expect(searchMoviesExternal('x', { limit: 1 })).rejects.toThrow()
  })

  it('returns [] for 4xx (empty result swallow)', async () => {
    globalThis.fetch = stub({ status_message: 'bad' }, { status: 422 })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('throws when API key missing', async () => {
    delete process.env.TMDB_API_KEY
    await expect(searchMoviesExternal('x', { limit: 1 })).rejects.toThrow(/TMDB_API_KEY/)
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test tests/unit/external/movies.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Implement TMDB adapter**

`src/lib/external/movies.ts`:

```ts
import type { MovieSearchItem } from './types'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const POSTER_PREFIX = 'https://image.tmdb.org/t/p/w185'

// TMDB genre id → MOVIE_GENRES (src/lib/genres.ts) 매핑
// MOVIE_GENRES 확인 후 매핑 갱신 필요. 매핑 없으면 omit.
const TMDB_GENRE_MAP: Record<number, string> = {
  28: '액션',
  12: '모험',
  16: '애니메이션',
  35: '코미디',
  80: '범죄',
  99: '다큐멘터리',
  18: '드라마',
  10751: '가족',
  14: '판타지',
  36: '역사',
  27: '공포',
  10402: '음악',
  9648: '미스터리',
  10749: '로맨스',
  878: 'SF',
  53: '스릴러',
  10752: '전쟁',
  37: '서부',
}

interface TmdbSearchResponse {
  results?: Array<{
    id: number
    title: string
    original_title?: string
    release_date?: string
    poster_path?: string | null
    genre_ids?: number[]
  }>
}

export async function searchMoviesExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<MovieSearchItem[]> {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB_API_KEY env var not set')

  const url = new URL(`${TMDB_BASE}/search/movie`)
  url.searchParams.set('api_key', key)
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'ko-KR')
  url.searchParams.set('include_adult', 'false')

  const res = await fetch(url, { signal: opts.signal })
  if (res.status >= 500) {
    throw new Error(`TMDB upstream ${res.status}`)
  }
  if (res.status >= 400) {
    return []
  }
  const data = (await res.json()) as TmdbSearchResponse
  const results = data.results ?? []
  return results.slice(0, opts.limit).map((r) => {
    const year = r.release_date && /^\d{4}-/.test(r.release_date)
      ? Number(r.release_date.slice(0, 4))
      : undefined
    const genreId = r.genre_ids?.[0]
    const genre = genreId != null ? TMDB_GENRE_MAP[genreId] : undefined
    const subtitle =
      r.original_title && r.original_title !== r.title ? r.original_title : undefined
    return {
      externalId: r.id,
      title: r.title,
      subtitle,
      byline: '', // TMDB search results do not include director — populated on detail fetch (out of scope)
      year,
      genre,
      coverUrl: r.poster_path ? `${POSTER_PREFIX}${r.poster_path}` : undefined,
    }
  })
}
```

**Note about byline (director):** TMDB `/search/movie` doesn't return director — that requires a follow-up `/movie/{id}/credits` call. For MVP we leave `byline` as empty string and the user fills `director` manually (most users know the director when reviewing). Future enhancement: fetch credits in parallel for top N results. This is intentional, not a bug.

Update test for byline empty:

```ts
// In the first test ('normalizes TMDB results'), add:
expect(r[0].byline).toBe('')
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test tests/unit/external/movies.test.ts 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/external/movies.ts tests/unit/external/movies.test.ts
git commit -m "feat(external): TMDB movie search adapter

TMDB v3 /search/movie 호출 + ko-KR locale + 정규화. 5xx throw, 4xx → [].
poster_path를 w185 사이즈 URL로 변환. genre_ids 첫 매칭 → MOVIE_GENRES 매핑.
director는 search endpoint에 없어 byline 빈 문자열로 둠 (사용자 직접 입력)."
```

---

## Task 5: 국립중앙도서관 SRU Books Adapter

**Files:**
- Create: `src/lib/external/books.ts`
- Test: `tests/unit/external/books.test.ts`

> **참고 — SRU endpoint 변경 가능성**: 국립중앙도서관 검색 API는 ISBN OpenAPI/SeoJi 정보 API/SRU 등 다수 존재. 본 어댑터는 `seoji.nl.go.kr/landingPage/SearchApi.do` 또는 `nl.go.kr` SRU 중 활성 endpoint를 사용. 구현 시 우선 [SeoJi 검색 API](https://www.nl.go.kr/seoji) 명세 확인하고, 응답 포맷이 XML이면 fast-xml-parser, JSON이면 직접 매핑. 아래 코드는 SeoJi XML 응답을 가정 (channel/item/title/author/publisher/pubdate/ea_isbn/kdc).

- [ ] **Step 1: Write failing test with response fixture**

`tests/unit/external/books.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchBooksExternal } from '@/lib/external/books'

const realFetch = globalThis.fetch

function xmlStub(xml: string, status = 200) {
  return vi.fn().mockResolvedValue(new Response(xml, { status }))
}

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <TOTAL_COUNT>2</TOTAL_COUNT>
  <docs>
    <e>
      <TITLE>해리 포터와 마법사의 돌</TITLE>
      <AUTHOR>조앤 K. 롤링</AUTHOR>
      <PUBLISHER>문학수첩</PUBLISHER>
      <PUBLISH_PREDATE>19991201</PUBLISH_PREDATE>
      <EA_ISBN>9788983920775</EA_ISBN>
      <KDC>843</KDC>
      <TITLE_URL>https://image.nl.go.kr/cover1.jpg</TITLE_URL>
    </e>
    <e>
      <TITLE>해리 포터와 비밀의 방</TITLE>
      <AUTHOR>조앤 K. 롤링</AUTHOR>
      <PUBLISH_PREDATE>20000801</PUBLISH_PREDATE>
      <EA_ISBN>9788983920782</EA_ISBN>
      <KDC>843</KDC>
    </e>
  </docs>
</metadata>`

describe('searchBooksExternal', () => {
  beforeEach(() => {
    process.env.NL_KR_API_KEY = 'test-key'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('parses XML and normalizes book results', async () => {
    globalThis.fetch = xmlStub(FIXTURE_XML)
    const r = await searchBooksExternal('해리포터', { limit: 10 })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({
      externalId: '9788983920775',
      title: '해리 포터와 마법사의 돌',
      byline: '조앤 K. 롤링',
      year: 1999,
      coverUrl: 'https://image.nl.go.kr/cover1.jpg',
    })
    // KDC 843 → 영미문학 → 소설 매핑 (genres.ts 정의에 맞춰 조정)
    expect(r[0].genre).toBe('소설')
    expect(r[1].coverUrl).toBeUndefined() // TITLE_URL omitted
  })

  it('returns [] for 4xx', async () => {
    globalThis.fetch = xmlStub('', 400)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('throws on 5xx', async () => {
    globalThis.fetch = xmlStub('', 503)
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow()
  })

  it('throws when API key missing', async () => {
    delete process.env.NL_KR_API_KEY
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/NL_KR_API_KEY/)
  })

  it('handles empty result set', async () => {
    globalThis.fetch = xmlStub('<?xml version="1.0"?><metadata><TOTAL_COUNT>0</TOTAL_COUNT><docs></docs></metadata>')
    const r = await searchBooksExternal('zzz', { limit: 1 })
    expect(r).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test tests/unit/external/books.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Implement SRU adapter**

`src/lib/external/books.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import type { BookSearchItem } from './types'

const SEOJI_ENDPOINT = 'https://www.nl.go.kr/seoji/SearchApi.do'

// KDC 첫 자리 → BOOK_GENRES (src/lib/genres.ts) 매핑.
// 매칭 없으면 '소설'(or 가장 일반적인 default). 매핑 외 코드는 genre omit.
// BOOK_GENRES 정의에 맞춰 구현 시 갱신.
const KDC_GENRE_MAP: Record<string, string> = {
  '0': '총류',
  '1': '철학',
  '2': '종교',
  '3': '사회과학',
  '4': '자연과학',
  '5': '기술과학',
  '6': '예술',
  '7': '언어',
  '8': '소설',
  '9': '역사',
}

function mapKdcToGenre(kdc: string | undefined): string | undefined {
  if (!kdc) return undefined
  const head = kdc.trim()[0]
  return KDC_GENRE_MAP[head]
}

function parsePubYear(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{4})/.exec(s)
  return m ? Number(m[1]) : undefined
}

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false, // keep strings — manual numeric conversion only where needed
})

interface SeojiDoc {
  TITLE?: string
  AUTHOR?: string
  PUBLISHER?: string
  PUBLISH_PREDATE?: string
  EA_ISBN?: string
  SET_ISBN?: string
  KDC?: string
  TITLE_URL?: string
  CONTROL_NO?: string
}

interface SeojiResponse {
  metadata?: {
    docs?: { e?: SeojiDoc | SeojiDoc[] } | string
  }
}

export async function searchBooksExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<BookSearchItem[]> {
  const key = process.env.NL_KR_API_KEY
  if (!key) throw new Error('NL_KR_API_KEY env var not set')

  const url = new URL(SEOJI_ENDPOINT)
  url.searchParams.set('cert_key', key)
  url.searchParams.set('result_style', 'xml')
  url.searchParams.set('page_no', '1')
  url.searchParams.set('page_size', String(Math.min(opts.limit, 30)))
  url.searchParams.set('title', query)

  const res = await fetch(url, { signal: opts.signal })
  if (res.status >= 500) throw new Error(`NL-KR upstream ${res.status}`)
  if (res.status >= 400) return []

  const xml = await res.text()
  const parsed = parser.parse(xml) as SeojiResponse
  const docsRaw = parsed.metadata?.docs
  if (!docsRaw || typeof docsRaw === 'string') return []
  const eRaw = docsRaw.e
  if (!eRaw) return []
  const docs: SeojiDoc[] = Array.isArray(eRaw) ? eRaw : [eRaw]

  return docs.slice(0, opts.limit).map((d) => {
    const isbn = d.EA_ISBN?.trim() || d.SET_ISBN?.trim() || d.CONTROL_NO?.trim() || ''
    return {
      externalId: isbn,
      title: d.TITLE?.trim() ?? '',
      byline: d.AUTHOR?.trim() ?? '',
      year: parsePubYear(d.PUBLISH_PREDATE),
      genre: mapKdcToGenre(d.KDC),
      coverUrl: d.TITLE_URL?.trim() || undefined,
    }
  })
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test tests/unit/external/books.test.ts 2>&1 | tail -20
```

If KDC `'8'` → `'소설'` mapping causes test failure because `BOOK_GENRES` from `src/lib/genres.ts` doesn't include `'소설'`, **inspect** `src/lib/genres.ts` and update `KDC_GENRE_MAP` to match actual genre names. Re-run test until pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/external/books.ts tests/unit/external/books.test.ts
git commit -m "feat(external): 국립중앙도서관 SeoJi book search adapter

SearchApi.do XML 응답 fast-xml-parser로 파싱 + 정규화. EA_ISBN 우선,
없으면 SET_ISBN/CONTROL_NO fallback. KDC 첫 자리 → BOOK_GENRES 매핑.
PUBLISH_PREDATE 'YYYYMMDD'에서 연도 추출."
```

---

## Task 6: External Search Proxy Routes

**Files:**
- Create: `src/app/api/external/books/search/route.ts`
- Create: `src/app/api/external/movies/search/route.ts`
- Test: `tests/integration/external-search.test.ts`

- [ ] **Step 1: Write failing integration test**

`tests/integration/external-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupTestDb } from '../setup-db'
import { createTestUser, makeAuthCookie } from '../factories'
import { _resetRateLimitForTest } from '@/lib/external/rate-limit'

// Mock the external adapters at module level so the proxy route never hits real APIs.
vi.mock('@/lib/external/books', () => ({
  searchBooksExternal: vi.fn(),
}))
vi.mock('@/lib/external/movies', () => ({
  searchMoviesExternal: vi.fn(),
}))

import { GET as booksSearch } from '@/app/api/external/books/search/route'
import { GET as moviesSearch } from '@/app/api/external/movies/search/route'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'

function req(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} })
}

describe('proxy: /api/external/{books,movies}/search', () => {
  beforeEach(async () => {
    await setupTestDb()
    _resetRateLimitForTest()
    vi.clearAllMocks()
  })

  it('rejects without session', async () => {
    const r = await booksSearch(req('https://x/api/external/books/search?q=hello'))
    expect(r.status).toBe(401)
  })

  it('rejects q shorter than 2 chars', async () => {
    const user = await createTestUser()
    const r = await booksSearch(req('https://x/api/external/books/search?q=a', await makeAuthCookie(user)))
    expect(r.status).toBe(400)
  })

  it('returns normalized items from books adapter', async () => {
    const user = await createTestUser()
    vi.mocked(searchBooksExternal).mockResolvedValue([
      { externalId: '9781', title: '책', byline: '저자' },
    ])
    const r = await booksSearch(req('https://x/api/external/books/search?q=책', await makeAuthCookie(user)))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('nl-kr')
    expect(body.items).toHaveLength(1)
    expect(body.items[0].externalId).toBe('9781')
    expect(r.headers.get('cache-control')).toContain('private')
  })

  it('returns 503 when adapter throws', async () => {
    const user = await createTestUser()
    vi.mocked(searchBooksExternal).mockRejectedValue(new Error('upstream'))
    const r = await booksSearch(req('https://x/api/external/books/search?q=hi', await makeAuthCookie(user)))
    expect(r.status).toBe(503)
  })

  it('rate-limits after 20 requests', async () => {
    const user = await createTestUser()
    vi.mocked(searchBooksExternal).mockResolvedValue([])
    for (let i = 0; i < 20; i++) {
      const r = await booksSearch(req('https://x/api/external/books/search?q=hi', await makeAuthCookie(user)))
      expect(r.status).toBe(200)
    }
    const r = await booksSearch(req('https://x/api/external/books/search?q=hi', await makeAuthCookie(user)))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBeTruthy()
  })

  it('movies search proxies through adapter', async () => {
    const user = await createTestUser()
    vi.mocked(searchMoviesExternal).mockResolvedValue([
      { externalId: 42, title: '영화', byline: '' },
    ])
    const r = await moviesSearch(req('https://x/api/external/movies/search?q=영화', await makeAuthCookie(user)))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('tmdb')
  })
})
```

(`makeAuthCookie` is a test helper — if it doesn't exist, see Step 2.)

- [ ] **Step 2: Confirm or add `makeAuthCookie` test helper**

Check `tests/factories.ts`. If `makeAuthCookie(user)` doesn't exist:

```ts
import { SignJWT } from 'jose'

export async function makeAuthCookie(user: { id: number; tokenVersion: number; mustChangePassword?: number }): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-')
  const jwt = await new SignJWT({ uid: user.id, tv: user.tokenVersion ?? 0, mcp: user.mustChangePassword ?? 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('book-report')
    .setAudience('book-report-web')
    .setExpirationTime('7d')
    .sign(secret)
  return `session=${jwt}`
}
```

(Mirror the JWT shape from `src/lib/auth.ts` exactly — `uid`/`tv`/`mcp` claims, HS256, issuer/audience.)

- [ ] **Step 3: Run test, verify fail**

```bash
pnpm test tests/integration/external-search.test.ts 2>&1 | tail -30
```

- [ ] **Step 4: Implement books proxy route**

`src/app/api/external/books/search/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalSearchQuerySchema } from '@/lib/validations'
import { checkRateLimit } from '@/lib/external/rate-limit'
import { searchBooksExternal } from '@/lib/external/books'
import type { ExternalSearchResponse } from '@/lib/external/types'

export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const limited = checkRateLimit(user.id)
  if (!limited.ok) {
    return NextResponse.json(
      { error: '잠시만요, 검색이 너무 많아요' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const url = new URL(req.url)
  const parsed = ExternalSearchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  try {
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), 5000)
    const items = await searchBooksExternal(parsed.data.q, { limit: 10, signal: ctl.signal })
    clearTimeout(timeout)
    const body: ExternalSearchResponse<string> = { items, source: 'nl-kr' }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e) {
    console.error('[external/books/search]', e)
    return NextResponse.json(
      { error: '검색 서비스가 일시적으로 응답하지 않아요' },
      { status: 503 },
    )
  }
}
```

- [ ] **Step 5: Implement movies proxy route**

`src/app/api/external/movies/search/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalSearchQuerySchema } from '@/lib/validations'
import { checkRateLimit } from '@/lib/external/rate-limit'
import { searchMoviesExternal } from '@/lib/external/movies'
import type { ExternalSearchResponse } from '@/lib/external/types'

export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const limited = checkRateLimit(user.id)
  if (!limited.ok) {
    return NextResponse.json(
      { error: '잠시만요, 검색이 너무 많아요' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const url = new URL(req.url)
  const parsed = ExternalSearchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  try {
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), 5000)
    const items = await searchMoviesExternal(parsed.data.q, { limit: 10, signal: ctl.signal })
    clearTimeout(timeout)
    const body: ExternalSearchResponse<number> = { items, source: 'tmdb' }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e) {
    console.error('[external/movies/search]', e)
    return NextResponse.json(
      { error: '검색 서비스가 일시적으로 응답하지 않아요' },
      { status: 503 },
    )
  }
}
```

- [ ] **Step 6: Run tests, verify pass**

```bash
pnpm test tests/integration/external-search.test.ts 2>&1 | tail -30
```

If `requireUser()` fails because the test helper cookie path differs from production, inspect `src/lib/auth-helpers.ts` and `src/lib/auth.ts` to match the exact cookie name + decode path. The test helper must produce a cookie that `getCurrentUser()` accepts.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/external/ tests/integration/external-search.test.ts tests/factories.ts
git commit -m "feat(api): external book/movie search proxy routes

/api/external/{books,movies}/search GET. requireUser 게이트 + per-user rate
limit + 5s timeout + 5xx→503/4xx→[]/0args→400 분기. 응답은 정규화 DTO."
```

---

## Task 7: Queries — New Field Propagation + countByExternalIds

**Files:**
- Modify: `src/lib/db/queries/books.ts:30-139` (createBook, updateBook)
- Modify: `src/lib/db/queries/movies.ts:30-139` (createMovie, updateMovie)
- Append to both files: `countByExternalIds`

- [ ] **Step 1: Extend createBook to persist new fields**

In `src/lib/db/queries/books.ts:46-62`, inside the `tx.insert(books).values({ ... })`, add (right after `oneLineReview`):

```ts
            oneLineReview: input.oneLineReview ?? null,
            isbn: input.isbn ?? null,
            coverUrl: input.coverUrl ?? null,
            externalSource: input.externalSource ?? null,
            isPublic,
            publishedAt,
            // …
```

- [ ] **Step 2: Extend updateBook conditional SET**

In `src/lib/db/queries/books.ts:111-126`, inside `tx.update(books).set({ ... })`, append before `updatedAt: now`:

```ts
        ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
        ...(input.isbn !== undefined && { isbn: input.isbn }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
        ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
        // …
```

- [ ] **Step 3: Append countByExternalIds to books queries**

Append at end of `src/lib/db/queries/books.ts`:

```ts
import { inArray } from 'drizzle-orm'

/**
 * 본인 books 중 주어진 isbn들 각각 몇 번 기록했는지 반환.
 * 멀티테넌트 invariant: authorUserId로 필터.
 */
export async function countBooksByExternalIds(
  db: Db,
  authorUserId: number,
  isbns: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (isbns.length === 0) return counts
  const rows = await db
    .select({ isbn: books.isbn, n: sql<number>`COUNT(*)` })
    .from(books)
    .where(and(eq(books.authorUserId, authorUserId), inArray(books.isbn, isbns)))
    .groupBy(books.isbn)
  for (const r of rows) {
    if (r.isbn != null) counts.set(r.isbn, Number(r.n))
  }
  return counts
}
```

Note: `inArray` may already be imported elsewhere via the same line. Adjust import to be `import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'`.

- [ ] **Step 4: Mirror to movies queries**

In `src/lib/db/queries/movies.ts:46-62` and `:111-126`, mirror the same additions with `tmdbId`/`coverUrl`/`externalSource`:

```ts
// createMovie insert.values
            oneLineReview: input.oneLineReview ?? null,
            tmdbId: input.tmdbId ?? null,
            coverUrl: input.coverUrl ?? null,
            externalSource: input.externalSource ?? null,
            isPublic,
            // …

// updateMovie .set
        ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
        ...(input.tmdbId !== undefined && { tmdbId: input.tmdbId }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
        // …
```

Append at end of `src/lib/db/queries/movies.ts`:

```ts
import { inArray } from 'drizzle-orm'

export async function countMoviesByExternalIds(
  db: Db,
  authorUserId: number,
  tmdbIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
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
```

Update the `import { and, desc, eq, like, sql }` line to include `inArray`.

- [ ] **Step 5: Verify type check + build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: build OK. New fields propagate through `CreateBookInput`/`UpdateBookInput` types (already extended in Task 2).

- [ ] **Step 6: Run existing integration tests**

```bash
pnpm test tests/integration/books-scoping.test.ts tests/integration/movies-scoping.test.ts 2>&1 | tail -20
```

Expected: still passing (existing tests don't pass new fields, so behavior unchanged when undefined).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/queries/books.ts src/lib/db/queries/movies.ts
git commit -m "feat(queries): propagate external metadata + countByExternalIds

createBook/updateBook/createMovie/updateMovie persist isbn|tmdbId/
coverUrl/externalSource. countBooksByExternalIds/countMoviesByExternalIds
batch lookup for '이미 기록함' badge (본인 scope)."
```

---

## Task 8: by-external Lookup Endpoints

**Files:**
- Create: `src/app/api/books/by-external/route.ts`
- Create: `src/app/api/movies/by-external/route.ts`
- Test: `tests/integration/by-external-scoping.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/by-external-scoping.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb, getTestDb } from '../setup-db'
import { createTestUser, makeAuthCookie } from '../factories'
import { createBook } from '@/lib/db/queries/books'
import { createMovie } from '@/lib/db/queries/movies'
import { GET as booksByExternal } from '@/app/api/books/by-external/route'
import { GET as moviesByExternal } from '@/app/api/movies/by-external/route'

function req(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} })
}

describe('GET /api/books/by-external', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('rejects without session', async () => {
    const r = await booksByExternal(req('https://x/api/books/by-external?ids=a,b'))
    expect(r.status).toBe(401)
  })

  it('counts only own books by isbn', async () => {
    const userA = await createTestUser({ username: 'aaaa' })
    const userB = await createTestUser({ username: 'bbbb' })
    const db = getTestDb()

    await createBook(db, userA.id, {
      title: 'A1', author: 'x', genre: '소설', readDate: '2026-01-01',
      rating: 8, content: '', tags: [], isPublic: true,
      isbn: '9781', externalSource: 'nl-kr',
    })
    await createBook(db, userA.id, {
      title: 'A2', author: 'x', genre: '소설', readDate: '2026-01-02',
      rating: 8, content: '', tags: [], isPublic: true,
      isbn: '9781', externalSource: 'nl-kr',
    })
    await createBook(db, userB.id, {
      title: 'B', author: 'x', genre: '소설', readDate: '2026-01-01',
      rating: 8, content: '', tags: [], isPublic: true,
      isbn: '9781', externalSource: 'nl-kr',
    })

    const r = await booksByExternal(
      req('https://x/api/books/by-external?ids=9781,9999', await makeAuthCookie(userA)),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    // userA has 2 books with isbn=9781; userB's record must NOT leak.
    expect(body.counts['9781']).toBe(2)
    expect(body.counts['9999']).toBeUndefined()
  })

  it('returns empty counts when no matches', async () => {
    const user = await createTestUser()
    const r = await booksByExternal(
      req('https://x/api/books/by-external?ids=zzz', await makeAuthCookie(user)),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts).toEqual({})
  })

  it('rejects empty ids', async () => {
    const user = await createTestUser()
    const r = await booksByExternal(
      req('https://x/api/books/by-external?ids=', await makeAuthCookie(user)),
    )
    expect(r.status).toBe(400)
  })
})

describe('GET /api/movies/by-external', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('counts only own movies by tmdbId (numeric)', async () => {
    const userA = await createTestUser({ username: 'aaaa' })
    const userB = await createTestUser({ username: 'bbbb' })
    const db = getTestDb()

    await createMovie(db, userA.id, {
      title: 'A', director: 'd', genre: '드라마', watchedDate: '2026-01-01',
      rating: 9, content: '', tags: [], isPublic: true,
      tmdbId: 550, externalSource: 'tmdb',
    })
    await createMovie(db, userB.id, {
      title: 'B', director: 'd', genre: '드라마', watchedDate: '2026-01-01',
      rating: 9, content: '', tags: [], isPublic: true,
      tmdbId: 550, externalSource: 'tmdb',
    })

    const r = await moviesByExternal(
      req('https://x/api/movies/by-external?ids=550,12345', await makeAuthCookie(userA)),
    )
    const body = await r.json()
    expect(body.counts['550']).toBe(1)
    expect(body.counts['12345']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm test tests/integration/by-external-scoping.test.ts 2>&1 | tail -30
```

- [ ] **Step 3: Implement books endpoint**

`src/app/api/books/by-external/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalIdsQuerySchema } from '@/lib/validations'
import { countBooksByExternalIds } from '@/lib/db/queries/books'
import { db } from '@/lib/db/client'

export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const url = new URL(req.url)
  const parsed = ExternalIdsQuerySchema.safeParse({ ids: url.searchParams.get('ids') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const map = await countBooksByExternalIds(db, user.id, parsed.data.ids)
  const counts: Record<string, number> = {}
  for (const [k, v] of map) counts[k] = v
  return NextResponse.json({ counts })
}
```

- [ ] **Step 4: Implement movies endpoint**

`src/app/api/movies/by-external/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { ExternalIdsQuerySchema } from '@/lib/validations'
import { countMoviesByExternalIds } from '@/lib/db/queries/movies'
import { db } from '@/lib/db/client'

export async function GET(req: Request): Promise<Response> {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const url = new URL(req.url)
  const parsed = ExternalIdsQuerySchema.safeParse({ ids: url.searchParams.get('ids') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const numeric = parsed.data.ids
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0)
  const map = await countMoviesByExternalIds(db, user.id, numeric)
  const counts: Record<string, number> = {}
  for (const [k, v] of map) counts[String(k)] = v
  return NextResponse.json({ counts })
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm test tests/integration/by-external-scoping.test.ts 2>&1 | tail -30
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/books/by-external src/app/api/movies/by-external tests/integration/by-external-scoping.test.ts
git commit -m "feat(api): by-external lookup endpoints for '이미 기록' badge

GET /api/{books,movies}/by-external?ids=... — requireUser 게이트 + 본인
author_user_id scoped count. 멀티테넌트 격리 회귀 가드 테스트 포함."
```

---

## Task 9: useExternalSearch Hook

**Files:**
- Create: `src/components/external/useExternalSearch.ts`

(No unit test — UI hook tested via component tests in later task. Code is small enough to inspect.)

- [ ] **Step 1: Implement hook**

`src/components/external/useExternalSearch.ts`:

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExternalSearchItem, ExternalSearchResponse } from '@/lib/external/types'

const DEBOUNCE_MS = 300
const MIN_Q = 2

export type SearchState<TId extends string | number> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; items: ExternalSearchItem<TId>[]; counts: Record<string, number> }

interface Options<TId extends string | number> {
  searchUrl: string                                       // '/api/external/books/search'
  byExternalUrl: string                                   // '/api/books/by-external'
  toLookupKey: (item: ExternalSearchItem<TId>) => string  // String(externalId)
}

export function useExternalSearch<TId extends string | number>(opts: Options<TId>) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState<TId>>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    if (timerRef.current) clearTimeout(timerRef.current)
    setState({ kind: 'idle' })
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()

    const q = query.trim()
    if (q.length < MIN_Q) {
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'loading' })
    timerRef.current = setTimeout(async () => {
      const ctl = new AbortController()
      abortRef.current = ctl
      try {
        const res = await fetch(`${opts.searchUrl}?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setState({ kind: 'error', message: body.error ?? '검색 실패' })
          return
        }
        const data = (await res.json()) as ExternalSearchResponse<TId>
        let counts: Record<string, number> = {}
        if (data.items.length > 0) {
          const ids = data.items.map((it) => opts.toLookupKey(it)).join(',')
          const lookup = await fetch(`${opts.byExternalUrl}?ids=${encodeURIComponent(ids)}`, {
            signal: ctl.signal,
          })
          if (lookup.ok) {
            const lb = (await lookup.json()) as { counts: Record<string, number> }
            counts = lb.counts ?? {}
          }
        }
        setState({ kind: 'ok', items: data.items, counts })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setState({ kind: 'error', message: '검색 서비스가 일시적으로 응답하지 않아요' })
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, opts.searchUrl, opts.byExternalUrl, opts.toLookupKey])

  useEffect(() => () => abortRef.current?.abort(), [])

  return { query, setQuery, state, reset }
}
```

- [ ] **Step 2: Build check**

```bash
pnpm build 2>&1 | tail -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/external/useExternalSearch.ts
git commit -m "feat(external): useExternalSearch hook (debounce + abort + lookup)

300ms debounce, AbortController로 in-flight cancel, 검색 후 by-external
batch lookup으로 '이미 기록' counts 함께 반환. SearchState discriminated union."
```

---

## Task 10: SearchDropdown (cmdk wrapper) + SelectedChip

**Files:**
- Create: `src/components/external/SearchDropdown.tsx`
- Create: `src/components/external/SelectedChip.tsx`

- [ ] **Step 1: Implement SearchDropdown**

`src/components/external/SearchDropdown.tsx`:

```tsx
'use client'

import { Command } from 'cmdk'
import type { ReactNode } from 'react'
import { Spinner } from '@/components/Spinner'

export interface SearchDropdownProps<T> {
  query: string
  onQueryChange: (q: string) => void
  placeholder: string
  state:
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; items: T[]; counts: Record<string, number> }
  onSelect: (item: T) => void
  renderItem: (item: T, count: number) => ReactNode
  getItemValue: (item: T) => string  // unique key per item (e.g., String(externalId))
}

export function SearchDropdown<T>({
  query,
  onQueryChange,
  placeholder,
  state,
  onSelect,
  renderItem,
  getItemValue,
}: SearchDropdownProps<T>) {
  const isOpen = state.kind !== 'idle'

  return (
    <Command
      shouldFilter={false}
      className="rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden"
    >
      <Command.Input
        value={query}
        onValueChange={onQueryChange}
        placeholder={placeholder}
        className="w-full h-12 px-4 bg-transparent text-[15px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none border-b border-[var(--color-border)]"
      />
      {isOpen && (
        <Command.List className="max-h-80 overflow-y-auto py-1">
          {state.kind === 'loading' && (
            <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
              <Spinner /> 검색 중…
            </div>
          )}
          {state.kind === 'error' && (
            <div className="px-4 py-3 text-[13px] text-[var(--color-danger)]">{state.message}</div>
          )}
          {state.kind === 'ok' && state.items.length === 0 && (
            <Command.Empty className="px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
              검색 결과가 없어요. 아래에 직접 입력해도 됩니다.
            </Command.Empty>
          )}
          {state.kind === 'ok' &&
            state.items.map((item) => {
              const key = getItemValue(item)
              const count = state.counts[key] ?? 0
              return (
                <Command.Item
                  key={key}
                  value={key}
                  onSelect={() => onSelect(item)}
                  className="px-4 py-2.5 text-[14px] text-[var(--color-text-strong)] cursor-pointer data-[selected=true]:bg-[var(--color-surface-2)] aria-selected:bg-[var(--color-surface-2)]"
                >
                  {renderItem(item, count)}
                </Command.Item>
              )
            })}
        </Command.List>
      )}
    </Command>
  )
}
```

- [ ] **Step 2: Implement SelectedChip**

`src/components/external/SelectedChip.tsx`:

```tsx
'use client'

import Image from 'next/image'

interface Props {
  title: string
  byline?: string
  coverUrl?: string
  onClear: () => void
  onReopen: () => void
}

export function SelectedChip({ title, byline, coverUrl, onClear, onReopen }: Props) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt=""
          width={36}
          height={52}
          className="rounded-sm object-cover flex-shrink-0"
          unoptimized={false}
        />
      ) : (
        <div className="w-9 h-[52px] rounded-sm bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] text-lg">
          📚
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-[var(--color-text-strong)] truncate">{title}</div>
        {byline && (
          <div className="text-[12px] text-[var(--color-text-muted)] truncate">{byline}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onReopen}
        className="text-[12px] font-medium text-[var(--color-toss-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 rounded px-1"
      >
        다시 검색
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="외부 정보 초기화"
        className="w-7 h-7 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/50"
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
pnpm build 2>&1 | tail -30
```

If `cmdk` types complain about JSX, ensure `@types/react` ≥ 18 and that `react`/`react-dom` resolve to the project version.

- [ ] **Step 4: Commit**

```bash
git add src/components/external/SearchDropdown.tsx src/components/external/SelectedChip.tsx
git commit -m "feat(external): SearchDropdown (cmdk) + SelectedChip components

shouldFilter={false} — 외부 API 결과 그대로 표시. Loading/error/empty
state 분기. SelectedChip은 표지 썸네일 + 다시검색 / × 초기화 액션."
```

---

## Task 11: ExternalBookSearchBar + ExternalMovieSearchBar

**Files:**
- Create: `src/components/ExternalBookSearchBar.tsx`
- Create: `src/components/ExternalMovieSearchBar.tsx`

- [ ] **Step 1: Implement ExternalBookSearchBar**

`src/components/ExternalBookSearchBar.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { useExternalSearch } from './external/useExternalSearch'
import { SearchDropdown } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import type { BookSearchItem } from '@/lib/external/types'

export interface BookSelection {
  externalId: string
  title: string
  byline: string
  genre?: string
  coverUrl?: string
}

interface Props {
  initial?: { isbn?: string | null; title?: string; byline?: string; coverUrl?: string | null }
  onSelect: (sel: BookSelection) => void
  onClear: () => void
}

export function ExternalBookSearchBar({ initial, onSelect, onClear }: Props) {
  const [showChip, setShowChip] = useState(
    Boolean(initial?.isbn) && Boolean(initial?.title),
  )
  const { query, setQuery, state, reset } = useExternalSearch<string>({
    searchUrl: '/api/external/books/search',
    byExternalUrl: '/api/books/by-external',
    toLookupKey: useCallback((it: BookSearchItem) => it.externalId, []),
  })

  if (showChip && initial) {
    return (
      <SelectedChip
        title={initial.title ?? ''}
        byline={initial.byline}
        coverUrl={initial.coverUrl ?? undefined}
        onClear={() => {
          setShowChip(false)
          onClear()
        }}
        onReopen={() => {
          setShowChip(false)
          reset()
        }}
      />
    )
  }

  return (
    <SearchDropdown<BookSearchItem>
      query={query}
      onQueryChange={setQuery}
      placeholder="제목으로 검색 (예: 해리포터)"
      state={state}
      getItemValue={(it) => it.externalId}
      onSelect={(item) => {
        onSelect({
          externalId: item.externalId,
          title: item.title,
          byline: item.byline,
          genre: item.genre,
          coverUrl: item.coverUrl,
        })
        setShowChip(true)
        reset()
      }}
      renderItem={(item, count) => (
        <div className="flex items-center gap-3">
          {item.coverUrl ? (
            // External non-Next image — use plain <img> to avoid pre-config domain pain at search time.
            // Next/Image only for confirmed saved records (Task 14).
            // biome-ignore lint/a11y/useAltText: decorative thumbnail
            <img
              src={item.coverUrl}
              alt=""
              width={36}
              height={52}
              className="rounded-sm object-cover flex-shrink-0"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-9 h-[52px] rounded-sm bg-[var(--color-surface-2)] flex items-center justify-center text-base">
              📚
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{item.title}</div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {[item.byline, item.year, item.genre].filter(Boolean).join(' · ')}
            </div>
            {count > 0 && (
              <div className="text-[11px] text-[var(--color-toss-blue)] mt-0.5">
                ✓ 이미 {count}번 기록했어요
              </div>
            )}
          </div>
        </div>
      )}
    />
  )
}
```

- [ ] **Step 2: Implement ExternalMovieSearchBar**

`src/components/ExternalMovieSearchBar.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { useExternalSearch } from './external/useExternalSearch'
import { SearchDropdown } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import type { MovieSearchItem } from '@/lib/external/types'

export interface MovieSelection {
  externalId: number
  title: string
  byline: string
  genre?: string
  coverUrl?: string
}

interface Props {
  initial?: { tmdbId?: number | null; title?: string; byline?: string; coverUrl?: string | null }
  onSelect: (sel: MovieSelection) => void
  onClear: () => void
}

export function ExternalMovieSearchBar({ initial, onSelect, onClear }: Props) {
  const [showChip, setShowChip] = useState(
    initial?.tmdbId != null && Boolean(initial?.title),
  )
  const { query, setQuery, state, reset } = useExternalSearch<number>({
    searchUrl: '/api/external/movies/search',
    byExternalUrl: '/api/movies/by-external',
    toLookupKey: useCallback((it: MovieSearchItem) => String(it.externalId), []),
  })

  if (showChip && initial) {
    return (
      <SelectedChip
        title={initial.title ?? ''}
        byline={initial.byline}
        coverUrl={initial.coverUrl ?? undefined}
        onClear={() => {
          setShowChip(false)
          onClear()
        }}
        onReopen={() => {
          setShowChip(false)
          reset()
        }}
      />
    )
  }

  return (
    <SearchDropdown<MovieSearchItem>
      query={query}
      onQueryChange={setQuery}
      placeholder="제목으로 검색 (예: 파이트 클럽)"
      state={state}
      getItemValue={(it) => String(it.externalId)}
      onSelect={(item) => {
        onSelect({
          externalId: item.externalId,
          title: item.title,
          byline: item.byline,
          genre: item.genre,
          coverUrl: item.coverUrl,
        })
        setShowChip(true)
        reset()
      }}
      renderItem={(item, count) => (
        <div className="flex items-center gap-3">
          {item.coverUrl ? (
            // biome-ignore lint/a11y/useAltText: decorative thumbnail
            <img
              src={item.coverUrl}
              alt=""
              width={36}
              height={52}
              className="rounded-sm object-cover flex-shrink-0"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-9 h-[52px] rounded-sm bg-[var(--color-surface-2)] flex items-center justify-center text-base">
              🎬
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">
              {item.title}
              {item.subtitle && (
                <span className="text-[var(--color-text-muted)] font-normal"> · {item.subtitle}</span>
              )}
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {[item.year, item.genre].filter(Boolean).join(' · ') || ' '}
            </div>
            {count > 0 && (
              <div className="text-[11px] text-[var(--color-toss-blue)] mt-0.5">
                ✓ 이미 {count}번 기록했어요
              </div>
            )}
          </div>
        </div>
      )}
    />
  )
}
```

(`Image` import unused in this file is OK — Biome will warn; remove if so. The plain `<img>` is intentional: search results from TMDB have not been saved yet, and `next/image` requires pre-configured remotePatterns. We only use `next/image` for *committed* records in Task 14.)

- [ ] **Step 3: Build check**

```bash
pnpm build 2>&1 | tail -30
```

Remove unused imports flagged by Biome (e.g., `Image` in ExternalMovieSearchBar if it's not used).

- [ ] **Step 4: Commit**

```bash
git add src/components/ExternalBookSearchBar.tsx src/components/ExternalMovieSearchBar.tsx
git commit -m "feat(external): domain-specific search bars wiring hook + dropdown + chip

ExternalBookSearchBar/ExternalMovieSearchBar. initial.isbn|tmdbId 있으면
chip으로 시작, 다시검색 누르면 검색 모드로. Dropdown 항목엔 표지 썸네일
+ year/genre + '이미 N번 기록' badge."
```

---

## Task 12: Integrate Search Bar Into BookForm

**Files:**
- Modify: `src/components/BookForm.tsx`

- [ ] **Step 1: Extend BookFormValues**

In `src/components/BookForm.tsx:15-25`, replace the `BookFormValues` interface:

```ts
export interface BookFormValues {
  title: string
  author: string
  genre: string
  readDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  isbn: string | null
  coverUrl: string | null
  externalSource: 'nl-kr' | null
}
```

- [ ] **Step 2: Add imports + new state**

At the top of `BookForm.tsx` add:

```ts
import { ExternalBookSearchBar, type BookSelection } from './ExternalBookSearchBar'
```

Inside `BookForm` component, after existing useState declarations, add:

```ts
  const [isbn, setIsbn] = useState<string | null>(initial?.isbn ?? null)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null)
  const [externalSource, setExternalSource] = useState<'nl-kr' | null>(
    initial?.externalSource ?? null,
  )
```

- [ ] **Step 3: Add Search Bar above the title field**

Find the `<form onSubmit={submit} className="space-y-6">` element and the first `<section>`. Right after `<section className="…">` opening (before `<div><label className={labelCls}>제목</label>...`), insert:

```tsx
        <div>
          <label className={labelCls}>
            작품 검색{' '}
            <span className="text-[var(--color-text-weak)] font-normal">(선택)</span>
          </label>
          <ExternalBookSearchBar
            initial={{
              isbn,
              title,
              byline: author,
              coverUrl,
            }}
            onSelect={(sel: BookSelection) => {
              setTitle(sel.title)
              setAuthor(sel.byline || author)
              if (sel.genre) setGenre(sel.genre)
              setIsbn(sel.externalId)
              setCoverUrl(sel.coverUrl ?? null)
              setExternalSource('nl-kr')
            }}
            onClear={() => {
              setIsbn(null)
              setCoverUrl(null)
              setExternalSource(null)
            }}
          />
        </div>
```

- [ ] **Step 4: Extend submit payload**

In the `submit` function, update the `payload` object:

```ts
      const payload = {
        title,
        author,
        genre,
        readDate,
        rating,
        content,
        tags,
        oneLineReview,
        isPublic,
        isbn,
        coverUrl,
        externalSource,
      }
```

- [ ] **Step 5: Build + lint**

```bash
pnpm build 2>&1 | tail -30
pnpm lint 2>&1 | tail -10
```

- [ ] **Step 6: Smoke-test in dev server**

```bash
pnpm dev &
DEV_PID=$!
sleep 8
echo "Open http://localhost:3000/books/new — verify search bar renders above title field"
echo "Type 2+ chars (after env keys configured) — verify dropdown appears"
kill $DEV_PID
```

If env keys not yet set, just verify the search bar renders and shows no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/BookForm.tsx
git commit -m "feat(BookForm): integrate ExternalBookSearchBar above title field

BookFormValues에 isbn/coverUrl/externalSource 추가. 검색 결과 선택 시
title·author·genre autofill, 외부 ID·표지 함께 상태에 보존. 제출 시
payload에 포함."
```

---

## Task 13: Integrate Search Bar Into MovieForm

**Files:**
- Modify: `src/components/MovieForm.tsx`

- [ ] **Step 1: Extend MovieFormValues**

In `src/components/MovieForm.tsx:15-25`, replace `MovieFormValues`:

```ts
export interface MovieFormValues {
  title: string
  director: string
  genre: string
  watchedDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  tmdbId: number | null
  coverUrl: string | null
  externalSource: 'tmdb' | null
}
```

- [ ] **Step 2: Imports + state**

Add import:

```ts
import { ExternalMovieSearchBar, type MovieSelection } from './ExternalMovieSearchBar'
```

Inside component, after existing state:

```ts
  const [tmdbId, setTmdbId] = useState<number | null>(initial?.tmdbId ?? null)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null)
  const [externalSource, setExternalSource] = useState<'tmdb' | null>(
    initial?.externalSource ?? null,
  )
```

- [ ] **Step 3: Add Search Bar above title field**

Inside the first `<section>` right after its opening tag, before the title `<div>`:

```tsx
        <div>
          <label className={labelCls}>
            작품 검색{' '}
            <span className="text-[var(--color-text-weak)] font-normal">(선택)</span>
          </label>
          <ExternalMovieSearchBar
            initial={{
              tmdbId,
              title,
              byline: director,
              coverUrl,
            }}
            onSelect={(sel: MovieSelection) => {
              setTitle(sel.title)
              if (sel.byline) setDirector(sel.byline)
              if (sel.genre) setGenre(sel.genre)
              setTmdbId(sel.externalId)
              setCoverUrl(sel.coverUrl ?? null)
              setExternalSource('tmdb')
            }}
            onClear={() => {
              setTmdbId(null)
              setCoverUrl(null)
              setExternalSource(null)
            }}
          />
        </div>
```

- [ ] **Step 4: Extend submit payload**

```ts
      const payload = {
        title,
        director,
        genre,
        watchedDate,
        rating,
        content,
        tags,
        oneLineReview,
        isPublic,
        tmdbId,
        coverUrl,
        externalSource,
      }
```

- [ ] **Step 5: Build + lint**

```bash
pnpm build 2>&1 | tail -30
pnpm lint 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/components/MovieForm.tsx
git commit -m "feat(MovieForm): integrate ExternalMovieSearchBar above title field

MovieFormValues에 tmdbId/coverUrl/externalSource 추가. autofill 흐름은
BookForm과 동일 (director은 TMDB search 응답에 없어 사용자 직접 입력 유지)."
```

---

## Task 14: Display Cover on Detail Pages & Cards

**Files:**
- Modify: `src/app/books/[slug]/page.tsx`
- Modify: `src/app/movies/[slug]/page.tsx`
- Modify: `src/components/BookCard.tsx`
- Modify: `src/components/MovieCard.tsx`
- Modify: `next.config.ts`

- [ ] **Step 1: Configure next/image remotePatterns**

Replace `next.config.ts` content:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      // 국립중앙도서관 표지 호스트 — adapter 응답에서 확인되는 실제 호스트 추가.
      // 일반적으로 image.nl.go.kr 또는 cdn.nlgo.kr. 미스매치 시 표지는 omit되고
      // dev 콘솔에 next/image 에러 출력.
      { protocol: 'https', hostname: 'image.nl.go.kr' },
      { protocol: 'http', hostname: 'image.nl.go.kr' },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 2: Update book detail page**

Read `src/app/books/[slug]/page.tsx`. Locate the JSX block rendering the book header (title, author, genre badge). Add a cover image above or beside it.

Example insertion (near the top of the rendered article, before title):

```tsx
{book.coverUrl && (
  <div className="mb-4">
    <Image
      src={book.coverUrl}
      alt={`${book.title} 표지`}
      width={150}
      height={220}
      className="rounded-[var(--radius-toss-sm)] shadow-[var(--shadow-toss)]"
      onError={() => null}
    />
  </div>
)}
```

Add `import Image from 'next/image'` if not present.

- [ ] **Step 3: Update movie detail page**

Same pattern in `src/app/movies/[slug]/page.tsx`:

```tsx
{movie.coverUrl && (
  <div className="mb-4">
    <Image
      src={movie.coverUrl}
      alt={`${movie.title} 포스터`}
      width={150}
      height={220}
      className="rounded-[var(--radius-toss-sm)] shadow-[var(--shadow-toss)]"
    />
  </div>
)}
```

- [ ] **Step 4: Update BookCard thumbnail**

Read `src/components/BookCard.tsx`. Add a small thumbnail (40×60) at the start of the card row, conditional on `book.coverUrl`. If `BookCard` props don't include `coverUrl`, extend the interface.

Sample insertion (place at the start of the inner flex row):

```tsx
{book.coverUrl ? (
  <Image
    src={book.coverUrl}
    alt=""
    width={40}
    height={60}
    className="rounded-sm object-cover flex-shrink-0"
  />
) : null}
```

Same for `MovieCard.tsx`.

- [ ] **Step 5: Build**

```bash
pnpm build 2>&1 | tail -30
```

If `next/image` errors about unknown domain when actually rendering, add that host to `remotePatterns`.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/app/books/[slug]/page.tsx src/app/movies/[slug]/page.tsx src/components/BookCard.tsx src/components/MovieCard.tsx
git commit -m "feat(ui): display external cover on book/movie detail pages + cards

next.config images.remotePatterns에 image.tmdb.org / image.nl.go.kr 추가.
coverUrl 있는 레코드만 표지 렌더 (없으면 기존 레이아웃 그대로)."
```

---

## Task 15: Env Vars + README

**Files:**
- Create or modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add env example file**

If `.env.example` doesn't exist, create it. Otherwise append:

```
# 외부 작품 검색 API (책: 국립중앙도서관 SeoJi, 영화: TMDB v3)
NL_KR_API_KEY=
TMDB_API_KEY=
```

- [ ] **Step 2: Update README**

Find the section in `README.md` that lists environment variables (or the "Quick start" / "환경 변수" section). Add a short note:

```markdown
### 외부 작품 검색 API (선택)

리뷰 작성 시 책·영화 정보 자동 채우기를 사용하려면:

- `NL_KR_API_KEY` — [국립중앙도서관 SeoJi](https://www.nl.go.kr/seoji) 인증키
- `TMDB_API_KEY` — [TMDB v3](https://www.themoviedb.org/settings/api) API 키

키 없이도 사이트 자체는 정상 작동합니다 (검색 바에 503 에러 toast가 뜸).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add NL_KR_API_KEY / TMDB_API_KEY env vars

외부 작품 검색 옵트인 환경변수. README에 사용처와 발급 링크 명시."
```

---

## Task 16: E2E Smoke Test

**Files:**
- Create: `tests/e2e/external-search.spec.ts`

- [ ] **Step 1: Examine existing e2e setup**

```bash
ls tests/e2e/ && cat tests/e2e/auth.spec.ts | head -40
```

Identify the existing login helper / fixtures pattern. Reuse it.

- [ ] **Step 2: Write the spec**

`tests/e2e/external-search.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('External book search → autofill → save', () => {
  test('new book flow with stubbed external API', async ({ page, context }) => {
    // Login (reuse existing helper if available — adjust as needed)
    await page.goto('/login')
    await page.fill('input[name="username"]', process.env.E2E_USER ?? 'admin')
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD ?? 'admin1234')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/')

    // Stub external search to avoid real upstream
    await page.route('**/api/external/books/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'nl-kr',
          items: [
            {
              externalId: '9788983920775',
              title: '해리 포터와 마법사의 돌',
              byline: '조앤 K. 롤링',
              year: 1999,
              genre: '소설',
              coverUrl: 'https://image.nl.go.kr/test.jpg',
            },
          ],
        }),
      })
    })
    await page.route('**/api/books/by-external**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"counts":{}}' })
    })

    await page.goto('/books/new')

    // Type query, expect dropdown
    await page.getByPlaceholder(/제목으로 검색/).fill('해리포터')
    await expect(page.getByText('해리 포터와 마법사의 돌')).toBeVisible({ timeout: 5000 })

    // Select item
    await page.getByText('해리 포터와 마법사의 돌').click()

    // Verify autofill
    await expect(page.locator('input').filter({ hasText: '' }).first()).toHaveValue(/해리/)
    // Verify chip rendered (다시 검색 button visible)
    await expect(page.getByRole('button', { name: '다시 검색' })).toBeVisible()

    // Fill remaining: read date is today by default, rating default 6 — just submit
    await page.locator('.toastui-editor-defaultUI textarea, .ProseMirror, [contenteditable="true"]').first().fill('재밌었어요')

    await page.click('button[type="submit"]:has-text("등록")')
    await page.waitForURL(/\/books\/.+/)

    // Verify detail page shows cover
    await expect(page.locator('img[alt*="표지"]')).toBeVisible({ timeout: 5000 })
  })
})
```

(The selectors are approximate — adjust to match your actual form markup. Run against a real dev server.)

- [ ] **Step 3: Run E2E**

```bash
pnpm e2e tests/e2e/external-search.spec.ts 2>&1 | tail -40
```

Iterate selectors until pass. If MarkdownEditor selector doesn't match, use the pattern from `tests/e2e/golden-path.spec.ts` (if exists) — that flow likely already handles editor input.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/external-search.spec.ts
git commit -m "test(e2e): external book search → autofill → save golden path

Playwright route stub으로 외부 API 응답 mocking — 실제 upstream 안 부름.
flaky 회피 + CI에서 키 없이도 작동."
```

---

## Task 17: Full Verification Pass

**Files:** (none modified — verification only)

- [ ] **Step 1: Run full unit test suite**

```bash
pnpm test 2>&1 | tail -40
```

Expected: all green.

- [ ] **Step 2: Run lint**

```bash
pnpm lint 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Run production build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: build OK, no type errors.

- [ ] **Step 4: Run E2E suite**

```bash
pnpm e2e 2>&1 | tail -30
```

Expected: all green including the new external-search spec.

- [ ] **Step 5: Manual smoke (optional but recommended)**

If `NL_KR_API_KEY` and `TMDB_API_KEY` configured in `.env.local`:

```bash
pnpm dev &
DEV_PID=$!
sleep 8
echo "Open http://localhost:3000/books/new → type '해리포터' → verify dropdown with real results"
echo "Open http://localhost:3000/movies/new → type '파이트 클럽' → verify dropdown with real results"
echo "Select item, save, view detail page → verify cover renders"
echo "Edit, click chip ×, save → verify cover gone from detail"
kill $DEV_PID
```

- [ ] **Step 6: Final commit (if any documentation polish came up)**

If during verification you spot a doc improvement, commit it. Otherwise skip.

- [ ] **Step 7: Update memory observations (optional)**

Note the completion in working memory if appropriate.

---

## Self-Review Notes

After plan write, fresh-eyes audit:

1. **Spec coverage** — all 11 spec sections mapped:
   - §1 목적/비목표 → Task 1-2 (schema/validation are foundational)
   - §2 Architecture → Task 3-11 (full chain implemented)
   - §3 Schema/DB → Task 1 + migration generated
   - §4 External clients + Proxy → Task 3-6
   - §5 UI → Task 9-13 (cmdk + bars + form integration)
   - §6 Error matrix → covered in Tasks 6/9 implementation
   - §7 Security → `requireUser` + zod url + remotePatterns covered in Task 6/8/14
   - §8 Testing → Tasks 2/3/4/5/6/8 unit+integration, Task 16 E2E
   - §9 File manifest → matches actual tasks
   - §10 Future migration trigger → documentation only, no implementation
   - §11 Open questions → flagged inline in Task 5 (SRU host) and Task 4 (TMDB director)

2. **Placeholder scan** — no "TBD", "TODO", "similar to". All code blocks are complete. Open questions explicitly call out where adapter implementer must inspect actual API response.

3. **Type consistency** —
   - `BookSelection`/`MovieSelection` shapes consistent across Tasks 11/12/13
   - `ExternalSearchItem<TId>` ID type matches usage: `string` for books, `number` for movies, throughout
   - Route handler signatures `GET(req: Request): Promise<Response>` consistent
   - `countBooksByExternalIds` returns `Map<string, number>`; route serializes to `Record<string, number>` — explicit conversion shown in Task 8

4. **Spec-to-task gap check** — none found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-external-book-movie-search.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
