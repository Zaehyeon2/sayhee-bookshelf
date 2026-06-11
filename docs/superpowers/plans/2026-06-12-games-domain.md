# 게임 도메인 추가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** movies와 엄격 동형인 games 도메인 추가 — CRUD·통계·공개 피드·works 집계·RAWG 외부 검색 일괄.

**Architecture:** movies 도메인(검증된 멀티테넌트 패턴)을 기계적으로 복제. `developer`/`playedDate`/`rawgId`가 `director`/`watchedDate`/`tmdbId` 자리. 외부 API는 RAWG (TMDB 자리). 신규 파일은 클론+rename, 공유 파일은 movies 항목 옆에 games 항목 추가.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, libSQL, zod, Vitest, Playwright. spec: `docs/superpowers/specs/2026-06-12-games-domain-design.md`

**브랜치:** `feature/games-domain`에서 작업 (`git checkout -b feature/games-domain`).

---

## 공통 rename 규칙 (표 R)

클론 태스크에서 "표 R 적용"은 아래 치환을 **위에서 아래 순서로** 전부 적용한다는 뜻 (긴 패턴 먼저 — 케이스 민감):

| 원본 | 치환 |
|---|---|
| `watchedDate` | `playedDate` |
| `watched_date` | `played_date` |
| `director` | `developer` |
| `Director` | `Developer` |
| `tmdbId` | `rawgId` |
| `tmdb_id` | `rawg_id` |
| `TMDB` | `RAWG` |
| `Tmdb` | `Rawg` |
| `tmdb` | `rawg` |
| `MOVIE` | `GAME` |
| `Movie` | `Game` |
| `movie` | `game` |
| `영화` | `게임` |
| `감독` | `개발사` |
| `관람` | `플레이` |

적용 후 **반드시** `pnpm exec tsc --noEmit`으로 잔여 오류 확인 — rename 누락은 전부 타입 에러로 드러난다.

검증 커맨드 모음:
```bash
pnpm exec tsc --noEmit          # 타입
pnpm lint                        # Biome (main에 기존 에러 있음 — 새 파일만 확인)
pnpm exec vitest run <파일경로>  # 단일 테스트 파일
pnpm test                        # 전체 unit+integration
pnpm e2e                         # Playwright (dev 서버 자동)
```

---

### Task 1: DB 스키마 + 마이그레이션

**Files:**
- Modify: `src/lib/db/schema.ts` (파일 끝, movieTags relations 뒤)
- Modify: `src/lib/db/queries/shared.ts`
- Create: `drizzle/XXXX_*.sql` (drizzle-kit generate가 생성)

- [ ] **Step 1: schema.ts에 games + gameTags + relations + 타입 추가**

`src/lib/db/schema.ts`의 `movieTagsRelations` 정의 뒤에 추가:

```typescript
export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    developer: text('developer').notNull(),
    genre: text('genre').notNull(),
    playedDate: text('played_date').notNull(),
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    oneLineReview: text('one_line_review'),
    isPublic: integer('is_public').notNull().default(1),
    publishedAt: integer('published_at'),
    slug: text('slug').notNull(),
    // 외부 API 메타데이터 (모두 nullable)
    rawgId: integer('rawg_id'),
    coverUrl: text('cover_url'),
    externalSource: text('external_source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_games_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_games_user_slug').on(t.authorUserId, t.slug),
    userDateIdx: index('idx_games_user_date').on(t.authorUserId, sql`${t.playedDate} DESC`),
    userGenreIdx: index('idx_games_user_genre').on(t.authorUserId, t.genre),
    userRatingIdx: index('idx_games_user_rating').on(t.authorUserId, sql`${t.rating} DESC`),
    publicPublishedIdx: index('idx_games_public_published').on(
      t.isPublic,
      sql`${t.publishedAt} DESC`,
    ),
    rawgIdx: index('idx_games_rawg').on(t.rawgId),
    publicRawgIdx: index('idx_games_public_rawg').on(t.isPublic, t.rawgId),
    ratingCheck: check('games_rating_range', sql`${t.rating} BETWEEN 1 AND 10`),
  }),
)

export const gameTags = sqliteTable(
  'game_tags',
  {
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.tagId] }),
    tagIdx: index('idx_game_tags_tag').on(t.tagId),
  }),
)

export const gamesRelations = relations(games, ({ one, many }) => ({
  author: one(users, { fields: [games.authorUserId], references: [users.id] }),
  gameTags: many(gameTags),
}))

export const gameTagsRelations = relations(gameTags, ({ one }) => ({
  game: one(games, { fields: [gameTags.gameId], references: [games.id] }),
  tag: one(tags, { fields: [gameTags.tagId], references: [tags.id] }),
}))
```

파일 끝 타입 export 블록에 추가:

```typescript
export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert
export type GameTag = typeof gameTags.$inferSelect
export type NewGameTag = typeof gameTags.$inferInsert
```

기존 relations 갱신 — `usersRelations`에 `games: many(games)`, `tagsRelations`에 `gameTags: many(gameTags)` 추가:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  writings: many(writings),
  movies: many(movies),
  games: many(games),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
  writingTags: many(writingTags),
  movieTags: many(movieTags),
  gameTags: many(gameTags),
}))
```

주의: `games`/`gameTags` 정의가 `usersRelations`/`tagsRelations`(파일 상단)보다 **뒤에** 있어도 동작 — relations 콜백은 lazy. movies가 같은 구조로 이미 동작 중.

- [ ] **Step 2: shared.ts에 GameWithTags + isGameSlugUniqueViolation 추가**

`src/lib/db/queries/shared.ts`:

import 라인 갱신:
```typescript
import type { books, writings, movies, games } from '../schema'
```

`MovieWithTags` 줄 아래에:
```typescript
export type GameWithTags = typeof games.$inferSelect & { tags: string[] }
```

`isMovieSlugUniqueViolation` 아래에 (invariant 5 — 새 unique 인덱스는 여기 등록):
```typescript
export const isGameSlugUniqueViolation = (e: unknown) =>
  isTableSlugViolation(e, 'idx_games_user_slug', 'games')
