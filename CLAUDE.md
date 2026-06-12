# CLAUDE.md

멀티유저 독후감/글방 사이트. Next.js 16 App Router · libSQL/Turso · Drizzle ORM · Biome.
사람용 안내는 `README.md`. 이 문서는 Claude가 코드를 안전하게 수정하기 위한 **invariant 모음**.

## Commands

```bash
pnpm dev                    # 개발 서버
pnpm build                  # 프로덕션 빌드
pnpm test                   # Vitest (unit + integration, vitest.config.ts에서 둘 다 포함)
pnpm e2e                    # Playwright
pnpm lint                   # Biome check (lint + format 검사만)
pnpm format                 # Biome safe 자동 수정
pnpm format:unsafe          # Biome unsafe 수정까지 — review 후 사용

# Drizzle (반드시 dotenv prefix 필요 — .env.local 자동 로드 안됨)
pnpm exec dotenv -e .env.local -- drizzle-kit push        # 스키마 → DB 반영
pnpm exec dotenv -e .env.local -- drizzle-kit generate    # 마이그레이션 생성
pnpm exec dotenv -e .env.local -- pnpm run seed:admin     # 첫 admin 시드
```

ESLint 없음 — **Biome 단독**. `npm run lint` 같은 이전 명령은 더 이상 안 통합니다.

## 핵심 Invariant

### 1. 멀티테넌트 (모든 mutation의 첫 줄)

**모든 책/글 접근은 본인 것인지 확인해야 합니다.** 직접 `db.select().from(books).where(eq(books.id, id))` 같은 식으로 ID만 보고 조회하면 **다른 사용자 데이터가 누출됩니다**.

| 컨텍스트 | 책 | 영화 | 게임 | 글 |
|---|---|---|---|---|
| API route | `requireOwnBook(id)` → `HttpError` throw | `requireOwnMovie(id)` | `requireOwnGame(id)` | `requireOwnWriting(id)` |
| Server component / page | `requireOwnBookForPage(id)` → `notFound()` | `requireOwnMovieForPage(id)` | `requireOwnGameForPage(id)` | `requireOwnWritingForPage(id)` |
| Admin-only API | `requireAdmin()` (먼저) |
| 인증만 필요 | `requireUser()` |
| 비번 변경 endpoint 자체 | `requireUser({ allowMustChangePassword: true })` |

전부 `src/lib/auth-helpers.ts`. `mustChangePassword=1` 사용자는 기본적으로 **모든 mutation에서 차단**됨 — `requireUser`가 throw. 비번 변경 endpoint만 opt-in.

**PATCH/DELETE 라우트 변형 (2026-06 왕복 최적화)**: 미디어·글 PATCH/DELETE는 `requireOwn*` 선조회 대신 `requireUser()` + mutation 쿼리 자체의 `WHERE (id, authorUserId)` 스코프로 소유권을 강제 (0 row → 404). 단건 GET은 `requireOwn*`이 row까지 반환하므로 핸들러에서 재조회 금지. 어느 쪽이든 **ID만으로 접근하는 쿼리는 여전히 금지**.

**유일한 예외 = 공개 피드**: `listRecentPublicBooks/Movies/Games`·works 집계만 `authorUserId` 필터 없음. 이들은 반드시 `isPublic = 1 AND publishedAt IS NOT NULL` 조건 — 이 조건 없는 cross-user 쿼리는 무조건 버그.

### 2. Proxy (`src/proxy.ts`)

Next 16.2.9부터 `middleware` 파일 컨벤션이 deprecated되어 `proxy`로 개명됨 (파일명 + export 함수명 `proxy`). 과거 커밋/문서의 `middleware.ts` 표기는 같은 파일의 옛 이름.

