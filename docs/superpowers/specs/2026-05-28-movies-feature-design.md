# 영화 기록 (Movies) 기능 — Design Spec

- **Date:** 2026-05-28
- **Status:** Draft (awaiting user review)
- **Scope:** `books` 도메인과 평행한 `movies` 도메인 신설. 작성·열람·공개 피드까지.
- **Owner:** insam2802@gmail.com

## 1. 목표 & 비목표

### 목표

- 사용자가 본 영화의 감상 기록을 책과 동일한 UX로 작성·관리.
- 책 도메인의 멀티테넌트 격리·공개 피드·반쪽 별점 스케일·태그 공유 등 모든 invariant를 동일하게 적용.
- `/movies` 라우트 집합(CRUD + 상세) + 홈 대시보드 통계 + `/feed` 영화 탭.
- 도메인 분리 우선: 향후 외부 API 통합(TMDB/IMDB) 시 책(Naver/Kakao Book API)과 독립적으로 진화 가능.

### 비목표

- 외부 영화 API 검색·자동완성 (TMDB/IMDB) — 후속 PR.
- 외부 책 API 검색 — 후속 PR.
- `/feed`의 책·영화 통합 타임라인 — 본 PR은 **탭 전환만** 지원.
- 영화 전용 필드 (포스터 URL, 러닝타임, 주연 배우, 개봉 연도) — 도메인 골격 확정 후 API 통합 PR에서 추가.
- 사용자별 공개 영화관 페이지 (`/users/[id]/movies`) — 후속 범위.
- 영화 좋아요·댓글 — 후속 범위.

### 마이그레이션 위험

- **신규 테이블만 추가**, 기존 데이터 백필 없음. 이전 rating 마이그레이션의 NULL constraint·composite index 회귀 (obs 1324-1330) 경험 적용: SQL generate 후 composite index 문법 수동 검증 후 적용.

## 2. Schema 변경

`src/lib/db/schema.ts`에 2개 테이블 + relations 추가.

```ts
export const movies = sqliteTable(
  'movies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    director: text('director').notNull(),               // books.author 대응
    genre: text('genre').notNull(),
    watchedDate: text('watched_date').notNull(),        // books.readDate 대응
    rating: integer('rating').notNull(),                // 1-10 (half-star scale)
    content: text('content').notNull().default(''),
    oneLineReview: text('one_line_review'),             // nullable, ≤150자
    isPublic: integer('is_public').notNull().default(1),
    publishedAt: integer('published_at'),               // nullable epoch ms
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
```

**Relations**:
- `usersRelations`에 `movies: many(movies)` 추가.
- `tagsRelations`에 `movieTags: many(movieTags)` 추가.
- 신규 `moviesRelations`, `movieTagsRelations`.

**타입 export**: `Movie`, `NewMovie`, `MovieTag`, `NewMovieTag`.

### 마이그레이션

1. `pnpm exec dotenv -e .env.local -- drizzle-kit generate` → 마이그레이션 파일 생성.
2. **수동 검증**: generated SQL의 composite index `(col1, col2 DESC)` 문법 확인.
3. 로컬: `drizzle-kit push` 또는 마이그레이션 runner 적용.
4. **데이터 백필 없음** (신규 테이블).
5. PR merge → 프로덕션 Turso DB에 동일 SQL 수동 적용.

`books`·`writings`·`users`·`tags`는 손대지 않음.

## 3. Auth Helpers + Queries 레이어

### 3.1 Auth Helpers (`src/lib/auth-helpers.ts`)

추가:
- `requireOwnMovie(id)` → API 라우트용, `HttpError` throw.
- `requireOwnMovieForPage(id)` → 서버 컴포넌트용, `notFound()`.

`mustChangePassword=1` 차단·admin 우회는 책 헬퍼와 동일 시그니처.

### 3.2 Queries 파일 분리

기존 `src/lib/db/queries.ts`(26.3KB)를 도메인별로 분할:

```
src/lib/db/
├ queries.ts              → re-export hub (기존 import 경로 보존)
├ queries/
│  ├ shared.ts            → escapeLikePattern, isSlugUniqueViolation, slug retry helper
│  ├ books.ts             → 책 CRUD + listPublicBooks
│  ├ movies.ts            → 영화 CRUD + listPublicMovies (신규)
│  ├ writings.ts          → 글 CRUD
│  ├ tags.ts              → attachTagsBatch* 류 + 자동완성
│  ├ users.ts             → admin 사용자 관리
│  └ stats.ts             → getUserStats (책+글+태그), getUserMovieStats (영화 단독, 신규)
```

`queries.ts`는 `export * from './queries/*'` barrel. 기존 `@/lib/db/queries` import 깨지지 않음.

### 3.3 신규 Movies 함수 (`queries/movies.ts`)

| 함수 | 시그니처 요약 |
|---|---|
| `createMovie(userId, input)` | 트랜잭션 + slug retry + tag 동기화 |
| `updateMovie(userId, id, patch)` | 트랜잭션 + slug retry + tag 교체 |
| `deleteMovie(userId, id)` | cascade (movie_tags 자동 삭제) |
| `getMovieBySlug(userId, slug)` | 본인 영화 조회 |
| `getMovieById(userId, id)` | 본인 영화 조회 |
| `listMovies(userId, filters)` | 검색·필터·페이지네이션, LIKE escape |
| `countMovies(userId, filters)` | totalPages 계산용, **listMovies와 동일 인자** |
| `attachTagsToMoviesBatch(movieIds)` | N+1 회피 |
| `listPublicMovies(cursor, limit)` | `/feed?type=movie`용 — `(isPublic, publishedAt DESC)` 인덱스 사용 |

`stats.ts`의 `getUserMovieStats(userId)`:
- `moviesThisYear`, `avgMovieRating`, `movieGenreDistribution` 반환.
- 홈 페이지에서 `Promise.all([getUserStats, getUserMovieStats])` 병렬 호출.

### 3.4 `isSlugUniqueViolation` 패치

`shared.ts`에서 단일 정의. `idx_movies_user_slug` 인덱스 이름 + `movies.slug` 컬럼 시그니처 패턴 추가. CLAUDE.md invariant §5 명시 의무.

## 4. API Routes

### 4.1 신규 (`src/app/api/movies/`)

| 메서드 + 경로 | 작업 | Auth |
|---|---|---|
| `GET /api/movies` | `listMovies` | `requireUser` |
| `POST /api/movies` | `createMovie` | `requireUser` |
| `GET /api/movies/[id]` | `getMovieById` | `requireOwnMovie` |
| `PATCH /api/movies/[id]` | `updateMovie` | `requireOwnMovie` |
| `DELETE /api/movies/[id]` | `deleteMovie` | `requireOwnMovie` |
| `GET /api/movies/slug/[slug]` | `getMovieBySlug` | `requireUser` |

미들웨어 통과 후에도 핸들러에서 `requireUser`/`requireOwnMovie` 다시 호출 (CLAUDE.md §2).

### 4.2 Public 피드 (`src/app/api/feed/route.ts`) 변경

- 쿼리 파라미터 `type=book|movie` 신설 (기본 `book`, 기존 동작 보존).
- `type=book` → 기존 `listPublicBooks` 그대로.
- `type=movie` → 신규 `listPublicMovies`.
- **UNION ALL·통합 머지 없음.** 탭 전환만.

### 4.3 Validation (`src/lib/validations.ts`)

```ts
CreateMovieSchema   // title, director, genre, watchedDate, rating(1-10), content, oneLineReview?, isPublic, tags[]
UpdateMovieSchema   // 모든 필드 optional, partial
MovieFilterSchema   // genre?, rating?, search?, sort?, page, limit
FeedQuerySchema     // type: 'book'|'movie' (신규)
```

zod 체인은 라우트에서 새로 만들지 말 것.

## 5. UI 컴포넌트 + 페이지

### 5.1 컴포넌트 전략