```

- [ ] **Step 3: 마이그레이션 생성 + 로컬 적용**

테스트 DB(`tests/setup-db.ts`)는 `drizzle/*.sql` 마이그레이션 파일을 순서대로 적용해 스키마를 만든다 — **generate 없이는 통합 테스트가 전부 games 테이블 없음으로 실패**.

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
TURSO_URL=file:local.db pnpm exec drizzle-kit push
```

생성된 `drizzle/XXXX_*.sql`에 `CREATE TABLE games`/`CREATE TABLE game_tags` + 인덱스 9개 포함 확인.

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/shared.ts drizzle/
git commit -m "feat(db): games 테이블·game_tags·마이그레이션 추가 — movies 동형"
```

---

### Task 2: 장르 + zod 검증 스키마 (TDD)

**Files:**
- Modify: `src/lib/genres.ts`
- Modify: `src/lib/validations.ts`
- Test: `tests/unit/validations.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/validations.test.ts` 끝에 추가 (기존 movie describe 블록 패턴 참고 — 같은 파일 안에 있음):

```typescript
describe('CreateGameSchema', () => {
  const valid = {
    title: '엘든 링',
    developer: 'FromSoftware',
    genre: 'RPG',
    playedDate: '2026-05-01',
    rating: 9,
  }

  it('accepts minimal valid input with defaults', () => {
    const r = CreateGameSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.content).toBe('')
      expect(r.data.tags).toEqual([])
      expect(r.data.isPublic).toBe(true)
    }
  })

  it('rejects unknown genre', () => {
    expect(CreateGameSchema.safeParse({ ...valid, genre: '액숀' }).success).toBe(false)
  })

  it('rejects rating out of 1-10', () => {
    expect(CreateGameSchema.safeParse({ ...valid, rating: 11 }).success).toBe(false)
    expect(CreateGameSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false)
  })

  it('accepts nullable rawgId and rawg externalSource', () => {
    const r = CreateGameSchema.safeParse({
      ...valid,
      rawgId: 3498,
      externalSource: 'rawg',
      coverUrl: 'https://media.rawg.io/media/games/x.jpg',
    })
    expect(r.success).toBe(true)
  })

  it('rejects extra keys (strict)', () => {
    expect(CreateGameSchema.safeParse({ ...valid, platform: 'PC' }).success).toBe(false)
  })
})

describe('UpdateGameSchema', () => {
  it('parse({}) returns {}', () => {
    const r = UpdateGameSchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) expect(Object.keys(r.data)).toHaveLength(0)
  })
})
```

import에 `CreateGameSchema, UpdateGameSchema` 추가.

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/unit/validations.test.ts`
Expected: FAIL — `CreateGameSchema` export 없음

- [ ] **Step 3: genres.ts에 GAME_GENRES 추가**

`src/lib/genres.ts` 끝에:

```typescript
export const GAME_GENRES = [
  'RPG',
  '액션',
  '어드벤처',
  '슈팅',
  '시뮬레이션',
  '전략',
  '퍼즐',
  '스포츠',
  '레이싱',
  '인디',
  '기타',
] as const

export type GameGenre = (typeof GAME_GENRES)[number]

export function isGameGenre(value: unknown): value is GameGenre {
  return typeof value === 'string' && (GAME_GENRES as readonly string[]).includes(value)
}
```

- [ ] **Step 4: validations.ts에 게임 스키마 추가**

`src/lib/validations.ts`:

import 갱신: `import { BOOK_GENRES, MOVIE_GENRES, GAME_GENRES } from './genres'`

`UpdateMovieSchema` 블록 뒤에 추가 (movie 스키마와 동형 — `director`→`developer`, `watchedDate`→`playedDate`, `tmdbId`→`rawgId`, `'tmdb'`→`'rawg'`):

```typescript
export const CreateGameSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    developer: z.string().trim().min(1, '개발사를 입력하세요').max(100),
    genre: z.enum(GAME_GENRES),
    playedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
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
    isPublic: z.boolean().optional().default(true),
    rawgId: z.number().int().positive().nullable().optional(),
    coverUrl: coverUrlSchema,
    externalSource: z.enum(['rawg']).nullable().optional(),
  })
  .strict()

export type CreateGameInput = z.infer<typeof CreateGameSchema>

export const UpdateGameSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
    developer: z.string().trim().min(1, '개발사를 입력하세요').max(100).optional(),
    genre: z.enum(GAME_GENRES).optional(),
    playedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
    rating: z.number().int().min(1).max(10).optional(),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : null)),
    isPublic: z.boolean().optional(),
    rawgId: z.number().int().positive().nullable().optional(),
    coverUrl: coverUrlSchema,
    externalSource: z.enum(['rawg']).nullable().optional(),
  })
  .strict()

export type UpdateGameInput = z.infer<typeof UpdateGameSchema>

export const ListGamesQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_Q).optional(),
  genre: z.enum(GAME_GENRES).optional(),
  tag: z.string().max(MAX_TAG_LEN).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  sort: z.enum(['date', 'rating']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})
```

`TmdbIdParamSchema` 줄 아래에:

```typescript
export const RawgIdParamSchema = z.coerce.number().int().positive()
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/unit/validations.test.ts`
Expected: PASS (기존 케이스 포함 전부)

- [ ] **Step 6: Commit**

```bash
git add src/lib/genres.ts src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(validation): GAME_GENRES·게임 zod 스키마 추가"
```

---

### Task 3: 태그 헬퍼

**Files:**
- Modify: `src/lib/db/queries/tags.ts`

- [ ] **Step 1: game 태그 함수 3개 추가**

`src/lib/db/queries/tags.ts`:

import 갱신:
```typescript
import { books, bookTags, tags, writingTags, writings, movieTags, movies, gameTags, games } from '../schema'
```

`replaceMovieTagsTx` 뒤에 (movie 함수들과 동형):

```typescript
export async function attachGameTags(db: Db, gameId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(gameTags)
    .innerJoin(tags, eq(gameTags.tagId, tags.id))
    .where(eq(gameTags.gameId, gameId))
  return rows.map((r) => r.name)
}

export async function attachTagsToGamesBatch(
  db: Db,
  gameIds: number[],
): Promise<Map<number, string[]>> {
  if (gameIds.length === 0) return new Map()
  const rows = await db
    .select({ gameId: gameTags.gameId, name: tags.name })
    .from(gameTags)
    .innerJoin(tags, eq(gameTags.tagId, tags.id))
    .where(inArray(gameTags.gameId, gameIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.gameId) ?? []
    existing.push(r.name)
    map.set(r.gameId, existing)
  }
  return map
}

export async function replaceGameTagsTx(
  tx: Tx,
  gameId: number,
  tagNames: string[],
): Promise<void> {
  await tx.delete(gameTags).where(eq(gameTags.gameId, gameId))
  if (tagNames.length === 0) return
  const tagIds = await getOrCreateTagsBatch(tx, tagNames)
  await tx.insert(gameTags).values(tagIds.map((tagId) => ({ gameId, tagId })))
}
```

- [ ] **Step 2: suggestTags에 games EXISTS 브랜치 추가**

`suggestTags`의 raw SQL에서 movies EXISTS 절(`OR EXISTS (... movieTags mt ...)`) 뒤에 동형 절 추가:

```sql
        OR EXISTS (
          SELECT 1 FROM ${gameTags} gt
          INNER JOIN ${games} g ON g.id = gt.game_id
          WHERE gt.tag_id = t.id AND g.author_user_id = ${authorUserId}
        )
```

(주석의 "본인 풀(책 + 글 + 영화)"도 "책 + 글 + 영화 + 게임"으로 갱신.)

파일 끝에:
```typescript
export async function listTagsForGame(db: Db, gameId: number): Promise<string[]> {
  return attachGameTags(db, gameId)
}
```

- [ ] **Step 3: 타입 체크 + Commit**

Run: `pnpm exec tsc --noEmit` → 0 errors

```bash
git add src/lib/db/queries/tags.ts
git commit -m "feat(tags): 게임 태그 attach/replace 헬퍼·자동완성 풀 확장"
```

---

### Task 4: 게임 쿼리 모듈 (TDD — scoping 테스트 먼저)

**Files:**
- Create: `tests/integration/games-scoping.test.ts` (클론: `tests/integration/movies-scoping.test.ts`)
- Create: `src/lib/db/queries/games.ts` (클론: `src/lib/db/queries/movies.ts`)
- Modify: `src/lib/db/queries.ts`

- [ ] **Step 1: scoping 테스트 클론 (멀티테넌트 회귀 가드)**

```bash
cp tests/integration/movies-scoping.test.ts tests/integration/games-scoping.test.ts
```

`games-scoping.test.ts`에 표 R 적용. factory 호출 `createMovie` → `createGame`은 표 R이 자동 처리 (`tests/factories.ts`의 `createGame`은 Task 13에서 추가 — 이 시점엔 import 에러가 정상).

**선행**: `tests/factories.ts`에 `createGame` factory를 지금 추가 (Task 13 전에 필요):

`tests/factories.ts` import 갱신: `import { users, books, writings, movies, games } from '@/lib/db/schema'`

`createMovie` 함수 뒤에:

```typescript
export async function createGame(
  db: TestDb,
  authorUserId: number,
  overrides: Partial<typeof games.$inferInsert> = {},
) {
  const now = Date.now()
  const [g] = await db
    .insert(games)
    .values({
      authorUserId,
      title: overrides.title ?? '테스트 게임',
      developer: overrides.developer ?? '개발사',
      genre: overrides.genre ?? 'RPG',
      playedDate: overrides.playedDate ?? '2026-01-01',
      rating: overrides.rating ?? 8,
      content: overrides.content ?? '',
      slug: overrides.slug ?? `game-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      ...(overrides.isPublic !== undefined && { isPublic: overrides.isPublic }),
      ...(overrides.publishedAt !== undefined && { publishedAt: overrides.publishedAt }),
      ...(overrides.oneLineReview !== undefined && { oneLineReview: overrides.oneLineReview }),
      ...(overrides.rawgId !== undefined && { rawgId: overrides.rawgId }),
      ...(overrides.coverUrl !== undefined && { coverUrl: overrides.coverUrl }),
      ...(overrides.externalSource !== undefined && { externalSource: overrides.externalSource }),
    })
    .returning()
  return g
}
```

주의: `createdAt`/`updatedAt` override 존중 패턴 유지 — 통계 연도 필터 테스트가 의존.

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/integration/games-scoping.test.ts`
Expected: FAIL — `@/lib/db/queries`에 game 함수 없음

- [ ] **Step 3: 쿼리 모듈 클론**

```bash
cp src/lib/db/queries/movies.ts src/lib/db/queries/games.ts
```

`games.ts`에 표 R 적용. 결과물 체크리스트 (전부 표 R이 만들어야 함 — 누락 시 수동 수정):

- import: `games, gameTags` from schema / `CreateGameInput, UpdateGameInput` from validations / `isGameSlugUniqueViolation`, `GameWithTags` from shared / `attachGameTags, attachTagsToGamesBatch, replaceGameTagsTx` from tags
- export 함수 17개: `createGame`, `updateGame`, `deleteGame`, `getGameBySlug`, `getGameById`, `listGames`, `searchGames`, `countSearchGames`, `listGameGenresWithCounts`, `listRecentPublicGames`, `countPublicGames`, `getPublicGameFallbackByRawgId`, `countGames`, `countGamesByExternalIds`, `getGameAggregatesByRawgIds`, `listGameReviewsByRawgId`, `countGameReviewsByRawgId`, `getGameRatingDistributionByRawgId`
- 타입: `PublicGameCard` (필드 `developer`, `rawgId`), `ListGameFilters`, `GameSiteAggregate`, `GameReviewItem`
- `listRecentPublicGames`/`countPublicGames`/works 집계 4종은 `eq(games.isPublic, 1)` + `isNotNull(games.publishedAt)` 조건 유지 — **MULTITENANT INVARIANT EXCEPTION 주석 블록 그대로 보존**
- `searchGames`의 LIKE 검색 대상: `title`, `developer`, `content` + `ESCAPE '\'` 유지

- [ ] **Step 4: barrel export 추가**

`src/lib/db/queries.ts`:

```typescript
export * from './queries/shared'
export * from './queries/tags'
export * from './queries/books'
export * from './queries/writings'
export * from './queries/movies'
export * from './queries/games'
export * from './queries/stats'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec tsc --noEmit` → 0 errors
Run: `pnpm exec vitest run tests/integration/games-scoping.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries/games.ts src/lib/db/queries.ts tests/integration/games-scoping.test.ts tests/factories.ts
git commit -m "feat(queries): 게임 쿼리 모듈 — 멀티테넌트 scoping 회귀 가드 포함"
```

---

### Task 5: 인증 헬퍼

**Files:**
- Modify: `src/lib/auth-helpers.ts`

- [ ] **Step 1: requireOwnGame / requireOwnGameForPage 추가**

import 갱신:
```typescript
import { books, writings, movies, games, type Book, type Writing, type Movie, type Game } from '@/lib/db/schema'
```

`ownMovie` 정의 뒤에:

```typescript
const ownGame = makeOwnershipHelpers<Game>(
  async (id, userId) =>
    (
      await db
        .select()
        .from(games)
        .where(and(eq(games.id, id), eq(games.authorUserId, userId)))
        .limit(1)
    )[0],
  '게임을 찾을 수 없습니다',
)
```

파일 끝에:

```typescript
export async function requireOwnGame(gameId: number): Promise<{ user: User; game: Game }> {
  const { user, row: game } = await ownGame.forApi(gameId)
  return { user, game }
}

export async function requireOwnGameForPage(
  gameId: number,
): Promise<{ user: User; game: Game }> {
  const { user, row: game } = await ownGame.forPage(gameId)
  return { user, game }
}
```

- [ ] **Step 2: 타입 체크 + Commit**

Run: `pnpm exec tsc --noEmit` → 0 errors

```bash
git add src/lib/auth-helpers.ts
git commit -m "feat(auth): requireOwnGame/ForPage 소유권 헬퍼"
```

---

### Task 6: 캐시 레이어 (피드 + works)

**Files:**
- Modify: `src/lib/public-feed-cache.ts`
- Modify: `src/lib/works-detail-cache.ts`

- [ ] **Step 1: public-feed-cache.ts에 games 추가**

import에 `listRecentPublicGames, countPublicGames` 추가. `getPublicMoviesFeedCount` 뒤에:

```typescript
const PUBLIC_GAMES_TAG = 'public-games-feed'

export async function getPublicGamesFeed(limit: number, offset: number) {
  'use cache: remote'
  cacheTag(PUBLIC_GAMES_TAG)
  cacheLife('minutes')
  return listRecentPublicGames(db, { limit, offset })
}

export async function getPublicGamesFeedCount() {
  'use cache: remote'
  cacheTag(PUBLIC_GAMES_TAG)
  cacheLife('minutes')
  return countPublicGames(db)
}
```

(`PUBLIC_GAMES_TAG` 상수 선언은 파일 상단 기존 TAG 상수들 옆으로 이동.)

`PUBLIC_FEED_TAGS`에 `games: PUBLIC_GAMES_TAG` 추가:

```typescript
export const PUBLIC_FEED_TAGS = {
  books: PUBLIC_BOOKS_TAG,
  movies: PUBLIC_MOVIES_TAG,
  games: PUBLIC_GAMES_TAG,
}
```

- [ ] **Step 2: works-detail-cache.ts에 games 추가**

import에 `listGameReviewsByRawgId, countGameReviewsByRawgId, getGameRatingDistributionByRawgId` 추가. 파일 끝에:

```typescript
export const WORKS_GAME_TAG = 'works-game-detail'

export async function getGameReviewsCached(rawgId: number, limit: number, offset: number) {
  'use cache: remote'
  cacheTag(WORKS_GAME_TAG)
  cacheLife('minutes')
  return listGameReviewsByRawgId(db, rawgId, { limit, offset })
}

export async function getGameReviewsCountCached(rawgId: number) {
  'use cache: remote'
  cacheTag(WORKS_GAME_TAG)
  cacheLife('minutes')
  return countGameReviewsByRawgId(db, rawgId)
}

export async function getGameDistributionCached(rawgId: number) {
  'use cache: remote'
  cacheTag(WORKS_GAME_TAG)
  cacheLife('minutes')
  return getGameRatingDistributionByRawgId(db, rawgId)
}
```

(`WORKS_GAME_TAG` 선언은 상단 기존 TAG 상수 옆으로 이동.)

- [ ] **Step 3: 타입 체크 + Commit**

Run: `pnpm exec tsc --noEmit` → 0 errors

```bash
git add src/lib/public-feed-cache.ts src/lib/works-detail-cache.ts
git commit -m "feat(cache): 게임 공개 피드·works 상세 캐시 태그"
```

---

### Task 7: /api/games CRUD 라우트

**Files:**
- Create: `src/app/api/games/route.ts`
- Create: `src/app/api/games/[id]/route.ts`
- Create: `src/app/api/games/by-external/route.ts`
- Test: `tests/integration/by-external-scoping.test.ts` (확장)

- [ ] **Step 1: 목록+생성 라우트**

`src/app/api/games/route.ts` (movies/route.ts 동형):

```typescript
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  countGames,
  countSearchGames,
  createGame,
  listGames,
  searchGames,
} from '@/lib/db/queries'
import { CreateGameSchema, ListGamesQuerySchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'

const PAGE_SIZE = 24

export const GET = withApiHandler('listGames', async (req: Request) => {
  const user = await requireUser()
  const { q, genre, tag, year, sort, page } = requireQuery(req, ListGamesQuerySchema)
  const currentPage = page ?? 1
  const offset = (currentPage - 1) * PAGE_SIZE

  if (q && q.trim().length > 0) {
    const [results, total] = await Promise.all([
      searchGames(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
      countSearchGames(db, user.id, q.trim()),
    ])
    return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
  }
  const filters = { genre, tag, year, sort: sort ?? ('date' as const) }
  const [list, total] = await Promise.all([
    listGames(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
    countGames(db, user.id, { genre, tag, year }),
  ])
  return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
})

export const POST = withApiHandler('createGame', async (req: Request) => {
  const user = await requireUser()
  const input = await requireJsonBody(req, CreateGameSchema)
  const game = await createGame(db, user.id, input)
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ id: game.id, slug: game.slug }, { status: 201 })
})
```

- [ ] **Step 2: 단건 라우트**

`src/app/api/games/[id]/route.ts` (movies/[id]/route.ts 동형):

```typescript
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteGame, getGameById, updateGame } from '@/lib/db/queries'
import { UpdateGameSchema } from '@/lib/validations'
import { requireOwnGame } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getGame', async (_req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const game = await getGameById(db, user.id, gameId)
  if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(game)
})

export const PATCH = withApiHandler('updateGame', async (req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const input = await requireJsonBody(req, UpdateGameSchema)
  const updated = await updateGame(db, user.id, gameId, input)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteGame', async (_req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const ok = await deleteGame(db, user.id, gameId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ ok: true })
})
```

- [ ] **Step 3: by-external 라우트**

`src/app/api/games/by-external/route.ts` (movies/by-external 동형 — wrapper 검증 예외: 커스텀 쿼리 shape):

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { countGamesByExternalIds } from '@/lib/db/queries/games'
import { requireUser } from '@/lib/auth-helpers'
import { ExternalIdsQuerySchema } from '@/lib/validations'
import { withApiHandler } from '@/lib/api-handler'

/**
 * GET /api/games/by-external?ids=rawgId1,rawgId2,...
 *
 * 검색 드롭다운의 "이미 N번 기록" 배지용. 본인 games 중 주어진 rawgId들 각각의 기록 수를 반환.
 * 멀티테넌트 invariant: countGamesByExternalIds가 authorUserId로 필터.
 */