3-layer 게이트 (순서대로):
1. **CSRF** — POST/PUT/PATCH/DELETE는 `Origin` (없으면 `Referer`) host가 request host와 같아야 함. 다르면 즉시 403.
2. **세션** — `session` 쿠키 JWT 검증 (issuer=`book-report`, audience=`book-report-web`, HS256).
3. **mcp 게이트** — `session.mcp === 1` (mustChangePassword)이면 `/settings/password`와 `/api/users/me/password` 외 모두 redirect/403.

미들웨어가 **edge에서 한 번 차단**해도, API handler는 다시 `requireUser`/`requireAdmin`을 부르세요 — 미들웨어 우회 시나리오 대비 + role 체크는 미들웨어가 안 함.

### 3. JWT tokenVersion

`users.tokenVersion`은 비번 변경/admin 리셋마다 +1. JWT 페이로드의 `tv` 클레임과 DB값이 다르면 `getCurrentUser`가 `null` 반환 → 사실상 강제 로그아웃. 비번 변경 endpoint 작업 시 `tokenVersion` 증가 누락 금지.

### 4. LIKE 패턴은 반드시 escape

`src/lib/db/queries/shared.ts`의 `escapeLikePattern(s)` 사용 후 SQL에 `ESCAPE '\'` 명시. 검색어가 `%`, `_`, `\`를 포함하면 raw로 전달 시 와일드카드로 해석되어 의도와 다른 결과 + 잠재적 정보 누출.

### 5. Slug 충돌 retry

`createBook`/`createMovie`/`createGame`/`createWriting`은 `(authorUserId, slug)` 유니크 인덱스 위배 시 최대 100번 `-2`, `-3`... 으로 재시도. 에러 메시지 시그니처는 driver/version별로 다양 — `isSlugUniqueViolation`/`isMovieSlugUniqueViolation`/`isGameSlugUniqueViolation`이 컬럼 시그니처와 인덱스 이름을 **모두** 매칭 (각 `idx_*_user_slug`). 새 unique 인덱스 추가 시 이 함수에 패턴 추가 필요.

### 6. 트랜잭션 + N+1 회피

- `createBook`/`updateBook`/`createMovie`/`updateMovie`/`createGame`/`updateGame`/`createWriting`/`updateWriting`은 **트랜잭션 내에서** tag 교체 + 본문 mutation 둘 다 처리. 중간 실패 시 부분 상태 남지 않게.
- 리스트 조회의 tag 부착은 `attachTagsBatch(bookIds[])`로 한 번에 — 각 row마다 따로 조회하는 N+1 패턴 금지.

### 7. 쿼리 작성: ORM builder가 기본, raw `sql`은 예외 사유 있을 때만

기본은 drizzle query builder (`and`/`eq`/`isNotNull`/`count()` 등). raw ``sql` ` ``가 정당한 경우 (2026-06 전수 검토로 확정):

- **LIKE 검색** — drizzle `like()`는 `ESCAPE` 절 미지원 → invariant 4 위반이라 사용 금지. raw로 `LIKE ${pattern} ESCAPE '\'` 유지.
- **스칼라 서브쿼리 단일왕복** (`getUserStats`류) — builder로 풀면 쿼리 N개로 쪼개져 단일 왕복 특성 상실.
- **동적 테이블/컬럼 제네릭** (`contentDashboard`) — builder는 동적 `SQLiteTable`에서 타입 추론 붕괴.
- **SQLite 함수** — `strftime`/`substr`/`LENGTH` 등.

위 사유 없는 raw(조인 조건, `IS NOT NULL`, `COUNT(*)` 정렬)는 builder로 쓸 것.

**인덱스**: 2026-06 `EXPLAIN QUERY PLAN` 전수 실측 — 현행 인덱스 충분, 추가 금지(개인 규모 + 쓰기 비용). `LIKE 'YYYY-%'` year 필터가 인덱스 range를 못 타지만 covering 인덱스라 무해 — "LIKE는 느리다"로 단정해 인덱스 추가하지 말 것. 공개 사이트 성장 시 유일 검토 후보: `idx_books_public_isbn_published`.

