# 영화 (Movies) 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `books` 도메인과 평행한 `movies` 도메인 신설. CRUD/공개 피드/홈 통계까지 일관된 UX. 부수로 queries.ts 모듈 분할 + Vercel SpeedInsights 번들.

**Architecture:** SQLite/Turso + Drizzle ORM. 멀티테넌트(`authorUserId` FK + composite indexes + `requireOwn*` helpers + slug retry). 컴포넌트는 차등 전략 — `Filters`는 props 확장으로 공유, `MovieCard`/`MovieForm`/`PublicMovieCard`는 분리. `/feed`는 탭 전환 (UNION 없음). 책 도메인 함수/라우트/페이지의 1:1 미러링.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (libsql/Turso), Zod, Biome, Vitest, Playwright, Tailwind v4, sonner.

**Spec:** `docs/superpowers/specs/2026-05-28-movies-feature-design.md`

---

## Conventions

**Commit format:** Conventional Commits style — `feat(movies): ...`, `refactor(queries): ...`, `test(movies): ...`, `chore(deps): ...`.

**Commands:**
- Tests: `pnpm test <path>` (vitest) — both unit & integration.
- Lint: `pnpm lint` (Biome check). Auto-fix: `pnpm format`.
- E2E: `pnpm e2e` (Playwright). Single spec: `pnpm e2e <spec-path>`.
- Drizzle (반드시 dotenv prefix): `pnpm exec dotenv -e .env.local -- drizzle-kit generate` / `push`.

**TDD pattern**: 새 기능은 실패 테스트 먼저 → 최소 구현 → 통과 → 커밋. 순수 이동·리팩토링은 기존 테스트 통과로 충분.

**Verification gates**: 각 Phase 끝나면 (a) `pnpm lint` (b) `pnpm test` (c) 해당 phase 관련 e2e만 (전체 e2e는 마지막).

---

## File Structure

### Created
- `src/lib/db/queries/shared.ts` — `escapeLikePattern`, `isSlugUniqueViolation`, slug retry helper
- `src/lib/db/queries/books.ts` — 책 CRUD + listRecentPublicBooks
- `src/lib/db/queries/writings.ts` — 글 CRUD
- `src/lib/db/queries/tags.ts` — 태그 자동완성 + attachTagsBatch*
- `src/lib/db/queries/users.ts` — admin 사용자 쿼리
- `src/lib/db/queries/stats.ts` — `getUserStats`, `getUserMovieStats` (신규)
- `src/lib/db/queries/movies.ts` — 영화 CRUD + `listRecentPublicMovies` (신규)
- `src/components/MovieCard.tsx` (신규)
- `src/components/MovieForm.tsx` (신규)
- `src/components/PublicMovieCard.tsx` (신규)
- `src/app/api/movies/route.ts` (신규)
- `src/app/api/movies/[id]/route.ts` (신규)
- `src/app/api/movies/slug/[slug]/route.ts` (신규)
- `src/app/movies/page.tsx` (신규)
- `src/app/movies/[slug]/page.tsx` (신규)
- `src/app/movies/[slug]/loading.tsx` (신규)
- `src/app/movies/new/page.tsx` (신규)
- `src/app/movies/edit/[id]/page.tsx` (신규)
- `tests/integration/movies-scoping.test.ts` (신규)
- `tests/e2e/movies-golden-path.spec.ts` (신규)
- `tests/e2e/feed-tab.spec.ts` (신규)
- 신규 Drizzle 마이그레이션 (`drizzle/00XX_movies_feature.sql`) — `drizzle-kit generate` 산출물

### Modified
- `src/lib/db/schema.ts` — `movies`, `movieTags`, relations, types
- `src/lib/genres.ts` — `GENRES` → `BOOK_GENRES` rename + 신규 `MOVIE_GENRES`
- `src/lib/auth-helpers.ts` — `requireOwnMovie`, `requireOwnMovieForPage` 추가
- `src/lib/validations.ts` — `CreateMovieSchema`, `UpdateMovieSchema`, `ListMoviesQuerySchema`, `FeedQuerySchema`
- `src/lib/db/queries.ts` — barrel re-export hub (기존 import 경로 보존)
- `src/components/Filters.tsx` — `basePath`, `genres` props 추가
- `src/app/api/feed/route.ts` — `type=book|movie` 분기
- `src/app/feed/page.tsx` — 탭 UI + `type` 분기
- `src/app/page.tsx` — 홈 영화 통계 섹션 추가
- `src/app/layout.tsx` — 네비 "🎬 영화관" 링크 + `<SpeedInsights />`
- `src/app/books/page.tsx` — `<Filters />` 호출에 `basePath="/books"`, `genres={BOOK_GENRES}` 전달
- `tests/factories.ts` — `createMovie` 추가
- `tests/e2e/global-setup.ts` (또는 시드 위치) — alice·bob 영화 시드
- `tests/unit/validations.test.ts` — movies 스키마 경계값
- `tests/unit/components.test.tsx` — MovieCard, PublicMovieCard, MovieForm, Filters props
- `tests/integration/stats-and-pagination.test.ts` — `getUserMovieStats` + listMovies pagination
- `package.json` — `@vercel/speed-insights` 의존성

---

## Phase 0: Genre 상수 분리 (사전 리팩토링)

**Why first**: 이후 모든 phase가 `BOOK_GENRES` 이름에 의존. 영화 phase에서 `MOVIE_GENRES`도 같이 도입.

### Task 0.1: Genre 상수 추가·리네임

**Files:**
- Modify: `src/lib/genres.ts`
- Modify (참조 추적): `src/lib/validations.ts:3,21,47,127` (`GENRES` import)
- Modify (참조 추적): 다른 `GENRES` import 사용처 — `rg "from '@/lib/genres'" -l` 로 사전 조사

- [ ] **Step 1: 사용처 사전 조사**

Run: `rg "from '@/lib/genres'" -l src/`
Expected: 후속 step 에서 patch 할 파일 목록 확보.

- [ ] **Step 2: `src/lib/genres.ts` 갱신**

Edit `src/lib/genres.ts`:

```ts
export const BOOK_GENRES = [
  '소설',
  '추리/스릴러',
  '판타지/SF',
  '시',
  '에세이',
  '인문/철학',
  '역사',
  '사회/경제',
  '과학/IT',
  '자기계발',
  '예술',
  '종교',
  '만화',
  '기타',
] as const

export type BookGenre = (typeof BOOK_GENRES)[number]

export function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === 'string' && (BOOK_GENRES as readonly string[]).includes(value)
}

export const MOVIE_GENRES = [
  '액션',
  '드라마',
  '코미디',
  'SF',
  '로맨스',
  '스릴러',
  '다큐멘터리',
  '애니메이션',
  '공포',
  '기타',
] as const

export type MovieGenre = (typeof MOVIE_GENRES)[number]

export function isMovieGenre(value: unknown): value is MovieGenre {
  return typeof value === 'string' && (MOVIE_GENRES as readonly string[]).includes(value)
}
```

(주: 기존 `GENRES`, `Genre`, `isGenre`는 삭제. 사용처에서 `BOOK_GENRES`로 일괄 치환.)

- [ ] **Step 3: 사용처 일괄 치환**

각 사용처 파일에서:
- `import { GENRES } from '@/lib/genres'` → `import { BOOK_GENRES } from '@/lib/genres'`
- `GENRES` 식별자 → `BOOK_GENRES`
- `Genre` 타입 → `BookGenre`
- `isGenre(...)` → `isBookGenre(...)`

확인 사용처(최소): `src/lib/validations.ts`, `src/components/BookForm.tsx`, `src/components/Filters.tsx`.

- [ ] **Step 4: 타입 체크 + lint + 테스트**

```bash
pnpm lint
pnpm test tests/unit/validations.test.ts
```

Expected: PASS (validations는 BOOK_GENRES 기준 그대로 동작).

- [ ] **Step 5: Commit**

```bash
git add src/lib/genres.ts src/lib/validations.ts src/components/BookForm.tsx src/components/Filters.tsx
git commit -m "refactor(genres): rename GENRES to BOOK_GENRES and add MOVIE_GENRES"
```

---

## Phase 1: Queries 파일 분리 (순수 리팩토링)

**Goal**: `src/lib/db/queries.ts` (826줄, 26.3KB) → 도메인별 모듈로 분할. 동작 변화 0, 기존 import 경로 보존.

**Approach**: 단일 큰 커밋 한 번 (git diff로 rename 추적 가능하도록 ordering 유지). 후속 phase에서 신규 함수만 신규 파일에 추가.

### Task 1.1: 디렉터리 + shared helpers 추출

**Files:**
- Create: `src/lib/db/queries/shared.ts`
- Modify: `src/lib/db/queries.ts` (shared helpers 부분 제거 후 신규 모듈 re-export)

- [ ] **Step 1: queries.ts 구조 파악**

Read `src/lib/db/queries.ts` 1-50줄. `escapeLikePattern`, `isSlugUniqueViolation`, slug retry helper 위치 식별. (정확한 라인은 파일 읽고 확정)