export const GET = withApiHandler('listGamesByExternal', async (req: Request): Promise<Response> => {
  const user = await requireUser()

  const url = new URL(req.url)
  const parsed = ExternalIdsQuerySchema.safeParse({ ids: url.searchParams.get('ids') ?? '' })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '잘못된 쿼리 파라미터' },
      { status: 400 },
    )
  }

  // Strict canonical-form check: only accepts unambiguous positive integer strings.
  const numericIds = parsed.data.ids
    .map((s) => {
      const trimmed = s.trim()
      const n = Number(trimmed)
      return Number.isInteger(n) && n > 0 && String(n) === trimmed ? n : null
    })
    .filter((n): n is number => n !== null)

  const map = await countGamesByExternalIds(db, user.id, numericIds)
  const counts: Record<string, number> = {}
  for (const [k, v] of map) counts[String(k)] = v
  return NextResponse.json({ counts })
})
```

- [ ] **Step 4: by-external scoping 테스트 확장**

`tests/integration/by-external-scoping.test.ts`를 열어 movies 케이스 describe 블록을 확인하고, 동형 games describe 블록 추가 — `createGame` factory + `countGamesByExternalIds` 사용, "다른 유저의 rawgId 기록은 카운트에 포함되지 않는다" 케이스 필수.

- [ ] **Step 5: 검증 + Commit**

Run: `pnpm exec tsc --noEmit` → 0 errors
Run: `pnpm exec vitest run tests/integration/by-external-scoping.test.ts` → PASS

```bash
git add src/app/api/games tests/integration/by-external-scoping.test.ts
git commit -m "feat(api): /api/games CRUD·by-external 라우트"
```

---

### Task 8: RAWG 외부 검색

**Files:**
- Modify: `src/lib/external/types.ts`
- Modify: `src/lib/external/route-factory.ts`
- Create: `src/lib/external/games.ts`
- Create: `src/lib/external/game-lookup.ts`
- Create: `src/app/api/external/games/search/route.ts`
- Create: `src/app/api/external/games/lookup/route.ts`
- Test: `tests/integration/external-search.test.ts` (확장)

**보안 주의 (route-factory.ts 주석 참고)**: RAWG는 API 키를 **URL 쿼리 파라미터**로 받는다. adapter가 throw하는 에러 메시지에 요청 URL을 절대 포함하지 말 것 — 로그로 키가 유출된다. 아래 코드는 status 코드만 메시지에 넣는다.

- [ ] **Step 1: types.ts 확장**

`ExternalSearchResponse`의 source 유니온과 alias 추가:

```typescript
export interface ExternalSearchResponse<TId extends string | number> {
  items: ExternalSearchItem<TId>[]
  source: 'naver' | 'tmdb' | 'rawg'
}
```

`MovieSearchItem` 줄 아래:
```typescript
export type GameSearchItem = ExternalSearchItem<number>
```

파일 끝에:
```typescript
export interface GameLookupResult {
  rawgId: number
  title: string
  originalTitle: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
  developer: string | undefined // RAWG 상세 응답의 developers[0].name
  externalRating: number | undefined // RAWG rating(0-5)을 ×2 한 0-10 스케일
}
```

`route-factory.ts`의 `type Source = 'naver' | 'tmdb'`를 `type Source = 'naver' | 'tmdb' | 'rawg'`로 변경.

- [ ] **Step 2: 검색 어댑터**

`src/lib/external/games.ts` (movies.ts 패턴 — RAWG 차이점: 키가 쿼리 파라미터, rating 0-5 스케일, 커버가 절대 URL, developer는 검색 응답에 없어 byline 빈 값):

```typescript
import type { GameSearchItem } from './types'
import type { GameGenre } from '@/lib/genres'