| 컴포넌트 | 결정 | 사유 |
|---|---|---|
| `MovieCard.tsx` | **신규 분리** | 향후 포스터 이미지·러닝타임 등 도메인 분기 예상 |
| `MovieForm.tsx` | **신규 분리** | API URL·redirect·삭제 문구·공개 토글 설명 등 분기점 10+. 향후 TMDB 검색 모달 진입점 |
| `PublicMovieCard.tsx` | **신규 분리** | 카드 분리와 일관 |
| `Filters.tsx` | **공유 (확장)** | `basePath: '/books' \| '/movies'` + `genres: string[]` prop 추가 |
| `BookCard`/`BookForm`/`PublicReviewCard` | **그대로** | 영화 분기 없음 |

**재사용 (수정 0)**: `RatingStars`, `MarkdownEditor`, `TagInput`, `GenreBadge`, `MarkdownViewer`, `Pagination`, `SearchBox`, `EmptyState`, `ConfirmDialog`, `LocalDate`, `Toggle`, `Spinner`.

### 5.2 장르 상수 분리 (`src/lib/genres.ts`)

```ts
export const BOOK_GENRES = [...]   // 기존 GENRES → 리네임
export const MOVIE_GENRES = ['액션', '드라마', '코미디', 'SF', '로맨스', '스릴러', '다큐멘터리', '애니메이션', '공포', '기타']
```

기존 `GENRES` import 사용처는 `BOOK_GENRES`로 일괄 치환.

### 5.3 신규 페이지 (`src/app/movies/`)

```
movies/
├ page.tsx              → 목록 (listMovies + Filters + Pagination) [server]
├ [slug]/page.tsx       → 상세 (getMovieBySlug + requireOwnMovieForPage) [server]
├ new/page.tsx          → 신규 (MovieForm) [server + client form]
└ edit/[id]/page.tsx    → 수정 (requireOwnMovieForPage + MovieForm prefill) [server + client]
```

각 페이지는 `/books/` 카운터파트와 동일 구조.

### 5.4 기존 페이지 수정

1. **`src/app/page.tsx` (홈)** — 영화 통계 섹션 추가:
   ```ts
   const [bookStats, movieStats] = await Promise.all([
     getUserStats(userId),
     getUserMovieStats(userId),
   ])
   ```
   "올해 본 영화 N편 · 평균 ★X · 장르 분포" 행 렌더.

2. **`src/app/feed/page.tsx`** — 탭 UI 추가:
   - URL `?type=book|movie` (기본 `book`).
   - 탭 클릭 시 `<Link>` 또는 클라이언트 토글 → server component 재렌더.
   - `type=book` → `<PublicReviewCard>`, `type=movie` → `<PublicMovieCard>`.

3. **`src/app/layout.tsx`** — 네비게이션에 "영화" 링크 (`/movies`) 추가.

## 6. 마이그레이션 + 시드 + 테스트

### 6.1 Drizzle

신규 `drizzle/00XX_movies_feature.sql` 1개. movies 테이블 + movie_tags + 7개 인덱스. 데이터 백필 0.

### 6.2 시드

- `tests/factories.ts`에 `createMovie(db, overrides)` 추가 — `createdAt`/`updatedAt` override 존중 (통계 연도 필터링 회귀 가드).
- `pnpm seed:admin`은 영화 미포함 (데모 데이터는 별도 PR).
- E2E 시드(`tests/e2e/`): `e2e-alice`·`e2e-bob` 양쪽에 영화 2-3건 추가 → 멀티유저 격리 e2e 가능.

### 6.3 테스트 매트릭스