- [ ] **Step 2: `queries/shared.ts` 생성**

`escapeLikePattern`, `isSlugUniqueViolation`, slug retry helper(`generateUniqueSlug` 또는 동등 함수)를 그대로 이동. 코드 변경 없이 cut-and-paste.

- [ ] **Step 3: queries.ts에서 해당 함수 제거 후 re-export**

`src/lib/db/queries.ts` 상단에 추가:

```ts
export * from './queries/shared'
```

`shared.ts`로 옮긴 함수의 원본 정의는 queries.ts에서 제거. 사용처는 같은 파일 내부였다면 `import { ... } from './queries/shared'`로 변경.

- [ ] **Step 4: 검증**

```bash
pnpm lint
pnpm test
```

Expected: 모든 기존 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/ src/lib/db/queries.ts
git commit -m "refactor(queries): extract shared helpers to queries/shared.ts"
```

### Task 1.2: 도메인별 모듈 추출 (books, writings, tags, users, stats)

**Files:**
- Create: `src/lib/db/queries/books.ts`, `queries/writings.ts`, `queries/tags.ts`, `queries/users.ts`, `queries/stats.ts`
- Modify: `src/lib/db/queries.ts` → barrel only

- [ ] **Step 1: 함수 매핑 표 작성**

(임시 메모 — 커밋 안 함) 현재 `queries.ts`의 각 export를 도메인별로 분류:

| 모듈 | 함수 |
|---|---|
| books | `createBook`, `updateBook`, `deleteBook`, `getBookBySlug`, `getBookById`, `listBooks`, `searchBooks`, `countBooks`, `countSearchBooks`, `listGenresWithCounts`, `listRecentPublicBooks`, `countPublicBooks`, `ListBookFilters`, `PublicBookCard`, `BookWithTags` 등 |
| writings | `createWriting`, `updateWriting`, `deleteWriting`, `getWritingBySlug`, `getWritingById`, `listWritings`, `searchWritings`, `countSearchWritings`, `countWritings`, `listTagsForWriting` |
| tags | `attachTagsBatch`, `attachTagsToWritingsBatch`, `listTagsForBook`, 자동완성 함수 |
| users | (admin 사용자 관리 — 현재 별도 함수 적으면 user 모듈 생략 가능, 없으면 task 1.2 빈 모듈 skip) |
| stats | `getUserStats`, `UserStats` 타입 |

정확한 export 목록은 `grep -n "^export " src/lib/db/queries.ts` 결과 기반.

- [ ] **Step 2: 각 모듈 파일 생성, 함수 이동**

각 함수를 해당 도메인 모듈로 cut-and-paste. import는 `@/lib/db/schema`, `@/lib/db/client`, `./shared`, drizzle helper 등 그대로 유지. 함수 본문 수정 0.

`queries/books.ts` 등에서 다른 모듈 함수(`attachTagsBatch` 등) 사용 시 `import { attachTagsBatch } from './tags'` 추가.

- [ ] **Step 3: `queries.ts`를 barrel-only로 축소**

```ts
export * from './queries/shared'
export * from './queries/books'
export * from './queries/writings'
export * from './queries/tags'
export * from './queries/stats'
// users 모듈 만들었으면: export * from './queries/users'
```

(주: `export type ...`도 자동 포함되도록 각 모듈에서 `export interface`/`export type` 그대로 유지.)

- [ ] **Step 4: 검증 — 컴파일 + 전체 테스트**

```bash
pnpm lint
pnpm test
```

Expected: 모든 기존 테스트 PASS. 라우트·페이지 컴파일 OK (import 경로 `@/lib/db/queries` 보존됨).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/ src/lib/db/queries.ts
git commit -m "refactor(queries): split queries.ts into domain modules (books/writings/tags/stats)"
```

---

## Phase 2: Movies Schema + Drizzle 마이그레이션

### Task 2.1: 스키마 정의

**Files:**
- Modify: `src/lib/db/schema.ts` (movies 테이블 + movie_tags + relations + types 추가)

- [ ] **Step 1: 스키마 추가**

Edit `src/lib/db/schema.ts` — 기존 `writingTagsRelations` 정의 아래에 movies 정의 추가:

```ts
export const movies = sqliteTable(
  'movies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    director: text('director').notNull(),
    genre: text('genre').notNull(),
    watchedDate: text('watched_date').notNull(),
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    oneLineReview: text('one_line_review'),
    isPublic: integer('is_public').notNull().default(1),
    publishedAt: integer('published_at'),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_movies_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_movies_user_slug').on(t.authorUserId, t.slug),
    userDateIdx: index('idx_movies_user_date').on(t.authorUserId, sql`${t.watchedDate} DESC`),
    userGenreIdx: index('idx_movies_user_genre').on(t.authorUserId, t.genre),
    userRatingIdx: index('idx_movies_user_rating').on(t.authorUserId, sql`${t.rating} DESC`),
    publicPublishedIdx: index('idx_movies_public_published').on(
      t.isPublic,
      sql`${t.publishedAt} DESC`,
    ),
    ratingCheck: check('movies_rating_range', sql`${t.rating} BETWEEN 1 AND 10`),
  }),
)

export const movieTags = sqliteTable(
  'movie_tags',
  {
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.movieId, t.tagId] }),
    tagIdx: index('idx_movie_tags_tag').on(t.tagId),
  }),
)

export const moviesRelations = relations(movies, ({ one, many }) => ({
  author: one(users, { fields: [movies.authorUserId], references: [users.id] }),
  movieTags: many(movieTags),
}))
export const movieTagsRelations = relations(movieTags, ({ one }) => ({
  movie: one(movies, { fields: [movieTags.movieId], references: [movies.id] }),
  tag: one(tags, { fields: [movieTags.tagId], references: [tags.id] }),
}))

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type MovieTag = typeof movieTags.$inferSelect
export type NewMovieTag = typeof movieTags.$inferInsert
```

- [ ] **Step 2: 기존 relations 확장**

같은 파일 안 `usersRelations`, `tagsRelations` 수정:

```ts
export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  writings: many(writings),
  movies: many(movies),    // 추가
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
  writingTags: many(writingTags),
  movieTags: many(movieTags),   // 추가
}))
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm lint
```

Expected: lint pass. (실제 마이그레이션 적용 전이므로 런타임 테스트는 다음 task.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): add movies and movie_tags tables"
```

### Task 2.2: 마이그레이션 generate + 수동 검증

**Files:**
- Create: `drizzle/00XX_<name>.sql` (drizzle-kit 산출물)

- [ ] **Step 1: 마이그레이션 생성**

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
```

Expected: `drizzle/` 에 새 SQL 파일 생성. `drizzle/meta/_journal.json` 업데이트.

- [ ] **Step 2: SQL 수동 검증**

새 SQL 파일 열어 다음 확인:
- `CREATE TABLE movies (...)` — 컬럼 14개 + CHECK constraint 1개
- `CREATE TABLE movie_tags (...)` — composite PK + 2 FK
- 인덱스 7개 (movies 6개 + movie_tags 1개)
- **Composite index `(col1, col2 DESC)` 문법 정상**: `CREATE INDEX ... ON movies(author_user_id, watched_date DESC)` 형태. 이전 rating 마이그레이션에서 깨졌던 부분(obs 1327).

깨진 곳 있으면 수동 패치 후 저장.

