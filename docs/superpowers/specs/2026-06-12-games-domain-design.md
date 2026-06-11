# 게임 도메인 추가 설계

날짜: 2026-06-12
상태: 승인됨

## 개요

책(books)·영화(movies)와 동형의 게임(games) 도메인을 추가한다. 사용자는 플레이한 게임을 기록하고(별점·장르·감상), 통계를 보고, 공개 설정 시 피드와 작품 집계 페이지에 노출할 수 있다.

핵심 결정 (사용자 확인 완료):

1. **외부 메타데이터 API: RAWG** — 무료 API 키, REST 단순, 커버·장르·연도 제공. TMDB 통합 패턴과 거의 동일.
2. **엄격 동형 스키마** — `developer`/`playedDate`/`rawgId`가 movies의 `director`/`watchedDate`/`tmdbId` 자리를 대체. platform·playtime 등 게임 특화 컬럼 없음 (플랫폼은 공유 태그로 커버 가능).
3. **패턴 복제 일괄 구현** — movies 패턴 그대로 CRUD+stats+works+feed+테스트를 한 번에. 도메인 간 중복 증가는 감수하고, 제네릭 추출은 추후 별도 브랜치에서 검토.

## 1. DB 스키마 (`src/lib/db/schema.ts`)

### `games` 테이블 — movies와 동형

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | integer PK | |
| authorUserId | integer NOT NULL FK → users | 멀티테넌트 스코핑 |
| title | text NOT NULL | |
| developer | text NOT NULL | movies.director 자리 |
| genre | text NOT NULL | `GAME_GENRES` 중 하나 |
| playedDate | text NOT NULL | movies.watchedDate 자리, `YYYY-MM-DD` |
| rating | integer NOT NULL CHECK 1-10 | UI 표시는 ÷2 별점 |
| content | text NOT NULL | 감상 본문 (마크다운) |
| oneLineReview | text nullable | |
| isPublic | integer 0\|1 | |
| publishedAt | text nullable | |
| slug | text NOT NULL | |
| rawgId | integer nullable | movies.tmdbId 자리 |
| coverUrl | text nullable | |
| externalSource | text nullable | |
| createdAt / updatedAt | text | |

### 인덱스 — movies와 동형 6개

- `(authorUserId, playedDate DESC)`
- `(authorUserId, genre)`
- `(authorUserId, rating DESC)`
- `(authorUserId, slug)` UNIQUE
- `(isPublic, publishedAt DESC)`
- `(isPublic, rawgId)`

### `game_tags` junction

`movie_tags`와 동형 — PK `(gameId, tagId)` + 역방향 `(tagId)` 인덱스. 태그는 books/movies/writings와 공유하는 기존 `tags` 테이블 사용.

### Invariant 준수

- `isSlugUniqueViolation`(queries/shared.ts)에 `(authorUserId, slug)` 새 unique 인덱스의 컬럼 시그니처·인덱스 이름 패턴 추가 (CLAUDE.md invariant 5).

## 2. 외부 검색 — RAWG (`src/lib/external/`)

### `games.ts` — 검색 어댑터

- `GET https://api.rawg.io/api/games?search={query}&key={RAWG_API_KEY}&page_size={limit}`
- 매핑: `background_image` → coverUrl, `released` → year, `genres[0]` → `GAME_GENRES` 매핑 (RAWG genre slug → 한국어 장르; 미매핑 시 omit), `rating`(0-5 스케일) → externalRating.
- **developer는 검색 응답에 없음** → TMDB 선례(movies.ts `byline: ''`)대로 빈 값, 사용자 수동 입력. 상세 N+1 호출 안 함.
- 캐시: `force-cache` + `revalidate: 3600` + 태그 (movies.ts 동형).
- 에러 처리: 429/401·403/5xx throw, 4xx 빈 배열 (movies.ts 동형).

### `game-lookup.ts` — ID 상세 조회 (works 페이지용)

- `GET https://api.rawg.io/api/games/{id}?key=` — `'use cache: remote'` + `cacheLife('days')` + 캐시 태그 (movie-lookup.ts 동형).
- 상세 응답에는 `developers[]` 있음 → works 상세 표시에 활용 가능.

### 공통

- `route-factory.ts`·`rate-limit.ts` 재사용.
- `/api/external/games/lookup` 라우트는 기존 wrapper 미적용 예외 패턴 (logAdapterError + 503 자체 catch) 따름 — CLAUDE.md "wrapper 미적용 예외" 목록에 추가.
- `types.ts`에 `GameSearchItem`·`GameLookupResult` 추가.
- env: `RAWG_API_KEY` — `.env.local` 수동 추가. 없으면 외부 검색만 비동작 (Blob 토큰과 동일한 graceful degradation).

### `genres.ts` — `GAME_GENRES`

RPG · 액션 · 어드벤처 · 시뮬레이션 · 전략 · 퍼즐 · 스포츠 · 레이싱 · 슈팅 · 인디 · 기타 (구현 시 RAWG genre slug 매핑표와 함께 확정).

## 3. 쿼리 (`src/lib/db/queries/games.ts`)

`queries/movies.ts` 동형 복제:

- `createGame`/`updateGame` — **트랜잭션 내** tag 교체 + 본문 mutation (invariant 6), slug 충돌 최대 100회 retry (invariant 5).
- `listGames`/`countGames` — 검색·필터 파라미터를 count에도 동일 전달 (페이지네이션 total 동기화). LIKE 검색은 `escapeLikePattern` + `ESCAPE '\'` (invariant 4).
- `attachTagsBatch` 패턴으로 N+1 회피.
- `getGameBySlug`/`getGameById` — 모두 `authorUserId` 스코핑.
- `listRecentPublicGames` — 유일한 cross-user 쿼리, **반드시 `isPublic = 1 AND publishedAt IS NOT NULL`** (invariant 1 예외 규칙).
- `countGamesByExternalId` — by-external 라우트용.
- barrel(`queries.ts`)에 export 추가.