## 아키텍처 한눈에

```
src/
├ app/
│  ├ api/
│  │  ├ books/, movies/, games/      CRUD + by-external (외부 ID 기반 기록 조회)
│  │  ├ writings/                    CRUD
│  │  ├ uploads/                     글방 cover 이미지 업로드/보상삭제 (Vercel Blob)
│  │  ├ external/                    외부 작품 검색 프록시 (네이버 책/TMDB/RAWG)
│  │  ├ users/                       admin-only 사용자 관리 + me/password, me/profile
│  │  ├ login/, logout/, admin/, tags/
│  ├ books/, movies/, games/         목록·상세·new·edit·stats
│  ├ writings/                       글방 목록·상세·new·edit
│  ├ works/                          공개 작품 집계 (book/[isbn], movie/[tmdbId], game/[rawgId])
│  ├ feed/                           공개 피드 (책/영화/게임 탭)
│  ├ admin/users/, settings/, login/
│  └ page.tsx                        홈 (getUserStats 단일 쿼리, KST 연도)
├ components/                        BookForm/MovieForm/GameForm/WritingForm/MarkdownEditor 등
│  │                                 CRUD 폼 = useCrudForm(onSubmit·deleteAction) + FormActionBar
│  │                                 + form-helpers(getEditorMarkdownOrToast/saveJsonOrToast) 조합
│  ├ stats/                          StatsDashboard/SummaryCards/charts(chart.js lazy) — /:domain/stats 페이지가 사용
│  └ works/                          공개 작품 상세·검색 카드
├ lib/
│  ├ auth.ts / auth-edge.ts          bcrypt + jose HS256 JWT (DUMMY_HASH timing guard)
│  ├ auth-helpers.ts                 requireUser/Admin/OwnBook/OwnMovie/OwnGame/OwnWriting + HttpError
│  ├ api-handler.ts                  withApiHandler + requireIdParam/JsonBody/Query (Validation 섹션 참고)
│  ├ db/
│  │  ├ schema.ts                    users, books, movies, games, writings, tags, *_tags
│  │  ├ queries.ts                   barrel — 실제 구현은 queries/{books,movies,games,writings,tags,stats,shared}.ts
│  │  └ client.ts                    libsql/drizzle
│  ├ external/                       외부 API lookup + rate-limit + route-factory (네이버/TMDB/RAWG)
│  ├ validations.ts                  zod 스키마 (책/영화/게임/글/사용자/페이지네이션)
│  ├ rating.ts                       별점 ÷2 표시 변환 단일 지점
│  ├ kst.ts                          currentKstYear() — "올해" 집계 연도 단일 소스
│  ├ stats-types.ts                  대시보드 공유 타입 (클라이언트는 여기서만 import)
│  ├ blob.ts / image-constraints.ts  Vercel Blob 업로드·제약
│  ├ public-feed-cache.ts / works-detail-cache.ts
│  ├ excerpt.ts, highlight.tsx, slug.ts, genres.ts, isbn.ts, username-normalize.ts
└ proxy.ts                           CSRF + 세션 + mcp 게이트 (구 middleware.ts)
```

## DB 스키마 요약

- **users** (id, username uniq, displayName, passwordHash, role 'admin'|'member', mustChangePassword 0|1, tokenVersion, createdAt)
- **books** (id, **authorUserId**, title, author, genre, readDate, rating CHECK 1-10, content, oneLineReview?, isPublic 0|1, publishedAt?, slug, isbn?, coverUrl?, externalSource?, ts)
  - composite: `(user, date DESC)`, `(user, genre)`, `(user, rating DESC)`, `(user, slug) UNIQUE`, `(isPublic, publishedAt DESC)`, `(isPublic, isbn)`