- [ ] **Step 3: 로컬 DB 적용**

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit push
```

(또는 프로젝트의 마이그레이션 runner 명령 — 기존 패턴 따라.)

Expected: 신규 테이블·인덱스 생성. 기존 데이터 영향 0.

- [ ] **Step 4: 테스트 setup-db 동작 확인**

```bash
pnpm test tests/integration/books-scoping.test.ts
```

Expected: PASS. `tests/setup-db.ts`가 `drizzle/*.sql`을 sorted order로 읽어 in-memory DB에 적용하므로 신규 마이그레이션도 자동 포함됨.

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "feat(db): add movies/movie_tags migration"
```

---

## Phase 3: Validation 스키마

### Task 3.1: Movies zod 스키마

**Files:**
- Modify: `src/lib/validations.ts`
- Test: `tests/unit/validations.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Edit `tests/unit/validations.test.ts` — 파일 끝에 추가:

```ts
import { CreateMovieSchema, UpdateMovieSchema, ListMoviesQuerySchema, FeedQuerySchema } from '@/lib/validations'

describe('CreateMovieSchema', () => {
  const valid = {
    title: '인셉션',
    director: '크리스토퍼 놀란',
    genre: 'SF',
    watchedDate: '2026-01-15',
    rating: 9,
    content: '',
    tags: [],
  }

  test('valid input parses', () => {
    expect(CreateMovieSchema.safeParse(valid).success).toBe(true)
  })

  test('rating below 1 rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false)
  })

  test('rating above 10 rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, rating: 11 }).success).toBe(false)
  })

  test('invalid genre rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, genre: '소설' }).success).toBe(false)
  })

  test('invalid date format rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, watchedDate: '2026/01/15' }).success).toBe(false)
  })

  test('isPublic defaults to true', () => {
    const parsed = CreateMovieSchema.parse(valid)
    expect(parsed.isPublic).toBe(true)
  })

  test('empty oneLineReview becomes null', () => {
    const parsed = CreateMovieSchema.parse({ ...valid, oneLineReview: '   ' })
    expect(parsed.oneLineReview).toBeNull()
  })
})

describe('UpdateMovieSchema', () => {
  test('empty object parses to empty (partial update)', () => {
    const parsed = UpdateMovieSchema.parse({})
    expect(parsed).toEqual({})
  })
})

describe('ListMoviesQuerySchema', () => {
  test('genre must be MOVIE_GENRES', () => {
    expect(ListMoviesQuerySchema.safeParse({ genre: '액션' }).success).toBe(true)
    expect(ListMoviesQuerySchema.safeParse({ genre: '소설' }).success).toBe(false)
  })
})

describe('FeedQuerySchema', () => {
  test('type defaults to book', () => {
    expect(FeedQuerySchema.parse({}).type).toBe('book')
  })

  test('type=movie accepted', () => {
    expect(FeedQuerySchema.parse({ type: 'movie' }).type).toBe('movie')
  })

  test('unknown type rejected', () => {
    expect(FeedQuerySchema.safeParse({ type: 'foo' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

```bash
pnpm test tests/unit/validations.test.ts
```

Expected: FAIL — `CreateMovieSchema` etc. not exported.

- [ ] **Step 3: 스키마 구현**

Edit `src/lib/validations.ts` — `import { GENRES }` 부분이 phase 0에서 `BOOK_GENRES`로 변경되어 있어야 함. `MOVIE_GENRES`도 추가 import:

```ts
import { BOOK_GENRES, MOVIE_GENRES } from './genres'
```

`CreateBookSchema` 정의 직후에 영화 스키마 추가:

```ts
export const CreateMovieSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    director: z.string().trim().min(1, '감독을 입력하세요').max(100),
    genre: z.enum(MOVIE_GENRES),
    watchedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
    rating: z.number().int().min(1).max(10),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
    tags: tagsArraySchema
      .default([])
      .transform((arr) =>
        Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))),
      ),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    isPublic: z.coerce.boolean().optional().default(true),
  })
  .strict()

export type CreateMovieInput = z.infer<typeof CreateMovieSchema>

export const UpdateMovieSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    director: z.string().trim().min(1).max(100).optional(),
    genre: z.enum(MOVIE_GENRES).optional(),
    watchedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
    rating: z.number().int().min(1).max(10).optional(),
    content: z.string().max(MAX_CONTENT_LEN).optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    oneLineReview: z
      .string()
      .trim()
      .max(150)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    isPublic: z.coerce.boolean().optional(),
  })
  .strict()

export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>

export const ListMoviesQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_Q).optional(),
  genre: z.enum(MOVIE_GENRES).optional(),
  tag: z.string().max(MAX_TAG_LEN).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  sort: z.enum(['date', 'rating']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const FeedQuerySchema = z.object({
  type: z.enum(['book', 'movie']).default('book'),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})
```

- [ ] **Step 4: 테스트 PASS 확인**

```bash
pnpm test tests/unit/validations.test.ts
```

Expected: 신규 테스트 모두 PASS, 기존 책/글 스키마 테스트도 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(validations): add movies and feed query schemas"
```

---

## Phase 4: Auth Helpers

### Task 4.1: `requireOwnMovie` 추가

**Files:**
- Modify: `src/lib/auth-helpers.ts`

- [ ] **Step 1: 헬퍼 추가**

Edit `src/lib/auth-helpers.ts` — `import` 라인에 `movies, type Movie` 추가:

```ts
import { books, writings, movies, type Book, type Writing, type Movie } from '@/lib/db/schema'
```

파일 끝에 추가:

```ts
/** API route용: 본인 영화 한 편 조회. 다른 사용자의 영화면 404. */
export async function requireOwnMovie(movieId: number): Promise<{ user: User; movie: Movie }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '영화를 찾을 수 없습니다' })
  return { user, movie: rows[0] }
}

/** 서버 컴포넌트(페이지)용: 다른 사용자의 영화면 notFound() throw. */
export async function requireOwnMovieForPage(
  movieId: number,
): Promise<{ user: User; movie: Movie }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, movie: rows[0] }
}
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-helpers.ts
git commit -m "feat(auth): add requireOwnMovie helpers"
```

(테스트는 Phase 5의 integration 테스트에서 함께 검증.)

---

## Phase 5: Movies Queries Module

### Task 5.1: `isSlugUniqueViolation` 패턴 확장

**Files:**
- Modify: `src/lib/db/queries/shared.ts`

- [ ] **Step 1: 함수 확인**

Read `src/lib/db/queries/shared.ts` — `isSlugUniqueViolation` 구현 확인. 기존 books·writings 인덱스 이름 매칭 패턴 파악.

- [ ] **Step 2: movies 패턴 추가**

해당 함수에 `idx_movies_user_slug` + `movies.slug` 시그니처 매칭 추가. (정확한 코드는 기존 패턴 확장 — 예: 정규식 alternation 또는 includes 리스트.)

예시 (실제 구조는 기존 함수에 맞춰):

```ts
const SLUG_INDEX_NAMES = [
  'idx_books_user_slug',
  'idx_writings_user_slug',
  'idx_movies_user_slug',   // 추가
]
const SLUG_COLUMN_SIGS = [
  'books.author_user_id, books.slug',
  'writings.author_user_id, writings.slug',
  'movies.author_user_id, movies.slug',   // 추가
]
```

- [ ] **Step 3: 검증 (Phase 5.2 통합 테스트에서 함께)**

이 step에서 단독 테스트 불필요 — Phase 5.2의 createMovie slug 충돌 테스트에서 자동 검증.

- [ ] **Step 4: Commit (Phase 5.2 함께)**

이 변경은 Phase 5.2의 첫 커밋에 같이 묶음.

### Task 5.2: `queries/movies.ts` 신규

**Files:**
- Create: `src/lib/db/queries/movies.ts`
- Modify: `src/lib/db/queries.ts` (barrel export 추가)
- Modify: `src/lib/db/queries/shared.ts` (Task 5.1)
- Modify: `tests/factories.ts` (createMovie 추가)
- Test: `tests/integration/movies-scoping.test.ts` (신규)

- [ ] **Step 1: `tests/factories.ts`에 `createMovie` 추가**

```ts
import { users, books, writings, movies } from '@/lib/db/schema'