## 4. 검증·인증 헬퍼

- `validations.ts`: `gameSchema` — 영화 스키마 동형 (제목·developer·genre enum·playedDate·rating 1-10·content·oneLineReview·isPublic·rawgId·coverUrl·externalSource).
- `auth-helpers.ts`: `requireOwnGame(id)` (API용, HttpError throw) + `requireOwnGameForPage(id)` (페이지용, notFound()).

## 5. API 라우트 (`src/app/api/games/`)

movies와 동형 4종, 전부 `withApiHandler` + `requireJsonBody`/`requireQuery`/`requireIdParam`:

| 라우트 | 메서드 | 비고 |
|---|---|---|
| `/api/games` | GET(목록)·POST(생성) | `requireUser` + 페이지네이션 |
| `/api/games/[id]` | GET·PUT·DELETE | `requireOwnGame` |
| `/api/games/by-external` | GET | 커스텀 쿼리 shape — wrapper 검증 예외 패턴 |
| `/api/games/stats` | GET | 대시보드 집계 |
| `/api/external/games/search` | GET | route-factory 기반 RAWG 프록시 |
| `/api/external/games/lookup` | GET | logAdapterError+503 예외 패턴 |

## 6. 페이지·컴포넌트

### 페이지 (`src/app/games/`) — movies 동형 5종

- `page.tsx` — 목록: 제목 행(제목+개수+StatsPageLink), 검색·장르 필터, 페이지네이션, 접이식 StatsPanel.
- `[slug]/page.tsx` — 상세 (+ loading.tsx).
- `new/page.tsx` — `FreshOnVisible`로 감싼 GameForm (Next 16 Activity gotcha).
- `edit/[id]/page.tsx` — `FreshOnVisible` + key (+ loading.tsx).
- `stats/page.tsx` — 통계 대시보드.

### 컴포넌트

- `GameForm` — `useCrudForm(onSubmit·deleteAction)` + `FormActionBar` + form-helpers(`getEditorMarkdownOrToast`/`saveJsonOrToast`) 조합. MovieForm 동형: 외부 검색(RAWG) → 자동 채움(제목·커버·장르·연도), developer 수동 입력.
- `stats/` — StatsPanel `ENDPOINT`에 games 추가, StatsDashboard·charts 게임 대응.
- 외부 검색 카드 — 기존 works/검색 카드 패턴 재사용.
- 네비게이션(헤더) — 게임 링크 추가.

## 7. 공개 영역

- `works/game/[rawgId]/page.tsx` — 공개 작품 집계 페이지 (book/[isbn], movie/[tmdbId] 동형). 집계 쿼리는 `isPublic = 1 AND publishedAt IS NOT NULL` 필수. 한줄평 없어도 published면 평점 집계 포함 (기존 works 집계 규칙).
- 공개 피드(`feed/`)에 게임 포함 — `listRecentPublicGames`.
- `public-feed-cache.ts`·`works-detail-cache.ts`에 게임 캐시 태그·무효화 추가. 게임 mutation 시 무효화 호출 (movies 동형).
- works 검색(`works/search`)에 게임 타입 추가.

## 8. 홈 통계

- `getUserStats`(queries/stats.ts) 스칼라 서브쿼리에 games 카운트 추가 — raw `sql` 단일왕복 사유(invariant 7) 유지. "올해" 기준은 `currentKstYear()` 동일.
- 홈 `page.tsx`에 게임 통계 표시.

## 9. 테스트

| 종류 | 항목 |
|---|---|
| 통합 | `games-scoping` — 멀티테넌트 cross-user 격리 회귀 가드 (목록·상세·수정·삭제·by-external) |
| 통합 | `stats-games` — 통계 집계, works 집계에 게임 포함 |
| 통합 | public-feed에 게임 노출 (`isPublic`·`publishedAt` 가드 검증) |
| unit | `validations`(gameSchema), `stats-routes` ROUTES에 games 추가 |
| e2e | golden-path 게임 버전 (생성→목록→상세→수정→삭제), 셀렉터 `:visible` 한정 |
| 인프라 | `factories.ts`에 `createGame` factory (createdAt/updatedAt override 존중), `seed:e2e`에 e2e-alice 게임 시드 |

## 10. DB 반영 절차

- 로컬: `TURSO_URL=file:local.db pnpm exec drizzle-kit push` (TOKEN 없이).
- prod Turso: `drizzle-kit push`/`migrate` 신뢰 불가 — raw `@libsql/client`로 `CREATE TABLE`/`CREATE INDEX` 실행 + `PRAGMA table_info` 검증 (CLAUDE.md gotcha).

## 11. 문서 갱신

- CLAUDE.md: DB 스키마 요약에 games·game_tags, 아키텍처 트리에 games 경로, wrapper 미적용 예외에 `external/games/lookup` 추가.
- README.md: 기능 목록·아키텍처·테스트 수치 갱신.

## 범위 제외 (YAGNI)

- platform·playtime 컬럼 — 태그로 대체 가능, 필요 시 추후.
- RAWG 상세 N+1 호출로 developer 자동 채움 — TMDB 선례대로 수동 입력.
- books/movies/games 공통부 제네릭 추출 — 별도 브랜치에서 추후 검토.
