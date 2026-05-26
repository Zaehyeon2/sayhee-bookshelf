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

| 컨텍스트 | 책 | 글 |
|---|---|---|
| API route | `requireOwnBook(id)` → `HttpError` throw | `requireOwnWriting(id)` |
| Server component / page | `requireOwnBookForPage(id)` → `notFound()` | `requireOwnWritingForPage(id)` |
| Admin-only API | `requireAdmin()` (먼저) |
| 인증만 필요 | `requireUser()` |
| 비번 변경 endpoint 자체 | `requireUser({ allowMustChangePassword: true })` |

전부 `src/lib/auth-helpers.ts`. `mustChangePassword=1` 사용자는 기본적으로 **모든 mutation에서 차단**됨 — `requireUser`가 throw. 비번 변경 endpoint만 opt-in.

### 2. Middleware (`src/middleware.ts`)

**`proxy.ts` 아님.** README의 옛 표기를 신뢰하지 말 것.

3-layer 게이트 (순서대로):
1. **CSRF** — POST/PUT/PATCH/DELETE는 `Origin` (없으면 `Referer`) host가 request host와 같아야 함. 다르면 즉시 403.
2. **세션** — `session` 쿠키 JWT 검증 (issuer=`book-report`, audience=`book-report-web`, HS256).
3. **mcp 게이트** — `session.mcp === 1` (mustChangePassword)이면 `/settings/password`와 `/api/users/me/password` 외 모두 redirect/403.

미들웨어가 **edge에서 한 번 차단**해도, API handler는 다시 `requireUser`/`requireAdmin`을 부르세요 — 미들웨어 우회 시나리오 대비 + role 체크는 미들웨어가 안 함.

### 3. JWT tokenVersion

`users.tokenVersion`은 비번 변경/admin 리셋마다 +1. JWT 페이로드의 `tv` 클레임과 DB값이 다르면 `getCurrentUser`가 `null` 반환 → 사실상 강제 로그아웃. 비번 변경 endpoint 작업 시 `tokenVersion` 증가 누락 금지.

### 4. LIKE 패턴은 반드시 escape

`src/lib/db/queries.ts`의 `escapeLikePattern(s)` 사용 후 SQL에 `ESCAPE '\'` 명시. 검색어가 `%`, `_`, `\`를 포함하면 raw로 전달 시 와일드카드로 해석되어 의도와 다른 결과 + 잠재적 정보 누출.

### 5. Slug 충돌 retry

`createBook`/`createWriting`은 `(authorUserId, slug)` 유니크 인덱스 위배 시 최대 100번 `-2`, `-3`... 으로 재시도. 에러 메시지 시그니처는 driver/version별로 다양 — `isSlugUniqueViolation`이 컬럼 시그니처와 인덱스 이름을 **모두** 매칭. 새 unique 인덱스 추가 시 이 함수에 패턴 추가 필요.

### 6. 트랜잭션 + N+1 회피

- `createBook`/`updateBook`/`createWriting`/`updateWriting`은 **트랜잭션 내에서** tag 교체 + 본문 mutation 둘 다 처리. 중간 실패 시 부분 상태 남지 않게.
- 리스트 조회의 tag 부착은 `attachTagsBatch(bookIds[])`로 한 번에 — 각 row마다 따로 조회하는 N+1 패턴 금지.

## 아키텍처 한눈에

```
src/
├ app/
│  ├ api/
│  │  ├ books/, writings/         CRUD (인증 필수)
│  │  ├ users/                    admin-only 사용자 관리 + me/password, me/profile
│  │  ├ login/, logout/           세션 발급/말소
│  │  ├ admin/                    admin-only 라우트
│  │  └ tags/                     태그 자동완성
│  ├ books/, writings/            목록·상세·new·edit 페이지
│  ├ admin/users/                 사용자 관리 페이지
│  ├ settings/{password,profile}  본인 설정
│  ├ login/
│  └ page.tsx                     홈 (getUserStats 단일 쿼리)
├ components/                     BookForm/WritingForm/MarkdownEditor/Pagination 등
├ lib/
│  ├ auth.ts                      bcrypt + jose HS256 JWT (DUMMY_HASH timing guard)
│  ├ auth-helpers.ts              requireUser/Admin/OwnBook/OwnWriting + HttpError
│  ├ db/
│  │  ├ schema.ts                 users, books, writings, tags, *_tags (+ composite index)
│  │  ├ queries.ts                트랜잭션·LIKE escape·slug retry·N+1 batch·getUserStats
│  │  └ client.ts                 libsql/drizzle
│  ├ validations.ts               zod 스키마 (책/글/사용자/페이지네이션)
│  ├ excerpt.ts, highlight.tsx    검색 매칭 부근 발췌 + <mark> 하이라이트
│  ├ slug.ts                      Hangul-friendly slug
│  └ username-normalize.ts        대소문자/공백 정규화
└ middleware.ts                   CSRF + 세션 + mcp 게이트
```

## DB 스키마 요약

- **users** (id, username uniq, displayName, passwordHash, role 'admin'|'member', mustChangePassword 0|1, tokenVersion, createdAt)
- **books** (id, **authorUserId**, title, author, genre, readDate, rating CHECK 1-5, content, slug, ts)
  - composite: `(user, date DESC)`, `(user, genre)`, `(user, rating DESC)`, `(user, slug) UNIQUE`
- **writings** (id, **authorUserId**, title, body, slug, ts)
  - composite: `(user, createdAt DESC)`, `(user, slug) UNIQUE`
- **tags** + **book_tags** + **writing_tags** — 태그는 books/writings가 **공유** (`tags.name UNIQUE`).

`authorUserId`는 모든 user-scoped 테이블의 NOT NULL FK. 새 user-scoped 테이블 추가 시 동일 패턴 (FK + composite index + slug retry + requireOwn* 헬퍼) 따라가세요.

## Validation

`src/lib/validations.ts`에 zod 스키마 집합. API/form 양쪽에서 동일 스키마 재사용 — 라우트에서 직접 zod chain을 새로 만들지 말 것.

페이지네이션은 `paginationSchema` (limit/offset 검증) + 리스트 쿼리는 `count*` 함수로 total 별도 조회. 검색/필터 파라미터를 `count*`에 **반드시 같이 전달** — 안 그러면 페이지네이션 totalPages가 어긋남.

## 테스트

```
tests/
├ unit/           Vitest — auth/excerpt/slug/validations/username-normalize/components
├ integration/    실제 SQLite — books-scoping, writings-scoping, stats-and-pagination
└ e2e/            Playwright — auth, golden-path, delete 모달
```

- `tests/setup-db.ts`가 in-memory libSQL을 띄우고 `tests/factories.ts`가 user/book/writing factory 제공.
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
- **Toast UI Editor**: SSR 비호환 — `'use client'` 컴포넌트 (`MarkdownEditor.tsx`)에서만 import. 서버 컴포넌트에서 직접 import 금지.
- **`DEFAULT_USER_PASSWORD` 변경 시**: 이미 발급된 신규 계정엔 영향 없음 (해시는 생성 시 한 번 굳음).
- **WSL2 next dev hang**: 60s 안에 안 뜨면 README의 트러블슈팅 섹션 참고 (`pkill next-server` + `rm local.db`는 **destructive**라 Claude는 사용자 승인 후에만 실행).