- **movies** — books와 동형 (director/watchedDate/tmdbId가 author/readDate/isbn 자리). 인덱스도 동형.
- **games** — movies와 동형 (developer/playedDate/rawgId가 director/watchedDate/tmdbId 자리). 인덱스도 동형.
- **writings** (id, **authorUserId**, title, body, coverUrl?, slug, ts)
  - composite: `(user, createdAt DESC)`, `(user, slug) UNIQUE`
- **tags** + **book_tags** + **writing_tags** + **movie_tags** + **game_tags** — 태그는 books/writings/movies/games가 **공유** (`tags.name UNIQUE`). junction PK `(entity, tag)` + 역방향 `(tag)` 인덱스로 양방향 커버.

**rating 스케일**: DB 저장은 **1~10 정수** (books·movies·games 동일, CHECK `BETWEEN 1 AND 10`). UI 표시는 항상 **÷2 = 0.5~5 별점** (`RatingScore` 관례). 통계·차트·라벨 등 사용자에게 보이는 모든 별점 값은 /2 스케일로 변환할 것 — 1~10 그대로 노출 금지.

`authorUserId`는 모든 user-scoped 테이블의 NOT NULL FK. 새 user-scoped 테이블 추가 시 동일 패턴 (FK + composite index + slug retry + requireOwn* 헬퍼) 따라가세요.

## Validation

`src/lib/validations.ts`에 zod 스키마 집합. API/form 양쪽에서 동일 스키마 재사용 — 라우트에서 직접 zod chain을 새로 만들지 말 것.

페이지네이션은 `paginationSchema` (limit/offset 검증) + 리스트 쿼리는 `count*` 함수로 total 별도 조회. 검색/필터 파라미터를 `count*`에 **반드시 같이 전달** — 안 그러면 페이지네이션 totalPages가 어긋남.

### API route 작성 패턴

핸들러는 `withApiHandler(label, handler)`(`src/lib/api-handler.ts`)로 감싼다 — HttpError→JSON 변환 + 500 fallback 담당. body는 `requireJsonBody(req, schema)`, query는 `requireQuery(req, schema)`, `[id]` 세그먼트는 `requireIdParam(params)` — 전부 실패 시 HttpError(400) throw. 라우트에 try/catch·safeParse 400 분기 직접 작성 금지.

**wrapper 미적용 예외 (건드릴 때 주의)**: `login`(HttpError 변환 경로 없음 — throw하면 미처리 500), `works/search`·`external/*/lookup`(logAdapterError+503 자체 catch), `users/me/password` body 검증(`issues[0].message`를 응답으로 쓰는 특수 shape), `*/by-external` 쿼리(커스텀 파라미터 shape).

## 테스트

```
tests/
├ unit/           Vitest — auth/validations/blob/uploads-route/stats-routes/components 등
├ integration/    실제 SQLite — *-scoping(멀티테넌트 회귀 가드), stats-*, public-feed,
│                 works-aggregation, writings-cover, external-search
└ e2e/            Playwright — golden-path(책/영화), stats-panel, public-feed, works-search 등
```

- `tests/setup-db.ts`가 임시 파일 libSQL을 띄우고 `tests/factories.ts`가 user/book/movie/game/writing factory 제공.
- e2e는 `global-setup.ts`가 `seed:e2e`를 자동 실행 — 표준 계정 `e2e-alice`/`e2e-bob` (`e2etestpass1234`, alice는 영화·게임 시드 보유). 로그인은 `tests/e2e/helpers.ts`의 `login()` 사용 — spec마다 복제 금지.
- factory는 `createdAt`/`updatedAt` **override를 존중** — 통계 연도 필터링 테스트가 이걸 필요로 함.
- 통합 테스트는 멀티테넌트 격리가 진짜로 작동하는지 검증하는 회귀 가드 — 새 user-scoped 쿼리 추가 시 cross-user 격리 케이스 1개씩 추가.

## 코드 스타일 (Biome)