| 레이어 | 파일 | 커버리지 |
|---|---|---|
| Unit | `tests/unit/validations.test.ts` 확장 | `CreateMovieSchema`/`UpdateMovieSchema` 경계값 (rating 0·1·10·11, slug 빈 문자열) |
| Unit | `tests/unit/components.test.tsx` 확장 | `MovieCard` 렌더, `MovieForm` 기본값(rating=6), `PublicMovieCard` oneLineReview 분기, `Filters` basePath+genres prop |
| Integration | `tests/integration/movies-scoping.test.ts` (신규) | **멀티테넌트 격리** — userA가 userB 영화 read/update/delete 차단 |
| Integration | `tests/integration/stats-and-pagination.test.ts` 확장 | `getUserMovieStats` 연도 필터링, `listMovies` 페이지네이션 + 검색/필터 일치 |
| Integration | slug 회귀 테스트 | `idx_movies_user_slug` 위배 시 `-2` suffix retry, `isSlugUniqueViolation` 매칭 |
| E2E | `tests/e2e/movies-golden-path.spec.ts` (신규) | 로그인 → 영화 생성 → 목록 → 수정 → 공개 토글 → /feed 영화 탭 노출 → 삭제 |
| E2E | `tests/e2e/feed-tab.spec.ts` (신규) | /feed 탭 전환 (book/movie URL 쿼리 반영 + 카드 컴포넌트 분기) |

### 6.4 회귀 가드 체크리스트

- `isSlugUniqueViolation`이 movies 인덱스·컬럼 패턴 인식.
- `requireOwnMovie`가 비-소유자 차단 (HttpError 404).
- `getUserMovieStats`가 factory의 `createdAt`/`updatedAt` override 존중.
- `MovieForm` rating 기본값 6 (half-star scale 의미 보존).
- `Filters` 공유 후 책 페이지 회귀 없음 (기존 책 e2e 그대로 통과).

## 7. 작업 분할 (PR 단위 제안)

1. **PR A — Queries 파일 분리** (순수 이동, 신규 기능 0). git rename 추적 가능하도록 분리 커밋.
2. **PR B — Movies 도메인 신설**:
   - 스키마 + 마이그레이션
   - `auth-helpers.ts` 확장
   - `queries/movies.ts`, `queries/stats.ts`의 `getUserMovieStats`
   - validations 스키마
   - API 라우트
   - `MovieCard`/`MovieForm`/`PublicMovieCard`
   - `Filters` props 확장, 장르 상수 분리
   - `/movies/*` 페이지
   - 홈 통계 + `/feed` 탭 + 네비
   - 단위·integration·e2e 테스트
   - E2E 시드 영화 추가

PR A는 작고 review 부담 적음. PR B는 한 번에 가는 게 동작 일관성 측면에서 안전.

## 8. 번들 (movies와 무관한 동시 작업)

### Vercel Speed Insights 통합

영화 PR과 같은 묶음으로 처리 (도메인 충돌 0, 변경 면적 작음, 별도 PR 분리 비용 > 이득).

**변경**:
- 의존성 추가: `pnpm add @vercel/speed-insights`
- `src/app/layout.tsx`:
  ```tsx
  import { SpeedInsights } from '@vercel/speed-insights/next'
  // <body> 내 어디든:
  <SpeedInsights />
  ```

**Auth/세션/CSRF 영향 0**, SSR 안전 (Vercel 공식 client component, 자체 동적 로딩). 테스트 신규 불필요 (Vercel runtime이 production에서만 활성).

**Open Question**: 분석 데이터 수집 동의 표시 (개인정보 안내) 필요한지 — 현재 사이트 약관 정책 확인 후 결정.

## 9. Resolved Decisions

- `MOVIE_GENRES` 초기 목록: §5.2 안 그대로 채택 (액션/드라마/코미디/SF/로맨스/스릴러/다큐멘터리/애니메이션/공포/기타).
- E2E 시드 영화 수: 책 시드와 **동등**한 개수 (e2e-alice·bob 각각).
- SpeedInsights 분석 동의 표시: **불필요** (web vitals만 수집, IP 익명화, 한국 개보법 기준 의무 없음).

## 10. Deferred (구현 중 결정)

- 홈 페이지 영화 통계 섹션의 위치·디자인 (책 통계 아래 / 좌우 분할 등) — 구현 단계에서 시각적 확인 후 결정.