export async function createMovie(
  db: TestDb,
  authorUserId: number,
  overrides: Partial<typeof movies.$inferInsert> = {},
) {
  const now = Date.now()
  const [m] = await db
    .insert(movies)
    .values({
      authorUserId,
      title: overrides.title ?? '테스트 영화',
      director: overrides.director ?? '감독',
      genre: overrides.genre ?? '드라마',
      watchedDate: overrides.watchedDate ?? '2026-01-01',
      rating: overrides.rating ?? 8,
      content: overrides.content ?? '',
      slug: overrides.slug ?? `movie-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      ...(overrides.isPublic !== undefined && { isPublic: overrides.isPublic }),
      ...(overrides.publishedAt !== undefined && { publishedAt: overrides.publishedAt }),
      ...(overrides.oneLineReview !== undefined && { oneLineReview: overrides.oneLineReview }),
    })
    .returning()
  return m
}
```

- [ ] **Step 2: 실패 integration 테스트 작성**

Create `tests/integration/movies-scoping.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createMovie } from '../factories'
import {
  createMovie as queryCreateMovie,
  updateMovie,
  deleteMovie,
  getMovieById,
  getMovieBySlug,
  listMovies,
  countMovies,
} from '@/lib/db/queries'

describe('movies — multi-tenant scoping', () => {
  let db: TestDb
  let close: () => Promise<void>

  beforeEach(async () => {
    const { db: testDb, client } = await makeTestDb()
    db = testDb
    close = async () => client.close()
  })

  afterEach(async () => {
    await close()
  })

  test('listMovies returns only own movies', async () => {
    const alice = await createUser(db, { username: 'alice' })
    const bob = await createUser(db, { username: 'bob' })
    await createMovie(db, alice.id, { title: 'Alice movie' })
    await createMovie(db, bob.id, { title: 'Bob movie' })

    const aliceList = await listMovies(db, alice.id, { sort: 'date', limit: 50, offset: 0 })
    expect(aliceList.map((m) => m.title)).toEqual(['Alice movie'])
  })

  test('countMovies scoped to user', async () => {
    const alice = await createUser(db, { username: 'alice' })
    const bob = await createUser(db, { username: 'bob' })
    await createMovie(db, alice.id, {})
    await createMovie(db, alice.id, {})
    await createMovie(db, bob.id, {})

    expect(await countMovies(db, alice.id, {})).toBe(2)
    expect(await countMovies(db, bob.id, {})).toBe(1)
  })

  test('getMovieById/Slug returns null for other users movie', async () => {
    const alice = await createUser(db, { username: 'alice' })
    const bob = await createUser(db, { username: 'bob' })
    const aliceMovie = await createMovie(db, alice.id, { title: 'A', slug: 'a-slug' })

    expect(await getMovieById(db, bob.id, aliceMovie.id)).toBeUndefined()
    expect(await getMovieBySlug(db, bob.id, 'a-slug')).toBeUndefined()
  })

  test('updateMovie cannot modify another users movie', async () => {
    const alice = await createUser(db, { username: 'alice' })
    const bob = await createUser(db, { username: 'bob' })
    const aliceMovie = await createMovie(db, alice.id, { title: 'A' })

    const result = await updateMovie(db, bob.id, aliceMovie.id, { title: 'hijacked' })
    expect(result).toBeUndefined()

    const reread = await getMovieById(db, alice.id, aliceMovie.id)
    expect(reread?.title).toBe('A')
  })

  test('deleteMovie cannot remove another users movie', async () => {
    const alice = await createUser(db, { username: 'alice' })
    const bob = await createUser(db, { username: 'bob' })
    const aliceMovie = await createMovie(db, alice.id, {})

    expect(await deleteMovie(db, bob.id, aliceMovie.id)).toBe(false)
    expect(await getMovieById(db, alice.id, aliceMovie.id)).toBeDefined()
  })

  test('createMovie slug collision retries with -2 suffix', async () => {
    const alice = await createUser(db, { username: 'alice' })
    await queryCreateMovie(db, alice.id, {
      title: '인셉션',
      director: '놀란',
      genre: 'SF',
      watchedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const second = await queryCreateMovie(db, alice.id, {
      title: '인셉션',
      director: '놀란',
      genre: 'SF',
      watchedDate: '2026-01-02',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    expect(second.slug).toMatch(/-2$/)
  })
})
```

- [ ] **Step 3: 테스트 실행하여 FAIL 확인**

```bash
pnpm test tests/integration/movies-scoping.test.ts
```

Expected: FAIL — `createMovie`, `updateMovie`, `listMovies` etc. not exported from `@/lib/db/queries`.

- [ ] **Step 4: `queries/movies.ts` 구현**

`src/lib/db/queries/books.ts`의 책 구현 패턴을 미러링. 함수 시그니처:

```ts
import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import { movies, movieTags, tags, type Movie } from '@/lib/db/schema'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import { escapeLikePattern, isSlugUniqueViolation, generateUniqueSlug } from './shared'
import { attachTagsBatch as _attachTagsToBooks } from './tags'   // 영화용 별도 함수 필요 시 신규
import { slugify } from '@/lib/slug'

type Db = LibSQLDatabase<typeof schema>

export type MovieWithTags = Movie & { tags: string[] }

export interface ListMovieFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export interface CreateMovieInput {
  title: string
  director: string
  genre: string
  watchedDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string | null
  isPublic: boolean
}

export async function createMovie(db: Db, authorUserId: number, input: CreateMovieInput): Promise<Movie> {
  return db.transaction(async (tx) => {
    const baseSlug = slugify(input.title)
    let attempt = 1
    const now = Date.now()
    const publishedAt = input.isPublic ? now : null
    while (attempt <= 100) {
      const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`
      try {
        const [row] = await tx
          .insert(movies)
          .values({
            authorUserId,
            title: input.title,
            director: input.director,
            genre: input.genre,
            watchedDate: input.watchedDate,
            rating: input.rating,
            content: input.content,
            oneLineReview: input.oneLineReview,
            isPublic: input.isPublic ? 1 : 0,
            publishedAt,
            slug,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        await syncMovieTags(tx, row.id, input.tags)
        return row
      } catch (e) {
        if (isSlugUniqueViolation(e)) {
          attempt += 1
          continue
        }
        throw e
      }
    }
    throw new Error('Failed to generate unique slug after 100 attempts')
  })
}

async function syncMovieTags(db: Db, movieId: number, tagNames: string[]): Promise<void> {
  // 1. 기존 movie_tags 제거
  await db.delete(movieTags).where(eq(movieTags.movieId, movieId))
  if (tagNames.length === 0) return
  // 2. tags upsert
  const existing = await db.select().from(tags).where(/* tagNames IN */ sql`name IN ${tagNames}`)
  const existingNames = new Set(existing.map((t) => t.name))
  const newNames = tagNames.filter((n) => !existingNames.has(n))
  const inserted = newNames.length > 0
    ? await db.insert(tags).values(newNames.map((name) => ({ name }))).returning()
    : []
  const allTags = [...existing, ...inserted]
  // 3. movie_tags 삽입
  await db.insert(movieTags).values(allTags.map((t) => ({ movieId, tagId: t.id })))
}

export async function updateMovie(
  db: Db,
  authorUserId: number,
  movieId: number,
  patch: Partial<CreateMovieInput>,
): Promise<Movie | undefined> {
  // books의 updateBook 패턴 미러링: 트랜잭션, ownership 체크, slug retry (title 변경 시), publishedAt 갱신
  // 자세한 구현은 src/lib/db/queries/books.ts updateBook 참고 후 movies로 치환
}

export async function deleteMovie(db: Db, authorUserId: number, movieId: number): Promise<boolean> {
  const result = await db
    .delete(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, authorUserId)))
  // returning rows count — drizzle libsql 패턴 확인
  return /* affected rows > 0 */ true
}

export async function getMovieById(db: Db, authorUserId: number, movieId: number): Promise<Movie | undefined> {
  const rows = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.authorUserId, authorUserId)))
    .limit(1)
  return rows[0]
}

export async function getMovieBySlug(db: Db, authorUserId: number, slug: string): Promise<MovieWithTags | undefined> {
  // books getBookBySlug 미러
}

export interface ListMovieResult extends Movie {
  tags: string[]
}

export async function listMovies(db: Db, authorUserId: number, filters: ListMovieFilters): Promise<ListMovieResult[]> {
  // books listBooks 미러 — composite index (user, watched_date DESC) / (user, rating DESC) 활용
  // 필터: genre, tag, year (watchedDate prefix), sort
  // LIKE 검색은 별도 searchMovies 함수
  // 결과에 attachTagsBatch 적용
}

export async function searchMovies(db: Db, authorUserId: number, q: string, opts: { limit: number; offset: number }): Promise<ListMovieResult[]> {
  // books searchBooks 미러 — title/director/content/tag LIKE
  // escapeLikePattern 사용 필수
}

export async function countMovies(db: Db, authorUserId: number, filters: Omit<ListMovieFilters, 'sort' | 'limit' | 'offset'>): Promise<number> {
  // listMovies와 동일 필터 — totalPages 일치
}

export async function countSearchMovies(db: Db, authorUserId: number, q: string): Promise<number> {
  // searchMovies와 동일 조건
}

export type PublicMovieCard = {
  id: number
  title: string
  director: string
  genre: string
  rating: number
  oneLineReview: string | null
  publishedAt: number
  authorDisplayName: string
}

export async function listRecentPublicMovies(db: Db, opts: { limit: number; offset?: number }): Promise<PublicMovieCard[]> {
  // books listRecentPublicBooks 미러 — WHERE is_public=1 AND published_at IS NOT NULL
  // ORDER BY published_at DESC
  // join users for displayName
}

export async function countPublicMovies(db: Db): Promise<number> {
  // listRecentPublicMovies와 동일 WHERE
}

export async function listTagsForMovie(db: Db, movieId: number): Promise<string[]> {
  // books listTagsForBook 미러
}

export async function attachTagsToMoviesBatch(db: Db, movieIds: number[]): Promise<Map<number, string[]>> {
  // tags attachTagsBatch 미러 — N+1 회피
}
```

(주: TODO 코멘트로 남긴 함수 본문은 모두 `queries/books.ts`의 대응 함수를 1:1 미러링. 차이점은 식별자만 — `books` → `movies`, `bookId` → `movieId`, `bookTags` → `movieTags`, `BookWithTags` → `MovieWithTags`, `author` 컬럼은 영화에 없음(`director`로 매핑) 단, `searchMovies`는 `director`도 LIKE 대상에 포함.)

- [ ] **Step 5: barrel re-export 추가**

`src/lib/db/queries.ts`:

```ts
export * from './queries/movies'
```

- [ ] **Step 6: 테스트 PASS 확인**

```bash
pnpm test tests/integration/movies-scoping.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 7: 회귀 — 전체 unit + integration**

```bash
pnpm test
```

Expected: 모든 기존 테스트도 여전히 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/queries/ src/lib/db/queries.ts tests/factories.ts tests/integration/movies-scoping.test.ts
git commit -m "feat(queries): add movies CRUD with multi-tenant scoping and slug retry"
```

---

## Phase 6: Stats 분리 + `getUserMovieStats`

### Task 6.1: `getUserMovieStats` 추가

**Files:**
- Modify: `src/lib/db/queries/stats.ts`
- Test: `tests/integration/stats-and-pagination.test.ts` (확장)

- [ ] **Step 1: 실패 테스트 추가**

Edit `tests/integration/stats-and-pagination.test.ts` — 영화 통계 테스트 추가:

```ts
import { getUserMovieStats } from '@/lib/db/queries'
import { createMovie } from '../factories'