- 싱글 따옴표, 세미콜론 as-needed, trailing comma all, line width 100, indent 2 spaces (`biome.json`).
- `noExplicitAny`: warn — 의도적 `any`는 `// biome-ignore` 코멘트 + 사유.
- `useExhaustiveDependencies`: warn (React hooks).
- 자동 import 정렬은 **꺼져있음** (`assist.actions.source.organizeImports: off`) — 수동 정렬 그대로 유지.

## Gotchas

- **`.env.local` $ escape**: `$2a$...` 같은 bcrypt 해시를 환경변수로 넣을 때 `\$2a\$...`로 escape 안 하면 dotenv-expand가 변수로 해석. `LEGACY_OWNER_PASSWORD_HASH`, `INITIAL_ADMIN_PASSWORD`(평문이라 영향 적음) 모두 주의.
- **Drizzle 명령 prefix**: Next.js dotenv는 drizzle-kit에 안 먹습니다. 항상 `pnpm exec dotenv -e .env.local --` 붙이세요.
- **Turso(prod) 스키마 변경**: `drizzle-kit push`는 Turso에서 SQL_INPUT_ERROR로 실패, `migrate`는 **silent no-op** (EXIT 0인데 `__drizzle_migrations` 빈 채 미적용). raw `@libsql/client` ALTER + `PRAGMA table_info` 검증만 신뢰할 것. exit code를 적용 성공의 증거로 믿지 말 것. (로컬 `file:` DB엔 push 정상 동작 — 단 `TURSO_TOKEN=`이 빈 문자열이면 turso dialect 검증 실패하므로 `TURSO_URL=file:local.db pnpm exec drizzle-kit push`처럼 TOKEN 없이 실행.)
- **Toast UI Editor**: SSR 비호환 — `'use client'` 컴포넌트 (`MarkdownEditor.tsx`)에서만 import. 서버 컴포넌트에서 직접 import 금지.
- **Next 16 세그먼트 보존(React Activity)**: 라우터가 떠난 페이지를 unmount하지 않고 hidden 보존 — client state·DOM이 재진입 후에도 살아있음. ① 입력 폼류 페이지는 `FreshOnVisible`로 감싸 재진입 시 remount (`key`/`template.tsx`로는 못 막음 — reconcile 자체가 안 일어남). ② e2e 셀렉터는 `:visible` 한정 — 안 그러면 hidden 사본(이전 페이지 폼)을 잡아 오탐.
- **`DEFAULT_USER_PASSWORD` 변경 시**: 이미 발급된 신규 계정엔 영향 없음 (해시는 생성 시 한 번 굳음).
- **WSL2 next dev hang**: 60s 안에 안 뜨면 README의 트러블슈팅 섹션 참고 (`pkill next-server` + `rm local.db`는 **destructive**라 Claude는 사용자 승인 후에만 실행).
- **Vercel Blob 토큰**: 글방 대표 이미지 업로드(`/api/uploads`)는 `BLOB_READ_WRITE_TOKEN` 필요. Vercel은 Blob store 연결 시 자동 주입, 로컬은 `.env.local`에 수동 추가. 없으면 업로드만 비동작(나머지 영향 없음). 글방 cover는 `writings.coverUrl`(nullable) 컬럼에 Blob public URL로 저장 — 교체/제거·글 삭제 시 `deleteBlobIfManaged`로 옛 Blob 정리(트랜잭션 밖).
- **RAWG_API_KEY**: 게임 외부 검색(`/api/external/games/search`·`lookup`)에 필요. Vercel 환경변수 또는 로컬 `.env.local`에 수동 추가. 없으면 게임 외부 검색만 비동작(나머지 영향 없음). **주의: RAWG 키는 URL 쿼리 파라미터(`?key=...`)로 전달됨 — 어댑터 에러 메시지나 로그에 요청 URL을 그대로 포함하면 키가 노출되므로 금지.**