const RAWG_BASE = 'https://api.rawg.io/api'

// RAWG genre slug → GAME_GENRES verbatim 매칭만 (매핑 없으면 omit).
// GameGenre union으로 컴파일 타임에 드리프트 차단.
const RAWG_GENRE_MAP: Readonly<Record<string, GameGenre>> = {
  'role-playing-games-rpg': 'RPG',
  action: '액션',
  adventure: '어드벤처',
  shooter: '슈팅',
  simulation: '시뮬레이션',
  strategy: '전략',
  puzzle: '퍼즐',
  sports: '스포츠',
  racing: '레이싱',
  indie: '인디',
}

interface RawgSearchResponse {
  results?: Array<{
    id: number
    name: string
    released?: string | null
    background_image?: string | null
    rating?: number // 0-5
    genres?: Array<{ slug?: string }>
  }>
}

export async function searchGamesExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<GameSearchItem[]> {
  const key = process.env.RAWG_API_KEY
  if (!key) throw new Error('RAWG_API_KEY env var not set')

  const url = new URL(`${RAWG_BASE}/games`)
  url.searchParams.set('key', key)
  url.searchParams.set('search', query)
  url.searchParams.set('page_size', String(opts.limit))

  // 외부 검색 결과는 query 기반 cache — 1h revalidate (신규 등록 반영 + 외부 왕복 절감).
  const res = await fetch(url, {
    signal: opts.signal,
    headers: { accept: 'application/json' },
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['rawg-game-search'] },
  })
  // SECURITY: 에러 메시지에 url 포함 금지 — 쿼리 파라미터에 API 키가 들어있음.
  if (res.status === 429) {
    throw new Error(
      `RAWG rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`RAWG auth ${res.status}`)
  }
  if (res.status >= 500) {
    throw new Error(`RAWG upstream ${res.status}`)
  }
  if (res.status >= 400) {
    return []
  }
  const data = (await res.json()) as RawgSearchResponse
  const results = data.results ?? []
  return results.slice(0, opts.limit).map((r) => {
    const year =
      r.released && /^\d{4}-/.test(r.released) ? Number(r.released.slice(0, 4)) : undefined
    // RAWG 첫 장르 slug만 사용. 미매핑 → omit (사용자가 직접 선택).
    const primarySlug = r.genres?.[0]?.slug
    const genre = primarySlug != null ? RAWG_GENRE_MAP[primarySlug] : undefined
    // RAWG rating은 0-5 스케일 — ExternalSearchItem 계약(0-10)에 맞춰 ×2.
    const externalRating =
      typeof r.rating === 'number' && Number.isFinite(r.rating) && r.rating > 0
        ? Math.round(r.rating * 2 * 10) / 10
        : undefined
    return {
      externalId: r.id,
      title: r.name,
      // RAWG search results omit developers — populated on detail fetch (out of scope).
      // Users will fill the developer field manually.
      byline: '',
      year,
      genre,
      coverUrl: r.background_image ?? undefined,
      externalRating,
    }
  })
}
```

- [ ] **Step 3: lookup 어댑터**

`src/lib/external/game-lookup.ts` (movie-lookup.ts 동형 — 상세 응답엔 developers 있음):

```typescript
import { cacheLife, cacheTag } from 'next/cache'
import type { GameLookupResult } from './types'

const RAWG_BASE = 'https://api.rawg.io/api'

export const RAWG_GAME_LOOKUP_TAG = 'rawg-game-lookup'

interface RawgGameDetail {
  id?: number
  name?: string
  name_original?: string
  released?: string | null
  background_image?: string | null
  description_raw?: string
  rating?: number // 0-5
  developers?: Array<{ name?: string }>
}

async function fetchRawgGame(rawgId: number): Promise<RawgGameDetail | null> {
  'use cache: remote'
  cacheTag(RAWG_GAME_LOOKUP_TAG)
  cacheLife('days')

  const key = process.env.RAWG_API_KEY
  if (!key) throw new Error('RAWG_API_KEY env var not set')

  const url = new URL(`${RAWG_BASE}/games/${rawgId}`)
  url.searchParams.set('key', key)

  console.log('[diag] rawg-game lookup fetch', rawgId)
  // SECURITY: 에러 메시지에 url 포함 금지 — 쿼리 파라미터에 API 키가 들어있음.
  const res = await fetch(url, { headers: { accept: 'application/json' } })

  if (res.status === 404) return null
  if (res.status === 429)
    throw new Error(`RAWG rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`)
  if (res.status === 401 || res.status === 403) throw new Error(`RAWG auth ${res.status}`)
  if (res.status >= 500) throw new Error(`RAWG upstream ${res.status}`)
  if (res.status >= 400) return null

  return (await res.json()) as RawgGameDetail
}

export async function lookupGameByRawgId(
  rawgId: number,
  _opts: { signal?: AbortSignal } = {},
): Promise<GameLookupResult | null> {
  if (!Number.isInteger(rawgId) || rawgId <= 0) return null
  const data = await fetchRawgGame(rawgId)
  if (!data || !data.id || !data.name) return null

  const year =
    data.released && /^\d{4}-/.test(data.released) ? Number(data.released.slice(0, 4)) : undefined

  return {
    rawgId: data.id,
    title: data.name,
    originalTitle:
      data.name_original && data.name_original !== data.name ? data.name_original : undefined,
    year,
    coverUrl: data.background_image ?? undefined,
    description: data.description_raw?.trim() || undefined,
    developer: data.developers?.[0]?.name || undefined,
    externalRating:
      typeof data.rating === 'number' && data.rating > 0
        ? Math.round(data.rating * 2 * 10) / 10
        : undefined,
  }
}
```

- [ ] **Step 4: API 라우트 2개**

`src/app/api/external/games/search/route.ts`:

```typescript
import { createExternalSearchHandler } from '@/lib/external/route-factory'
import { searchGamesExternal } from '@/lib/external/games'

export const GET = createExternalSearchHandler<number>({
  source: 'rawg',
  adapter: searchGamesExternal,
  logTag: 'external/games/search',
})
```

`src/app/api/external/games/lookup/route.ts` (movies/lookup 동형 — wrapper 미적용 예외: logAdapterError+503 자체 catch):

```typescript
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { RawgIdParamSchema } from '@/lib/validations'
import { lookupGameByRawgId } from '@/lib/external/game-lookup'
import { logAdapterError } from '@/lib/external/log-error'

const TIMEOUT_MS = 5000

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = RawgIdParamSchema.safeParse(url.searchParams.get('rawgId') ?? '')
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 RAWG ID' }, { status: 400 })
    }
    const ctl = new AbortController()
    const timeout = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const result = await lookupGameByRawgId(parsed.data, { signal: ctl.signal })
      if (!result) return NextResponse.json({ error: '작품을 찾지 못했어요' }, { status: 404 })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    logAdapterError('external/games/lookup', e)
    return NextResponse.json({ error: '검색 서비스가 일시적으로 응답하지 않아요' }, { status: 503 })
  }
}
```

- [ ] **Step 5: env + 테스트**

`.env.local`에 `RAWG_API_KEY=<발급받은 키>` 추가 (사용자가 이미 발급). `.env.example`이 있으면 같이 갱신.

`tests/integration/external-search.test.ts`를 열어 movies 검색 케이스 패턴 확인 후 games 동형 케이스 추가 (fetch mock 기반이면 RAWG 응답 shape `{ results: [{ id, name, released, background_image, rating, genres }] }`으로 mock).

Run: `pnpm exec vitest run tests/integration/external-search.test.ts` → PASS
Run: `pnpm exec tsc --noEmit` → 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/external src/app/api/external/games tests/integration/external-search.test.ts
git commit -m "feat(external): RAWG 게임 검색·lookup 어댑터 + 프록시 라우트"
```

---

### Task 9: 통계

**Files:**
- Modify: `src/lib/stats-types.ts`
- Modify: `src/lib/db/queries/stats.ts`
- Create: `src/app/api/games/stats/route.ts`
- Test: `tests/unit/stats-routes.test.ts`, `tests/integration/stats-dashboard.test.ts` (확장)

- [ ] **Step 1: 공유 타입**

`src/lib/stats-types.ts`의 `MovieDashboard` 뒤에:

```typescript
export interface GameDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[]
  genreDist: CountItem[]
  yearTimeline: CountItem[]
  topTags: CountItem[]
  topDevelopers: CountItem[]
}
```

- [ ] **Step 2: stats.ts에 GAME_SOURCE + getGameDashboard + getUserGameStats**

`src/lib/db/queries/stats.ts`:

- import에 `games, gameTags` (schema), `GameDashboard` (stats-types) 추가.
- `MOVIE_SOURCE` 뒤에:

```typescript
const GAME_SOURCE: ContentDashboardSource = {
  table: games,
  id: games.id,
  authorUserId: games.authorUserId,
  date: games.playedDate,
  rating: games.rating,
  genre: games.genre,
  person: games.developer,
  tagJoin: gameTags,
  tagEntityFk: gameTags.gameId,
  tagFk: gameTags.tagId,
}
```

- `getMovieDashboard` 뒤에:

```typescript
export async function getGameDashboard(
  db: Db,
  userId: number,
  year: number,
): Promise<GameDashboard> {
  const d = await contentDashboard(db, userId, year, GAME_SOURCE)
  return {
    summary: d.summary,
    ratingDist: d.ratingDist,
    genreDist: d.genreDist,
    yearTimeline: d.yearTimeline,
    topTags: d.topTags,
    topDevelopers: d.personTop,
  }
}
```

- `getUserMovieStats`(stats.ts 73-103행)와 그 인터페이스 `UserMovieStats`를 읽고, 동형 `UserGameStats`/`getUserGameStats`를 바로 아래에 추가 — 표 R 적용한 클론 (movies→games, watchedDate→playedDate).

- [ ] **Step 3: stats 라우트**

`src/app/api/games/stats/route.ts` (movies/stats 동형 — wrapper 미적용 기존 스타일 유지):

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getGameDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { currentKstYear } from '@/lib/kst'

export async function GET() {
  try {
    const user = await requireUser()
    // 연도는 KST 기준 — 홈(getUserGameStats 호출부)과 동일 소스, 서버 TZ 무관
    const dashboard = await getGameDashboard(db, user.id, currentKstYear())
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 4: 테스트 확장**

- `tests/unit/stats-routes.test.ts`: 파일 상단 `ROUTES` 상수(21행)에 games stats 라우트 항목 추가 — 기존 books/movies 항목과 동형으로.
- `tests/integration/stats-dashboard.test.ts`: movies 대시보드 케이스를 확인하고 games 동형 describe 추가 (`createGame` factory + `getGameDashboard`, 연도 필터·ratingDist·topDevelopers 검증).

Run: `pnpm exec vitest run tests/unit/stats-routes.test.ts tests/integration/stats-dashboard.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats-types.ts src/lib/db/queries/stats.ts src/app/api/games/stats tests/
git commit -m "feat(stats): 게임 대시보드 집계 + /api/games/stats"
```

---

### Task 10: 컴포넌트 클론

**Files:**
- Create: `src/components/GameCard.tsx` (클론: `MovieCard.tsx`)
- Create: `src/components/GameForm.tsx` (클론: `MovieForm.tsx`)
- Create: `src/components/ExternalGameSearchBar.tsx` (클론: `ExternalMovieSearchBar.tsx`)
- Create: `src/components/PublicGameCard.tsx` (클론: `PublicMovieCard.tsx`)
- Test: `tests/unit/PublicGameCard.test.tsx` (클론: `PublicMovieCard.test.tsx`)

- [ ] **Step 1: 4개 컴포넌트 클론**

```bash
cp src/components/MovieCard.tsx src/components/GameCard.tsx
cp src/components/MovieForm.tsx src/components/GameForm.tsx
cp src/components/ExternalMovieSearchBar.tsx src/components/ExternalGameSearchBar.tsx
cp src/components/PublicMovieCard.tsx src/components/PublicGameCard.tsx
```

각 파일에 표 R 적용. 클론 후 점검 포인트:

- `GameForm`: API 엔드포인트가 `/api/games`·`/api/games/[id]`로, 외부 검색바 import가 `ExternalGameSearchBar`로, 장르 옵션이 `GAME_GENRES`로 바뀌었는지. `useCrudForm`의 `deleteAction`·`FormActionBar`·form-helpers 조합 구조는 그대로.
- `ExternalGameSearchBar`: fetch 대상 `/api/external/games/search`, by-external 배지 fetch `/api/games/by-external`, 결과 항목의 byline(개발사)이 빈 문자열일 수 있음 — movies도 동일하므로 기존 처리 그대로 동작.
- `PublicGameCard`: `PublicGameCard` 쿼리 타입(queries/games.ts의 `PublicGameCard`) import — 이름 충돌 시 movies 클론과 같은 방식(타입 alias) 유지.
- 날짜 라벨 등 UI 문구에 어색한 치환("플레이한 날짜" 등)이 없는지 육안 확인.

- [ ] **Step 2: 단위 테스트 클론**

```bash
cp tests/unit/PublicMovieCard.test.tsx tests/unit/PublicGameCard.test.tsx
```

표 R 적용.

Run: `pnpm exec vitest run tests/unit/PublicGameCard.test.tsx` → PASS
Run: `pnpm exec tsc --noEmit` → 0 errors
Run: `pnpm lint` → 새 파일 에러 0 (main 기존 에러 18건은 무시)

- [ ] **Step 3: Commit**

```bash
git add src/components/Game* src/components/ExternalGameSearchBar.tsx src/components/PublicGameCard.tsx tests/unit/PublicGameCard.test.tsx
git commit -m "feat(components): GameCard·GameForm·외부검색바·공개카드"
```

---

### Task 11: 페이지 + 네비게이션 + 통계 UI

**Files:**
- Create: `src/app/games/` 전체 (클론: `src/app/movies/` — page/loading, [slug]/, new/, edit/[id]/, stats/)
- Modify: `src/app/layout.tsx`, `src/components/MobileMenu.tsx` (네비)
- Modify: `src/components/stats/StatsPanel.tsx`, `src/components/stats/StatsDashboard.tsx`

- [ ] **Step 1: 페이지 트리 클론**

```bash
cp -r src/app/movies src/app/games
```

`src/app/games/` 아래 전 파일에 표 R 적용. 점검 포인트:

- `new/page.tsx`·`edit/[id]/page.tsx`: `FreshOnVisible` 래핑 + `key` prop 유지 (Next 16 Activity gotcha — 재진입 시 폼 상태 잔존 방지).
- `[slug]/page.tsx`: `requireOwnGameForPage`가 아닌 slug 조회면 `getGameBySlug(db, user.id, slug)` 사용 확인 — authorUserId 스코핑 필수.
- `stats/page.tsx`: `GameDashboard` 타입 + `/api/games/stats` 엔드포인트.
- 목록 `page.tsx`: 제목 행(제목+개수+StatsPageLink) 패턴 유지, `GAME_GENRES` 필터.

- [ ] **Step 2: 네비게이션**

`src/app/layout.tsx`와 `src/components/MobileMenu.tsx`에서 `/movies` 링크 항목을 찾아 바로 뒤에 동형 `/games` 항목("게임" 라벨) 추가.

- [ ] **Step 3: 통계 UI 연결**

- `src/components/stats/StatsPanel.tsx`: 7행 `ENDPOINT` 상수에 games 항목 추가 (books/movies 항목과 동형 — `/api/games/stats`).
- `src/components/stats/StatsDashboard.tsx`: `StatsData` 유니온/분기에 `GameDashboard` 추가 — movies 분기(`topDirectors` 위젯) 옆에 games 분기(`topDevelopers`, 라벨 "개발사 TOP" 등) 동형 추가.

- [ ] **Step 4: 검증**

Run: `pnpm exec tsc --noEmit` → 0 errors
Run: `pnpm build` → 성공 (라우트 트리에 /games 5종 출력 확인)
Run: `pnpm exec vitest run tests/unit/components.test.tsx` → PASS (네비 스냅샷류 있으면 갱신)

- [ ] **Step 5: Commit**

```bash
git add src/app/games src/app/layout.tsx src/components/MobileMenu.tsx src/components/stats
git commit -m "feat(pages): /games 목록·상세·작성·수정·통계 + 네비"
```

---

### Task 12: 공개 영역 (피드 + works)

**Files:**
- Modify: `src/lib/validations.ts` (FeedQuerySchema·WorksSearchQuerySchema enum)
- Modify: `src/app/feed/page.tsx`
- Modify: `src/app/works/page.tsx`, `src/app/api/works/search/route.ts`, `src/components/works/WorksSearchBar.tsx`, `src/components/works/WorksSearchCard.tsx`
- Create: `src/app/works/game/[rawgId]/page.tsx` (클론: `works/movie/[tmdbId]/page.tsx`)
- Create: `src/app/api/works/game/[rawgId]/route.ts` (클론: `api/works/movie/[tmdbId]/route.ts`)
- Test: `tests/integration/public-feed.test.ts`, `tests/integration/works-aggregation.test.ts` (확장)

- [ ] **Step 1: enum 확장**

`src/lib/validations.ts`:

```typescript
export const FeedQuerySchema = z.object({
  type: z.enum(['book', 'movie', 'game']).default('book'),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const WorksSearchQuerySchema = z.object({
  type: z.enum(['book', 'movie', 'game']).default('book'),
  q: z.string().trim().min(1).max(MAX_SEARCH_Q),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})
```

이 변경 직후 `pnpm exec tsc --noEmit` 실행 — type 유니온을 소비하는 모든 파일(feed/works 페이지·컴포넌트·라우트)이 에러로 드러난다. **이 에러 목록이 Step 2-3의 작업 목록.**

- [ ] **Step 2: 피드 페이지**

`src/app/feed/page.tsx`에서 movie 탭 분기(목록: `getPublicMoviesFeed`/`getPublicMoviesFeedCount`, 카드: `PublicMovieCard`)를 확인하고 game 동형 분기 추가 — `getPublicGamesFeed`/`getPublicGamesFeedCount` + `PublicGameCard`, 탭 라벨 "게임".

- [ ] **Step 3: works 검색 + 집계 페이지**

- `src/app/api/works/search/route.ts`: movie 분기(searchMoviesExternal + getMovieAggregatesByTmdbIds 패턴) 확인 후 game 동형 분기 — `searchGamesExternal` + `getGameAggregatesByRawgIds`.
- `src/app/works/page.tsx`·`WorksSearchBar.tsx`·`WorksSearchCard.tsx`: type 스위치에 game 항목(라벨 "게임", 링크 `/works/game/[rawgId]`) 추가.
- 클론:

```bash
cp -r "src/app/works/movie/[tmdbId]" "src/app/works/game/[rawgId]"
cp -r "src/app/api/works/movie/[tmdbId]" "src/app/api/works/game/[rawgId]"
```

표 R 적용. 점검: `lookupGameByRawgId`(외부) 실패 시 `getPublicGameFallbackByRawgId` fallback, 리뷰 목록·분포는 `getGameReviewsCached`/`getGameDistributionCached`(works-detail-cache), 별점 표시는 ÷2 스케일 (`RatingScore`).

- [ ] **Step 4: 테스트 확장**

- `tests/integration/public-feed.test.ts`: movies 케이스 동형으로 games 추가 — 핵심: **`isPublic=0` 또는 `publishedAt=null`인 게임은 피드에 안 나옴** 케이스.
- `tests/integration/works-aggregation.test.ts`: games 동형 — 핵심: **비공개 게임은 집계 제외** + **한줄평 없어도 published면 평점 집계 포함**.

Run: `pnpm exec vitest run tests/integration/public-feed.test.ts tests/integration/works-aggregation.test.ts` → PASS
Run: `pnpm exec tsc --noEmit` → 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts src/app/feed src/app/works src/app/api/works src/components/works tests/integration
git commit -m "feat(public): 피드 게임 탭 + works/game 집계·검색"
```

---

### Task 13: 홈 통계 + e2e

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `scripts/seed-e2e.ts`
- Create: `tests/e2e/games-golden-path.spec.ts` (클론: `movies-golden-path.spec.ts`)
- Modify: `tests/e2e/feed-tab.spec.ts`, `tests/e2e/nav-labels.spec.ts` (필요 시)

- [ ] **Step 1: 홈 페이지**

`src/app/page.tsx`에서 `getUserMovieStats` 호출·표시 블록을 확인하고 `getUserGameStats` 동형 블록 추가 (연도는 기존 `currentKstYear()` 변수 재사용).

- [ ] **Step 2: e2e 시드**

`scripts/seed-e2e.ts`의 movies 시드 블록(56-82행 부근)을 확인하고 games 동형 블록 추가 — alice에게 게임 5개, slug `${displayShort}-game-${i + 1}-seed`, idempotent (기존 slug 존재 시 skip) 패턴 유지.

- [ ] **Step 3: golden-path 클론**

```bash
cp tests/e2e/movies-golden-path.spec.ts tests/e2e/games-golden-path.spec.ts
```

표 R 적용. 점검: 셀렉터 전부 `:visible` 한정 유지 (Next 16 hidden 세그먼트 오탐 방지), 로그인은 `tests/e2e/helpers.ts`의 `login()` 사용.

`tests/e2e/feed-tab.spec.ts`·`nav-labels.spec.ts`를 열어 movies 탭/라벨 검증이 있으면 games 추가.

- [ ] **Step 4: 검증**

Run: `pnpm exec tsc --noEmit` → 0 errors
Run: `pnpm e2e` → 전부 PASS (games-golden-path 포함)

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx scripts/seed-e2e.ts tests/e2e
git commit -m "feat(home,e2e): 홈 게임 통계 + 게임 golden-path e2e"
```

---

### Task 14: 문서 + 최종 검증

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: CLAUDE.md 갱신**

- "아키텍처 한눈에" 트리: `books/, movies/, writings/` 항목들에 games 반영 (`api/books/, movies/, games/, writings/`, 페이지 트리 동일), `external/` 설명에 RAWG 추가, `works/`에 `game/[rawgId]` 추가.
- "DB 스키마 요약": `games` — movies와 동형 (developer/playedDate/rawgId), `game_tags` 추가, 태그 공유 문구에 games 포함.
- invariant 1 표: `requireOwnGame`/`requireOwnGameForPage` 행 추가, 공개 피드 예외 문구에 Games 포함.
- "wrapper 미적용 예외" 목록에 `external/games/lookup` 추가.
- Gotchas: `RAWG_API_KEY` 항목 (없으면 게임 외부 검색만 비동작; **키가 URL 쿼리 파라미터라 에러 메시지에 URL 인터폴레이션 금지**).

- [ ] **Step 2: README.md 갱신**

기능 목록에 게임, 아키텍처에 games 경로, 테스트 수치 갱신 (`pnpm test` 결과 수 + e2e spec 수 실측으로).

- [ ] **Step 3: 전체 게이트**

```bash
pnpm exec tsc --noEmit   # 0 errors
pnpm lint                # 새/변경 파일 에러 0
pnpm test                # 전부 PASS
pnpm build               # 성공
pnpm e2e                 # 전부 PASS
```

- [ ] **Step 4: Commit + 마무리**

```bash
git add CLAUDE.md README.md
git commit -m "docs: 게임 도메인 반영 — 아키텍처·스키마·invariant 표"
```

브랜치 마무리 전 `/code-review` 실행 (사용자 워크플로 규칙). 머지는 로컬까지만 — push는 사용자가 직접.

---

## 배포 메모 (구현 범위 밖, 머지 후 사용자 안내)

- **prod Turso 스키마 반영**: `drizzle-kit push`/`migrate` 신뢰 불가 (CLAUDE.md gotcha). raw `@libsql/client`로 `drizzle/XXXX_*.sql`의 CREATE TABLE/INDEX 문 직접 실행 + `PRAGMA table_info(games)` 검증.
- Vercel 환경변수에 `RAWG_API_KEY` 추가.