describe('getUserMovieStats', () => {
  test('counts movies in given year only', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      // 2025년 createdAt
      await createMovie(db, alice.id, { createdAt: new Date('2025-06-01').getTime() })
      // 2026년 createdAt
      await createMovie(db, alice.id, { createdAt: new Date('2026-03-01').getTime() })
      await createMovie(db, alice.id, { createdAt: new Date('2026-04-01').getTime() })

      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.moviesTotal).toBe(3)
      expect(stats.moviesThisYear).toBe(2)
    } finally {
      client.close()
    }
  })

  test('avgMovieRating computed from existing movies', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      await createMovie(db, alice.id, { rating: 6 })
      await createMovie(db, alice.id, { rating: 10 })
      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.avgMovieRating).toBe(8)
    } finally {
      client.close()
    }
  })

  test('returns 0/null when user has no movies', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.moviesTotal).toBe(0)
      expect(stats.moviesThisYear).toBe(0)
      expect(stats.avgMovieRating).toBeNull()
    } finally {
      client.close()
    }
  })
})
```

- [ ] **Step 2: 실행하여 FAIL 확인**

```bash
pnpm test tests/integration/stats-and-pagination.test.ts
```

Expected: FAIL — `getUserMovieStats` not exported.

- [ ] **Step 3: 구현**

Edit `src/lib/db/queries/stats.ts` — 파일 끝에 추가:

```ts
import { movies } from '@/lib/db/schema'
import { count, eq, gte, lt, and, avg } from 'drizzle-orm'

export interface UserMovieStats {
  moviesTotal: number
  moviesThisYear: number
  avgMovieRating: number | null
  // 향후: movieGenreDistribution
}

export async function getUserMovieStats(
  db: Db,
  userId: number,
  year: number,
): Promise<UserMovieStats> {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime()
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime()

  const [totalRow] = await db
    .select({ c: count() })
    .from(movies)
    .where(eq(movies.authorUserId, userId))

  const [thisYearRow] = await db
    .select({ c: count() })
    .from(movies)
    .where(
      and(
        eq(movies.authorUserId, userId),
        gte(movies.createdAt, yearStart),
        lt(movies.createdAt, yearEnd),
      ),
    )

  const [avgRow] = await db
    .select({ a: avg(movies.rating) })
    .from(movies)
    .where(eq(movies.authorUserId, userId))

  return {
    moviesTotal: Number(totalRow.c),
    moviesThisYear: Number(thisYearRow.c),
    avgMovieRating: avgRow.a !== null ? Number(avgRow.a) : null,
  }
}
```

(Db 타입은 stats.ts 내 기존 import 활용. 없으면 `src/lib/db/queries/books.ts` 패턴 참고.)

- [ ] **Step 4: PASS 확인 + 전체 회귀**

```bash
pnpm test tests/integration/stats-and-pagination.test.ts
pnpm test
```

Expected: 모두 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/stats.ts tests/integration/stats-and-pagination.test.ts
git commit -m "feat(queries): add getUserMovieStats with year filter"
```

---

## Phase 7: API Routes

### Task 7.1: `/api/movies` (list + create)

**Files:**
- Create: `src/app/api/movies/route.ts`

- [ ] **Step 1: 라우트 작성**

Mirror `src/app/api/books/route.ts` (전체 59줄 — `books`→`movies`, schema/function 이름 치환):

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { countMovies, countSearchMovies, createMovie, listMovies, searchMovies } from '@/lib/db/queries'
import { CreateMovieSchema, ListMoviesQuerySchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

const PAGE_SIZE = 24

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const parsed = ListMoviesQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 쿼리 파라미터' }, { status: 400 })
    }
    const { q, genre, tag, year, sort, page } = parsed.data
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (q && q.trim().length > 0) {
      const [results, total] = await Promise.all([
        searchMovies(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
        countSearchMovies(db, user.id, q.trim()),
      ])
      return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
    }
    const filters = { genre, tag, year, sort: sort ?? ('date' as const) }
    const [list, total] = await Promise.all([
      listMovies(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
      countMovies(db, user.id, { genre, tag, year }),
    ])
    return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = CreateMovieSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const movie = await createMovie(db, user.id, parsed.data)
    return NextResponse.json({ id: movie.id, slug: movie.slug }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createMovie failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
pnpm lint
pnpm build 2>&1 | tail -5
```

Expected: 빌드 성공.

- [ ] **Step 3: Commit (Task 7.2와 묶음)**

### Task 7.2: `/api/movies/[id]` (get/patch/delete)

**Files:**
- Create: `src/app/api/movies/[id]/route.ts`

- [ ] **Step 1: 라우트 작성**

Mirror `src/app/api/books/[id]/route.ts` 전체. 치환: `book` → `movie`, `Book` → `Movie`, `requireOwnBook` → `requireOwnMovie`, `getBookById/updateBook/deleteBook` → `getMovieById/updateMovie/deleteMovie`, `UpdateBookSchema` → `UpdateMovieSchema`. 에러 메시지의 "책" → "영화".

- [ ] **Step 2: 컴파일 확인**

```bash
pnpm lint && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit (Task 7.3와 묶음)**

### Task 7.3: `/api/movies/slug/[slug]` (선택 — 필요 시)

기존 books에 `/api/books/slug/[slug]` 존재 여부 먼저 확인:

```bash
ls 'src/app/api/books/slug/' 2>&1
```

- 존재하면 미러링.
- 존재하지 않으면 이 task 삭제 (페이지에서 직접 server-side 조회로 충분).

- [ ] **Step 1: 조사 후 결정**

- [ ] **Step 2 (존재 시): 미러 라우트 작성**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/movies/
git commit -m "feat(api): add /api/movies CRUD routes"
```

### Task 7.4: `/api/feed` 확장

**Files:**
- Modify: `src/app/api/feed/route.ts`

- [ ] **Step 1: 현재 라우트 확인**

Read `src/app/api/feed/route.ts`.

- [ ] **Step 2: type 분기 추가**

`FeedQuerySchema` import 후 type=movie면 `listRecentPublicMovies`/`countPublicMovies` 호출. type=book(기본)이면 기존 동작.

예시:

```ts
import { FeedQuerySchema } from '@/lib/validations'
import { listRecentPublicBooks, countPublicBooks, listRecentPublicMovies, countPublicMovies } from '@/lib/db/queries'

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = FeedQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 쿼리 파라미터' }, { status: 400 })
    }
    const { type, page } = parsed.data
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (type === 'movie') {
      const [items, total] = await Promise.all([
        listRecentPublicMovies(db, { limit: PAGE_SIZE, offset }),
        countPublicMovies(db),
      ])
      return NextResponse.json({ items, total, page: currentPage, pageSize: PAGE_SIZE, type })
    }
    const [items, total] = await Promise.all([
      listRecentPublicBooks(db, { limit: PAGE_SIZE, offset }),
      countPublicBooks(db),
    ])
    return NextResponse.json({ items, total, page: currentPage, pageSize: PAGE_SIZE, type })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

(현재 라우트가 다른 시그니처면 패턴만 유지하고 응답 구조 맞춰서 확장.)

- [ ] **Step 3: 검증 + Commit**

```bash
pnpm lint && pnpm build 2>&1 | tail -5
git add src/app/api/feed/route.ts
git commit -m "feat(api): extend /api/feed with type=movie"
```

---

## Phase 8: UI 컴포넌트

### Task 8.1: `Filters` 컴포넌트 props 확장

**Files:**
- Modify: `src/components/Filters.tsx`
- Modify: `src/app/books/page.tsx` (호출부)
- Test: `tests/unit/components.test.tsx` (확장)

- [ ] **Step 1: 실패 테스트 작성**

Edit `tests/unit/components.test.tsx`:

```ts
import { render, screen } from '@testing-library/react'
import { Filters } from '@/components/Filters'
import { MOVIE_GENRES, BOOK_GENRES } from '@/lib/genres'

describe('Filters', () => {
  test('renders given genres as chips', () => {
    render(<Filters basePath="/movies" genres={MOVIE_GENRES} />)
    expect(screen.getByText('액션')).toBeInTheDocument()
    expect(screen.queryByText('소설')).toBeNull()
  })

  test('book mode renders book genres', () => {
    render(<Filters basePath="/books" genres={BOOK_GENRES} />)
    expect(screen.getByText('소설')).toBeInTheDocument()
    expect(screen.queryByText('액션')).toBeNull()
  })
})
```

(테스트 환경에서 `useRouter`, `useSearchParams` mock 필요 — 기존 테스트 패턴 따라.)

- [ ] **Step 2: 실패 확인**

```bash
pnpm test tests/unit/components.test.tsx
```

Expected: FAIL — Filters props 시그니처 다름.

- [ ] **Step 3: `Filters` 시그니처 변경**

Edit `src/components/Filters.tsx`:

```ts
interface FiltersProps {
  basePath: string
  genres: readonly string[]
}

export function Filters({ basePath, genres }: FiltersProps) {
  // ...
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <div className="flex items-center gap-3">
      <div ref={scrollRef} className="flex-1 -mx-1 -my-1.5 scroll-x-touch cursor-grab">
        <div className="flex gap-2 px-1 py-1.5">
          <ChipButton label="전체" active={currentGenre === ''} onClick={() => setParam('genre', null)} />
          {genres.map((g) => (
            <ChipButton key={g} label={g} active={currentGenre === g} onClick={() => setParam('genre', g)} />
          ))}
        </div>
      </div>
      {/* sort select 그대로 */}
    </div>
  )
}
```

(상단 `import { GENRES }`도 제거 — props로 받음.)

- [ ] **Step 4: 호출부 업데이트**

Edit `src/app/books/page.tsx`:

```ts
import { BOOK_GENRES } from '@/lib/genres'
// ...
<Filters basePath="/books" genres={BOOK_GENRES} />
```

- [ ] **Step 5: 테스트 PASS + 기존 책 페이지 회귀 안 깸 확인**

```bash
pnpm test tests/unit/components.test.tsx
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Filters.tsx src/app/books/page.tsx tests/unit/components.test.tsx
git commit -m "refactor(Filters): accept basePath and genres props"
```

### Task 8.2: `MovieCard` 신규

**Files:**
- Create: `src/components/MovieCard.tsx`
- Test: `tests/unit/components.test.tsx` (확장)

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { MovieCard } from '@/components/MovieCard'

describe('MovieCard', () => {
  const movie = {
    id: 1,
    slug: 'inception',
    title: '인셉션',
    director: '크리스토퍼 놀란',
    genre: 'SF',
    watchedDate: '2026-01-15',
    rating: 9,
    isPublic: 1 as const,
    tags: ['액션', '꿈'],
    // ...other required fields default-stub
  }

  test('renders title, director, watchedDate', () => {
    render(<MovieCard movie={movie} />)
    expect(screen.getByText('인셉션')).toBeInTheDocument()
    expect(screen.getByText('크리스토퍼 놀란')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()
  })

  test('links to /movies/[slug]', () => {
    render(<MovieCard movie={movie} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/movies/inception')
  })

  test('shows public badge when isPublic=1', () => {
    render(<MovieCard movie={movie} />)
    expect(screen.getByText(/공개/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: FAIL 확인**

```bash
pnpm test tests/unit/components.test.tsx
```

- [ ] **Step 3: 구현**

Mirror `src/components/BookCard.tsx` 전체 59줄. 치환:
- `book` prop → `movie` prop, `BookWithTags` → `MovieWithTags`
- `/books/${book.slug}` → `/movies/${movie.slug}`
- `book.author` → `movie.director`
- `book.readDate` → `movie.watchedDate`
- snippet/query props 동일 유지 (검색 하이라이트 영화에도 적용)
- "🌐 공개" 텍스트 유지 ("모두의 영화관에 공개됨" title 변경)

- [ ] **Step 4: PASS + Commit**

```bash
pnpm test tests/unit/components.test.tsx
git add src/components/MovieCard.tsx tests/unit/components.test.tsx
git commit -m "feat(MovieCard): add card component for movies list"
```

### Task 8.3: `PublicMovieCard` 신규

**Files:**
- Create: `src/components/PublicMovieCard.tsx`
- Test: `tests/unit/components.test.tsx` (확장)

- [ ] **Step 1: 실패 테스트 + Step 2: FAIL**

```ts
import { PublicMovieCard } from '@/components/PublicMovieCard'

describe('PublicMovieCard', () => {
  const item = {
    id: 1,
    title: '인셉션',
    director: '놀란',
    genre: 'SF',
    rating: 9,
    oneLineReview: '꿈 안의 꿈',
    publishedAt: Date.now() - 60_000,
    authorDisplayName: '앨리스',
  }

  test('renders director (not author)', () => {
    render(<PublicMovieCard item={item} />)
    expect(screen.getByText('놀란')).toBeInTheDocument()
  })

  test('omits oneLineReview when null', () => {
    render(<PublicMovieCard item={{ ...item, oneLineReview: null }} />)
    expect(screen.queryByText('꿈 안의 꿈')).toBeNull()
  })
})
```

- [ ] **Step 3: 구현 — Mirror `PublicReviewCard.tsx`**

치환: `PublicBookCard` → `PublicMovieCard` type, `item.author` → `item.director`.

- [ ] **Step 4: PASS + Commit**

```bash
git add src/components/PublicMovieCard.tsx tests/unit/components.test.tsx
git commit -m "feat(PublicMovieCard): add public feed card for movies"
```

### Task 8.4: `MovieForm` 신규

**Files:**
- Create: `src/components/MovieForm.tsx`
- Test: `tests/unit/components.test.tsx` (확장)

- [ ] **Step 1: 실패 테스트 작성 (기본값 검증만)**

```ts
import { MovieForm } from '@/components/MovieForm'

describe('MovieForm', () => {
  test('create mode: rating defaults to 6 (half-star semantic preserve)', () => {
    render(<MovieForm mode="create" />)
    // RatingStars 컴포넌트가 value=6 (half-star scale 3.0) 받는지 검증
    // 구체적 selector는 RatingStars 구현에 따라 조정
  })

  test('create mode: isPublic defaults to true', () => {
    render(<MovieForm mode="create" />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
```

- [ ] **Step 2: FAIL 확인**

- [ ] **Step 3: 구현 — Mirror `BookForm.tsx` 전체 251줄**

`src/components/MovieForm.tsx` 생성. `src/components/BookForm.tsx`를 복사해 다음 치환:

| Books | Movies |
|---|---|
| `BookForm`, `BookFormValues` | `MovieForm`, `MovieFormValues` |
| `import { GENRES }` | `import { MOVIE_GENRES }` (그리고 select map에서 `MOVIE_GENRES`) |
| `author` (필드, state, label) | `director`, label "감독" |
| `readDate` (필드, state, label) | `watchedDate`, label "본 날짜" |
| `/api/books` | `/api/movies` |
| `router.push('/books')` | `router.push('/movies')` |
| `router.push('/books/${data.slug}')` | `router.push('/movies/${data.slug}')` |
| "이 책을 한 줄로..." placeholder | "이 영화를 한 줄로..." |
| "이 독후감을 삭제할까요?" 다이얼로그 title | "이 영화 기록을 삭제할까요?" |
| "'${title || '제목 없음'}' 기록이 영구적으로 사라집니다" | (그대로 유지 — 책/영화 모두 자연스러움) |
| "모두의 서재에 공개" 토글 label | "모두의 영화관에 공개" |
| toggle description | "이 영화의 한줄평·별점·제목·감독을 모두의 영화관에서 다른 사람도 볼 수 있어요" |
| 성공 토스트 "등록되었습니다" | 그대로 |
| 별점 기본값 `initial?.rating ?? 6` | 그대로 (half-star semantic 보존) |
| `oneLineReview`, `isPublic`, `tags`, `content` | 그대로 |

`MovieFormValues` interface:

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
}
```

- [ ] **Step 4: PASS + Commit**

```bash
pnpm test tests/unit/components.test.tsx
git add src/components/MovieForm.tsx tests/unit/components.test.tsx
git commit -m "feat(MovieForm): add create/edit form for movies"
```

---

## Phase 9: Pages `/movies/*`

### Task 9.1: `/movies` 목록 페이지

**Files:**
- Create: `src/app/movies/page.tsx`

- [ ] **Step 1: 구현 — Mirror `src/app/books/page.tsx` 전체 146줄**

치환:
- `listBooks`, `countBooks`, `searchBooks`, `countSearchBooks` → movies 대응
- `BookCard` → `MovieCard`
- `/books`, `/books/new` → `/movies`, `/movies/new`
- "전체 책", "{n}권" → "전체 영화", "{n}편"
- "아직 책이 없어요" / "첫 독후감을 남겨보세요" → "아직 영화가 없어요" / "첫 감상을 남겨보세요"
- "찾는 책이 없어요" → "찾는 영화가 없어요"
- `<Filters />` → `<Filters basePath="/movies" genres={MOVIE_GENRES} />` (MOVIE_GENRES import 추가)
- `b.author` → `m.director` (검색 결과 메타 비교 부분)

- [ ] **Step 2: 빌드 확인**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit (Task 9.2~9.4와 묶음)**

### Task 9.2: `/movies/[slug]` 상세 페이지

**Files:**
- Create: `src/app/movies/[slug]/page.tsx`
- Create: `src/app/movies/[slug]/loading.tsx`

- [ ] **Step 1: 구현 — Mirror `src/app/books/[slug]/page.tsx`**

치환 패턴 동일 (books → movies). `requireOwnMovieForPage`, `getMovieBySlug`, `MarkdownViewer`(그대로), `RatingStars`(그대로), `GenreBadge`(그대로). 메타데이터 title도 "영화 - {제목}" 등으로.

- [ ] **Step 2: loading 미러**

`src/app/books/[slug]/loading.tsx` 복사.

- [ ] **Step 3: Commit (묶음)**

### Task 9.3: `/movies/new` + `/movies/edit/[id]`

**Files:**
- Create: `src/app/movies/new/page.tsx`
- Create: `src/app/movies/edit/[id]/page.tsx`

- [ ] **Step 1: new page**

```ts
import { MovieForm } from '@/components/MovieForm'

export default function NewMoviePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 영화 기록
      </h1>
      <MovieForm mode="create" />
    </div>
  )
}
```

- [ ] **Step 2: edit page — Mirror `src/app/books/edit/[id]/page.tsx`**

```ts
import { notFound } from 'next/navigation'
import { requireOwnMovieForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { listTagsForMovie } from '@/lib/db/queries'
import { MovieForm } from '@/components/MovieForm'

export default async function EditMoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { movie } = await requireOwnMovieForPage(numId)
  const tags = await listTagsForMovie(db, movie.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        영화 기록 수정
      </h1>
      <MovieForm
        mode="edit"
        initial={{
          ...movie,
          tags,
          oneLineReview: movie.oneLineReview ?? '',
          isPublic: movie.isPublic === 1,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/movies/
git commit -m "feat(pages): add /movies list/detail/new/edit"
```

---

## Phase 10: 홈 영화 통계 통합

### Task 10.1: `getUserMovieStats`를 홈에 연결

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 변경**

Edit `src/app/page.tsx`:

1. import 추가:
   ```ts
   import { getUserMovieStats } from '@/lib/db/queries'
   ```

2. `Promise.all` 확장:
   ```ts
   const [stats, movieStats, recentPublicBooks, recentWritings] = await Promise.all([
     getUserStats(db, me.id, thisYear),
     getUserMovieStats(db, me.id, thisYear),
     listRecentPublicBooks(db, { limit: 6 }),
     listWritings(db, me.id, { limit: 6 }),
   ])
   ```

3. EntryCard 섹션 (현재 책장+글방 2개 그리드)를 3개로 확장:
   ```ts
   <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
     {/* 기존 책장 EntryCard 그대로 */}
     {/* 기존 글방 EntryCard 그대로 */}
     <EntryCard
       href="/movies"
       emoji="🎬"
       label="영화관"
       count={movieStats.moviesTotal}
       unit="편"
       metrics={[
         `${thisYear}년 ${movieStats.moviesThisYear}편`,
         movieStats.moviesTotal > 0 && movieStats.avgMovieRating !== null
           ? `평균 ★${(movieStats.avgMovieRating / 2).toFixed(1)}`
           : null,
       ]}
       subAction={{ href: '/movies/new', label: '새 영화' }}
     />
   </section>
   ```

   (디자인 배치는 spec §10 deferred — 일단 3-column grid, 추후 검토.)

- [ ] **Step 2: 빌드 + 시각 확인 (수동)**

```bash
pnpm dev
```

브라우저에서 홈 페이지 확인 — 영화 EntryCard 표시 + 카운트 0 케이스 동작 OK.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): add movies entry card with year stats"
```

---

## Phase 11: `/feed` 탭 통합

### Task 11.1: 피드 페이지 탭 UI

**Files:**
- Modify: `src/app/feed/page.tsx`

- [ ] **Step 1: 변경**

Edit `src/app/feed/page.tsx`:

```ts
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import {
  listRecentPublicBooks,
  countPublicBooks,
  listRecentPublicMovies,
  countPublicMovies,
} from '@/lib/db/queries'
import { PublicReviewCard } from '@/components/PublicReviewCard'
import { PublicMovieCard } from '@/components/PublicMovieCard'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

const PAGE_SIZE = 24

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

type FeedType = 'book' | 'movie'
function parseType(v: string | undefined): FeedType {
  return v === 'movie' ? 'movie' : 'book'
}

interface SP {
  searchParams: Promise<{ page?: string; type?: string }>
}

export default async function FeedPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/feed')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const type = parseType(sp.type)
  const offset = (page - 1) * PAGE_SIZE

  const [items, total] = type === 'movie'
    ? await Promise.all([
        listRecentPublicMovies(db, { limit: PAGE_SIZE, offset }),
        countPublicMovies(db),
      ])
    : await Promise.all([
        listRecentPublicBooks(db, { limit: PAGE_SIZE, offset }),
        countPublicBooks(db),
      ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          모두의 {type === 'movie' ? '영화관' : '서재'}
        </h1>
        <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">
          {total}{type === 'movie' ? '편' : '권'}
        </span>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <TabLink href="/feed?type=book" active={type === 'book'} label="📚 책" />
        <TabLink href="/feed?type=movie" active={type === 'movie'} label="🎬 영화" />
      </div>

      {items.length === 0 ? (
        type === 'movie' ? (
          <EmptyState
            emoji="🎬"
            title="아직 공개된 영화가 없어요"
            description="내 영화를 공개하면 모두의 영화관에 올라와요"
            action={{ href: '/movies', label: '내 영화관으로 가기' }}
          />
        ) : (
          <EmptyState
            emoji="📭"
            title="아직 공개된 책이 없어요"
            description="내 책을 공개하면 모두의 서재에 올라와요"
            action={{ href: '/books', label: '내 책장으로 가기' }}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {type === 'movie'
              ? items.map((m) => <PublicMovieCard key={m.id} item={m as any} />)
              : items.map((b) => <PublicReviewCard key={b.id} item={b as any} />)}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/feed"
            preservedQuery={{ type }}
          />
        </>
      )}
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

(주: `Pagination` 컴포넌트가 `preservedQuery` prop을 받는지 확인 — books page에서 사용 중. 받지 않으면 시그니처 확장 또는 inline.)

- [ ] **Step 2: 빌드 + 수동 시각 확인**

```bash
pnpm dev
```

브라우저: `/feed?type=book`, `/feed?type=movie`, `/feed` (기본 book) 동작 확인.

- [ ] **Step 3: Commit**

```bash
git add src/app/feed/page.tsx
git commit -m "feat(feed): add book/movie tab toggle"
```

---

## Phase 12: 네비게이션

### Task 12.1: 영화 링크 + SpeedInsights 추가

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `package.json` (의존성)

- [ ] **Step 1: 의존성 추가**

```bash
pnpm add @vercel/speed-insights
```

Expected: `package.json` + `pnpm-lock.yaml` 갱신.

- [ ] **Step 2: layout 수정**

Edit `src/app/layout.tsx`:

1. import 추가:
   ```ts
   import { SpeedInsights } from '@vercel/speed-insights/next'
   ```

2. `<Analytics />` 옆에 추가:
   ```ts
   <Analytics />
   <SpeedInsights />
   ```

3. 네비에 영화 링크 추가 (책장/글방 사이 또는 글방 뒤):
   ```tsx
   <Link
     href="/movies"
     className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
   >
     🎬 영화관
   </Link>
   ```

   삽입 위치: 글방 링크 뒤, UserMenu 앞.

- [ ] **Step 3: 빌드 + dev 확인**

```bash
pnpm build 2>&1 | tail -5
pnpm dev
```

브라우저에서 네비 영화관 링크 클릭 → `/movies` 이동 확인.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat(layout): add movies nav link and Vercel SpeedInsights"
```

---

## Phase 13: E2E 시드 + 테스트

### Task 13.1: e2e 시드에 영화 추가

**Files:**
- Modify: `tests/e2e/global-setup.ts` (현재 시드 위치 — 다른 위치면 적절히 조정)

- [ ] **Step 1: 현재 시드 코드 확인**

Read `tests/e2e/global-setup.ts`. alice·bob 시드 로직 + 책 시드 패턴 파악.

- [ ] **Step 2: 영화 시드 추가**

알리스·밥 양쪽에 영화 N편 추가 (책 시드와 동등 개수). 패턴은 기존 책 시드 따라 — 직접 DB insert 또는 API 호출.

예시 (직접 insert):

```ts
import { movies } from '@/lib/db/schema'

// alice books 시드 직후
const aliceMoviesCount = ALICE_BOOK_TITLES.length  // 책 시드 수와 동등
for (let i = 0; i < aliceMoviesCount; i++) {
  await db.insert(movies).values({
    authorUserId: alice.id,
    title: `Alice movie ${i + 1}`,
    director: `Director ${i + 1}`,
    genre: 'SF',
    watchedDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    rating: 8,
    content: '',
    slug: `alice-movie-${i + 1}-${Date.now()}`,
    isPublic: 1,
    publishedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}
// bob도 동일 패턴
```

- [ ] **Step 3: e2e 빠른 확인 — 기존 e2e 깨지지 않음**

```bash
pnpm e2e tests/e2e/public-feed.spec.ts
```

Expected: 모든 시나리오 PASS (시드 추가는 기존 흐름 영향 0).

- [ ] **Step 4: Commit (Task 13.2와 묶음)**

### Task 13.2: 영화 golden-path e2e

**Files:**
- Create: `tests/e2e/movies-golden-path.spec.ts`

- [ ] **Step 1: spec 작성**

Mirror `tests/e2e/golden-path.spec.ts` 패턴. 흐름: 로그인 → `/movies/new` → 영화 생성 → 목록 표시 → 수정 → 공개 토글 → `/feed?type=movie`에 노출 → 삭제.

```ts
import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/movies/new')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/movies/new'), page.click('button[type="submit"]')])
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })
}

test('영화 생성 → 목록 → 수정 → 삭제 golden path', async ({ page }) => {
  await login(page)
  const uniqueTitle = `E2E 영화 ${Date.now()}`

  // 생성
  const inputs = page.locator('input')
  await inputs.nth(0).fill(uniqueTitle)
  await inputs.nth(1).fill('테스트 감독')
  await page.click('button:has-text("등록")')
  await page.waitForURL(/\/movies\/(?!new|edit)/, { timeout: 15_000 })

  // 목록 확인
  await page.goto('/movies')
  await expect(page.getByText(uniqueTitle)).toBeVisible()

  // 수정
  await page.getByText(uniqueTitle).click()
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/movies\/edit\//, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })
  const titleInput = page.locator('input').nth(0)
  await titleInput.fill(`${uniqueTitle} 수정됨`)
  await page.click('button:has-text("수정")')
  await page.waitForURL(/\/movies\/(?!new|edit)/, { timeout: 15_000 })

  // 삭제
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/movies\/edit\//, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })
  await page.click('button:has-text("삭제")')
  await page.click('button:has-text("삭제"):not(:has-text("삭제하"))')   // ConfirmDialog 확인
  await page.waitForURL('**/movies', { timeout: 10_000 })
  await expect(page.getByText(`${uniqueTitle} 수정됨`)).toHaveCount(0)
})
```

(셀렉터는 실제 UI에 맞춰 검증 후 보정.)

- [ ] **Step 2: 실행**

```bash
pnpm e2e tests/e2e/movies-golden-path.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit (Task 13.3과 묶음)**

### Task 13.3: `/feed` 탭 e2e

**Files:**
- Create: `tests/e2e/feed-tab.spec.ts`

- [ ] **Step 1: spec 작성**

```ts
import { test, expect } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

test('/feed 탭이 book/movie 사이 전환된다', async ({ page }) => {
  await page.goto('/login?next=/feed')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/feed'), page.click('button[type="submit"]')])

  // 기본은 book
  await expect(page).toHaveURL(/\/feed$/)
  await expect(page.getByRole('heading', { name: /모두의 서재/ })).toBeVisible()

  // 영화 탭 클릭
  await page.click('a:has-text("영화")')
  await expect(page).toHaveURL(/type=movie/)
  await expect(page.getByRole('heading', { name: /모두의 영화관/ })).toBeVisible()

  // 책 탭으로 복귀
  await page.click('a:has-text("책")')
  await expect(page).toHaveURL(/type=book/)
  await expect(page.getByRole('heading', { name: /모두의 서재/ })).toBeVisible()
})

test('/feed?type=movie 에 공개 영화가 표시된다', async ({ page }) => {
  await page.goto('/login?next=/feed?type=movie')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')

  await page.waitForURL(/type=movie/, { timeout: 10_000 })
  // 시드 영화 중 하나 (Alice movie 1) 표시 확인
  await expect(page.getByText(/Alice movie/)).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 2: 실행 + 회귀 (전체 e2e)**

```bash
pnpm e2e
```

Expected: 신규 + 기존 e2e 모두 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/
git commit -m "test(e2e): movies golden path and feed tab"
```

---

## Phase 14: 최종 검증

### Task 14.1: 전체 회귀 + 빌드

- [ ] **Step 1: 린트**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 2: 전체 테스트**

```bash
pnpm test
```

Expected: 모두 PASS.

- [ ] **Step 3: 전체 E2E**

```bash
pnpm e2e
```

Expected: 모두 PASS.

- [ ] **Step 4: 프로덕션 빌드**

```bash
pnpm build 2>&1 | tail -20
```

Expected: 성공. 빌드 산출물 사이즈 검토 (SpeedInsights 추가는 client bundle 미미).

- [ ] **Step 5: 수동 시각 점검**

`pnpm dev` 띄우고 브라우저에서:
- 홈 → 책장/글방/영화관 3-카드 표시 + 통계 정상
- 네비 → "🎬 영화관" 링크 작동
- `/movies` → 빈 상태 / 목록 / 필터 (장르=영화 장르) / 정렬 동작
- `/movies/new` → 폼 → 등록 → `/movies/[slug]` 이동
- 상세 페이지 → 수정 링크 → 수정 → 저장
- 공개 토글 ON → `/feed?type=movie` 노출 확인
- 공개 토글 OFF → 피드에서 사라짐
- 다른 사용자 영화 URL 직접 입력 → 404
- 별점 half-star 표시 정상

- [ ] **Step 6: 최종 Commit (필요시)**

수동 점검 중 발견된 작은 수정만 별도 commit. 없으면 skip.

---

## Phase 15: 프로덕션 배포

### Task 15.1: PR 생성 + 프로덕션 마이그레이션

- [ ] **Step 1: 변경 정리**

```bash
git log --oneline origin/main..HEAD
```

Phase 1 (queries 분리) 커밋 1-2개 + Phase 2~14 커밋 다수 확인.

- [ ] **Step 2: PR 옵션 선택**

PR 분할 옵션 (spec §7 권장):
- **옵션 A**: Phase 1만 별도 PR (queries 분리) 먼저 머지 → Phase 2~14 두 번째 PR.
- **옵션 B**: 모두 한 PR (atomic, 영화 기능 완전 일관).

이전 spec 결정: 사용자 선택 시점에 결정. 기본 권장 B (atomic).

- [ ] **Step 3: PR 생성**

```bash
gh pr create --title "feat(movies): 영화 기록 도메인 신설" --body "$(cat <<'EOF'
## Summary
- books와 평행한 movies 도메인 신설 (CRUD + 공개 피드)
- queries.ts 도메인별 모듈 분할
- Vercel SpeedInsights 번들

## Spec
docs/superpowers/specs/2026-05-28-movies-feature-design.md

## Test plan
- [ ] pnpm lint
- [ ] pnpm test (unit + integration)
- [ ] pnpm e2e
- [ ] pnpm build 성공
- [ ] 수동: /movies CRUD, /feed 탭, 홈 통계
EOF
)"
```

- [ ] **Step 4: CI 통과 확인**

GitHub Actions 결과 대기.

- [ ] **Step 5: 머지 후 프로덕션 마이그레이션**

Turso 프로덕션 DB에 Phase 2.2의 SQL 수동 적용. (이전 rating 마이그레이션 패턴 obs 1340 참고.)

```bash
# 프로덕션 URL 환경변수 확인
# turso db shell <db-name> < drizzle/00XX_movies_feature.sql
```

- [ ] **Step 6: 프로덕션 스모크 테스트**

배포 후 (Vercel CI/CD 자동), 프로덕션 URL에서 수동 확인:
- `/movies/new` 영화 생성
- `/feed?type=movie` 노출
- 홈 영화 통계 표시

---

## Self-Review

### Spec coverage 매핑

| Spec § | 해당 Phase/Task |
|---|---|
| §2 Schema | Phase 2 |
| §3.1 Auth helpers | Phase 4 |
| §3.2 Queries 분리 | Phase 1 |
| §3.3 Movies queries + stats | Phase 5, 6 |
| §3.4 isSlugUniqueViolation 패치 | Task 5.1 |
| §4.1 API routes | Phase 7.1~7.3 |
| §4.2 Feed API | Task 7.4 |
| §4.3 Validations | Phase 3 |
| §5.1 Components 차등 | Phase 8 |
| §5.2 Genres split | Phase 0 |
| §5.3 Pages | Phase 9 |
| §5.4 Home + Feed + Nav | Phase 10, 11, 12 |
| §6 Migration·Seed·Tests | Phase 2, 5, 6, 13 |
| §7 PR 분할 | Phase 15 |
| §8 SpeedInsights | Task 12.1 |

모든 spec 항목 task로 매핑됨. 누락 0.

### Type 일관성

- `MovieFormValues` (Phase 8.4) ↔ `CreateMovieInput` (Phase 3) ↔ `CreateMovieSchema` (Phase 3): 필드 이름 일치 (`director`, `watchedDate`, `oneLineReview` 등).
- `MovieWithTags` (Phase 5) ↔ `MovieCard` prop (Phase 8.2): 동일 타입.
- `PublicMovieCard` type (Phase 5) ↔ `PublicMovieCard` component prop (Phase 8.3): 일치.
- `requireOwnMovie` 반환 `{ user, movie }` (Phase 4) ↔ `/api/movies/[id]` 사용 (Phase 7.2): 일치.

### 잠재 위험

- **Task 5.2 코드 "TODO 코멘트"**: `updateMovie`, `searchMovies`, `listMovies`, `countMovies` 등 함수 본문은 books 미러로 명시했으나 실제 구현 시 books 함수 전체 읽어야 함. 구현자가 `src/lib/db/queries/books.ts` 또는 분할 전 `queries.ts:108~`를 1:1 참고 필수.
- **Filters props 추가 (Task 8.1)**: 기존 책 페이지가 깨질 위험 — Step 4에서 호출부 동시 업데이트로 방어.
- **`/api/books/slug/[slug]` 존재 여부 (Task 7.3)**: 사전 조사 step 포함.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-movies-feature.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

어떤 방식?
