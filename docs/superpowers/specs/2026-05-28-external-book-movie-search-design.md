# External Book/Movie Search Integration — Design

**Date:** 2026-05-28
**Status:** Approved (pending user spec review)
**Scope:** 책·영화 리뷰 작성 시 외부 API(국립중앙도서관 SRU, TMDB)로 작품 검색 후 폼 필드를 autofill. 외부 식별자와 표지 URL을 함께 저장.

---

## 1. 목적

리뷰 작성 시 사용자가 제목·저자·장르를 매번 손으로 입력하는 마찰을 줄인다. 외부 API에서 작품 메타데이터를 끌어와 정확한 정보로 자동 채움. 외부 식별자(`isbn`, `tmdbId`)를 함께 저장해서 추후 "같은 작품 모아보기" 같은 집계 기능의 기반을 만든다.

### 비목표 (Out of scope)

- 기존 레코드 backfill (사용자가 "신규 컬럼 nullable, 기존 그대로" 선택)
- 별도 `external_works` 정규화 테이블 (현재 schema 분리는 YAGNI; 인덱스만 미리 추가)
- 표지 이미지 자체 호스팅(R2/S3) — 외부 URL 그대로 저장
- 서버측 영구 캐시 (브라우저 `Cache-Control: private, max-age=60`만)
- 작품 자동 추천, 글로벌 평점 집계 등 후속 기능

### 핵심 결정 요약

| 결정 | 값 |
|---|---|
| 범위 | 책·영화 동시 |
| API 소스 | 국립중앙도서관 SRU (책) + TMDB v3 (영화) |
| 저장 전략 | autofill + 외부 ID + cover URL 저장 |
| UX 패턴 | 폼 최상단 검색 바, autocomplete dropdown |
| API 경로 | 서버 프록시 라우트 (API 키 서버측만) |
| Edit mode | 메타 재조회 허용 |
| 중복 등록 | 허용, "이미 등록함" 힌트만 |
| 표지 이미지 | 외부 URL 그대로 (next.config allowlist) |
| 마이그레이션 | 신규 컬럼 nullable, 기존 그대로 |
| 도메인 추상화 | 도메인별 분리 컴포넌트 (`ExternalBookSearchBar` / `ExternalMovieSearchBar`) |
| Combobox UI | `cmdk` 라이브러리 채택 |

---

## 2. Architecture

```
┌──────────────── Browser ────────────────┐
│  BookForm / MovieForm                   │
│   └─ <ExternalBookSearchBar>            │
│        ├─ useExternalSearch (hook)      │
│        │    ├─ debounce 300ms           │
│        │    └─ fetch proxy + abort      │
│        └─ <SearchDropdown> (cmdk wrapper)│
└─────────────────┬───────────────────────┘
                  │ GET /api/external/books/search?q=...
                  │ GET /api/external/movies/search?q=...
                  ▼
┌──────────── Next.js API Route ──────────┐
│  requireUser() gate                     │
│  in-memory rate limit (per user/min)    │
│  fetch upstream + parse                 │
│  normalize → zod-validated DTO          │
└─────────────────┬───────────────────────┘
                  ▼
       국립중앙도서관 SRU API / TMDB v3 API
```

### Data Flow (선택 시)

1. 사용자가 검색어 입력 → debounce 후 proxy 호출
2. proxy가 upstream 호출 → 정규화 DTO 반환
3. dropdown 표시 + 본인 books에서 동일 외부 ID 보유 여부 batch lookup
4. 항목 클릭 → `onSelect(normalized)` 콜백
5. Form state autofill: `title`, `author`/`director`, `genre`, `coverUrl`, `externalId`, `externalSource`
6. 사용자 수동 보정 가능 (모든 필드 editable)
7. Submit 시 기존 `/api/books`(또는 `/api/movies`)에 외부 메타 포함

### Multi-tenant Invariants

- `/api/external/{books,movies}/search` — `requireUser()` 게이트, API 키 서버측만 노출
- `/api/{books,movies}/by-external?ids=...` — 본인 레코드로 scoped (zero leakage)
- DB 컬럼 추가만 있고 기존 `requireOwnBook` / `requireOwnMovie` 흐름은 그대로 — 멀티테넌트 경로 영향 없음

---

## 3. Schema / DB

### Drizzle schema 추가

`src/lib/db/schema.ts`:

```ts
// books — 기존 컬럼 그대로 + 다음 nullable 컬럼 추가
isbn: text('isbn'),                       // 국립중앙 control number 또는 ISBN13
coverUrl: text('cover_url'),              // 외부 표지 URL (http/https)
externalSource: text('external_source'),  // 'nl-kr' | null

// movies — 기존 컬럼 그대로 + 다음 nullable 컬럼 추가
tmdbId: integer('tmdb_id'),
coverUrl: text('cover_url'),
externalSource: text('external_source'),  // 'tmdb' | null
```

### 인덱스 추가 (모아보기 대비)

```ts
// books
isbnIdx: index('idx_books_isbn').on(t.isbn),
publicIsbnIdx: index('idx_books_public_isbn').on(t.isPublic, t.isbn),

// movies
tmdbIdx: index('idx_movies_tmdb').on(t.tmdbId),
publicTmdbIdx: index('idx_movies_public_tmdb').on(t.isPublic, t.tmdbId),
```

**Unique 인덱스 안 검**: 사용자가 "중복 허용" 선택 → 재독·재관람 가능.

### Validation 추가

`src/lib/validations.ts` — `CreateBookSchema`/`UpdateBookSchema`/`CreateMovieSchema`/`UpdateMovieSchema` 각각에:

```ts
// books
isbn: z.string().trim().max(40).nullable().optional(),
coverUrl: z.string().url().max(500).nullable().optional(),    // http/https만
externalSource: z.enum(['nl-kr']).nullable().optional(),

// movies
tmdbId: z.number().int().positive().nullable().optional(),
coverUrl: z.string().url().max(500).nullable().optional(),
externalSource: z.enum(['tmdb']).nullable().optional(),
```

`coverUrl`은 zod `.url()`로 protocol 강제 + Next Image allowlist로 도메인 제한.

### Migration

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
# 생성된 SQL 검토 (NULL allowed 확인)
pnpm exec dotenv -e .env.local -- drizzle-kit push
```

기존 레코드는 NULL로 남음. 신규 등록부터 채워짐. 사용자가 명시적으로 검색 → 선택할 때만 채워짐.

---

## 4. External API Clients + Proxy Routes

### 정규화 DTO

`src/lib/external/types.ts`:

```ts
export interface ExternalSearchItem<TId extends string | number> {
  externalId: TId
  title: string
  subtitle?: string         // 부제 / 원제
  byline: string            // author 또는 director
  year?: number
  genre?: string            // BOOK_GENRES / MOVIE_GENRES 매핑 시도, 실패 시 omit
  coverUrl?: string
}

export interface ExternalSearchResponse<TId extends string | number> {
  items: ExternalSearchItem<TId>[]
  source: 'nl-kr' | 'tmdb'
}
```

### Adapters

**`src/lib/external/books.ts`** — `searchBooks(query, opts) => ExternalSearchItem<string>[]`
- 국립중앙도서관 SRU endpoint 호출, XML 응답
- `fast-xml-parser`로 파싱 (deps 추가)
- ISBN13 우선, 없으면 SRU control number를 `externalId`로 사용
- KDC/DDC 코드 → `BOOK_GENRES` 매핑 테이블, 실패 시 `genre` omit
- 표지 URL은 응답에 포함된 thumbnail URL 사용

**`src/lib/external/movies.ts`** — `searchMovies(query, opts) => ExternalSearchItem<number>[]`
- TMDB `/search/movie?language=ko-KR&include_adult=false`
- JSON 응답 직접 매핑
- TMDB genre id → `MOVIE_GENRES` lookup
- `coverUrl = https://image.tmdb.org/t/p/w185${poster_path}`

### Proxy Routes

**Endpoints**
- `GET /api/external/books/search?q=...`
- `GET /api/external/movies/search?q=...`

**공통 동작**
- Method GET (CSRF 불필요)
- `requireUser()` 게이트
- Query schema: `z.object({ q: z.string().trim().min(2).max(80) })`
- Upstream timeout: 5초 (`AbortController`)
- Response: `ExternalSearchResponse<TId>`
- Response header: `Cache-Control: private, max-age=60`

**Rate limit** — `src/lib/external/rate-limit.ts`
- In-memory `Map<userId, { count: number; resetAt: number }>`
- 분당 20회 (config 상수 `EXTERNAL_SEARCH_RATE_LIMIT = 20`)
- 초과 시 429 + `Retry-After` 헤더

**Error 매핑**
| Upstream | Response |
|---|---|
| 200 OK | `{ items, source }` |
| 4xx | `{ items: [], source }` (빈 결과로 swallow) |
| 5xx / timeout | 503 `{ error: '검색 서비스가 일시적으로 응답하지 않아요' }` |
| 키 누락 (env 없음) | 500 + 서버 로그 (개발용 명확 메시지) |
| Rate limit 초과 | 429 `{ error: '잠시만요, 검색이 너무 많아요' }` |

### "이미 등록" Lookup Endpoints

- `GET /api/books/by-external?ids=isbn1,isbn2,...`
- `GET /api/movies/by-external?ids=1,2,...`

**동작**
- `requireUser()`
- `ids` 파싱: 콤마 split, books는 string, movies는 number
- 본인 레코드 중 일치 카운트
- Response: `{ counts: Record<string, number> }`
- 멀티테넌트 격리: `WHERE author_user_id = ? AND isbn IN (...)` — cross-user 격리 회귀 가드 테스트 필수

### 환경변수

```env
NL_KR_API_KEY=...      # 국립중앙도서관 API 키
TMDB_API_KEY=...       # TMDB v3 API 키
```

키 누락 시 route는 500 + 명확한 로그. 클라이언트는 일반 에러 toast.

---

## 5. UI Components

### 의존성 추가

```
pnpm add cmdk fast-xml-parser
```

- `cmdk` ~3kb gz — combobox primitives (Command, Command.Input, Command.List, Command.Item)
- `fast-xml-parser` — SRU XML 파싱

### `next.config.ts` images.remotePatterns

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'image.tmdb.org' },
    // 국립중앙도서관 표지 호스트 — adapter 구현 시 응답에서 확정 후 추가
    // 예: { protocol: 'https', hostname: 'bookthumb-phinf.pstatic.net' }
  ],
},
```

**Open question**: 국립중앙 SRU 응답이 어느 호스트의 표지 URL을 주는지 adapter 구현 단계에서 확정. allowlist 미리 잡고 미스매치 시 표지 omit + dev 콘솔 경고.

### Component 트리

```
ExternalBookSearchBar / ExternalMovieSearchBar (도메인별)
 ├─ useExternalSearch (hook) — debounce + abort + state machine
 └─ SearchDropdown (cmdk wrapper)
      ├─ Command.Input
      ├─ Command.List
      │    ├─ Command.Item × N (포스터 + title + byline + year + 이미 기록 badge)
      │    └─ Command.Empty (빈 결과 / 로딩 / 에러 분기)
      └─ SelectedChip (선택 후 표시)
```

### 동작 시퀀스 (BookForm 기준)

1. **초기 (create mode)** — input 빈 상태, dropdown 닫힘
2. **초기 (edit mode)** — `initial.isbn` 있으면 chip으로 시작 ("다시 검색" 버튼으로 재오픈). 재검색 후 다른 항목 선택 시 새 값으로 덮어씀 (기존 autofill 흐름과 동일).
3. **입력 시** — `q.length >= 2`이면 300ms debounce → proxy 호출
   - 직전 in-flight 요청 abort
   - 응답 수신 후 본인 books `by-external?ids=...` batch 호출 → "이미 N번 기록" badge 표시
4. **선택 시** — `onSelect(item)` 콜백:
   ```ts
   setTitle(item.title)
   setAuthor(item.byline)
   setGenre(item.genre ?? BOOK_GENRES[0])
   setIsbn(item.externalId)
   setCoverUrl(item.coverUrl ?? null)
   setExternalSource('nl-kr')
   ```
   - Dropdown 닫고 `SelectedChip` 표시 (`[표지] 제목 · 저자 × 초기화`)
5. **chip × 클릭** — 외부 메타만 초기화 (`isbn`, `coverUrl`, `externalSource` = null), title/author/genre는 유지 → 사용자가 그대로 손입력 모드로 진입
6. **수동 수정** — 모든 필드 readonly 아님. chip 유지하면서 자유 수정 가능
7. **Submit** — `payload`에 새 필드 포함

### 키보드 / a11y (cmdk가 처리)

- ↓/↑ 이동, Enter 선택, Esc 닫기
- `aria-activedescendant` 자동, scrollIntoView 자동
- Click outside 닫기

### Toss-style 디자인 통합

- 기존 `inputCls` / `labelCls` 토큰 그대로 적용
- Dropdown 컨테이너: `bg-[var(--color-surface)] shadow-[var(--shadow-toss)] rounded-[var(--radius-toss-sm)]`
- 선택 chip: `RatingStars` 옆 같은 visual weight, danger 색은 × 버튼 hover에만

### Polish

- Image 로드 실패 → placeholder 아이콘 (책 / 영화 emoji 또는 lucide-react Book/Film 아이콘)
- 검색어 < 2자 → dropdown 안 뜸 (debounce도 안 함)
- Empty state: "검색 결과 없음 · 아래에 직접 입력해도 됩니다"
- Loading state: dropdown에 spinner row 1개

---

## 6. Error Handling Matrix

| 상황 | UI 동작 |
|---|---|
| 검색어 < 2자 | dropdown 안 뜸 |
| upstream 200, 결과 0건 | "검색 결과 없음 · 직접 입력해도 됩니다" empty state |
| upstream 5xx / timeout | toast 에러 + dropdown 닫음 |
| Rate limit 429 | toast "잠시만요, 검색이 너무 많아요" |
| 네트워크 단절 | timeout과 동일 분기 |
| API 키 누락 | route 500 → 클라이언트 일반 에러 toast, 서버 로그에 명확 메시지 |
| 이미지 로드 실패 | placeholder 아이콘 fallback |
| 검색 후 모든 필드 수동 수정 | 그대로 저장, externalId chip 초기화 안 누른 한 유지 |
| chip × 클릭 | externalId/coverUrl/externalSource = null, 다른 필드 유지 |
| Edit mode 진입 (isbn 있음) | chip으로 시작, "다시 검색" 누르면 재오픈 |
| 동일 외부 ID 중복 등록 | 허용, dropdown에서 "이미 N번 기록" badge만 표시 |

---

## 7. Security Invariants

- `/api/external/{books,movies}/search` — `requireUser()` 게이트 (mustChangePassword=1 차단). API 키 클라이언트 노출 0
- `/api/{books,movies}/by-external` — `requireUser()` + 본인 author_user_id로만 scoped
- `coverUrl` zod `.url()` 검증 + `next.config` allowlist (XSS/SSRF 표면 최소화)
- DB 저장 시 모든 외부 필드는 zod normalize 후 (drizzle parametrized — SQL injection 무관)
- 신규 컬럼은 기존 `requireOwnBookForPage` / `requireOwnMovieForPage` 흐름에 자동 합류 (별도 게이트 필요 없음)

---

## 8. Testing Plan

### Unit (vitest)

- `src/lib/external/books.ts` — XML 파싱 + KDC 매핑 정상/이상 케이스, ISBN13 / control number fallback
- `src/lib/external/movies.ts` — TMDB JSON 정규화, genre id 매핑, poster_path null 처리
- `src/lib/external/rate-limit.ts` — 윈도우 리셋, per-user 격리
- `src/lib/validations.ts` — 새 optional 필드 (URL only http/https, max length, externalSource enum)

### Integration (vitest + in-memory libSQL + tests/factories.ts)

- `POST /api/books` with `isbn`/`coverUrl`/`externalSource` → 저장 및 read-back 확인
- `PATCH /api/books/:id` 새 필드 수정 + null로 clear
- `GET /api/books/by-external?ids=...` → 본인 isbn만 카운트 (cross-user 격리 회귀 가드)
- `GET /api/external/books/search` — `requireUser()` 게이트 거부 (401), rate limit 분기 (429), upstream stub 응답 정규화
- `movies` 동일 4종 케이스

### E2E (Playwright)

- **New book 플로우**: 검색 입력 → dropdown 결과 선택 → 폼 필드 autofill 확인 → 제출 → 상세 페이지에 표지 표시
- **Playwright `page.route()`** 로 `/api/external/**` 응답 stub (실제 외부 API 안 부름 — flaky 회피)
- **Edit mode**: chip × 클릭 → 외부 메타 초기화 → 저장 → 상세 페이지 표지 사라짐
- **중복 힌트**: 같은 isbn으로 1건 미리 등록 → 재검색 시 "이미 1번 기록" badge 표시 확인

### Build / Lint

- `pnpm build` 통과
- `pnpm lint` (Biome) 통과
- `pnpm test` 전체 통과
- `pnpm e2e` golden path 통과

---

## 9. File Manifest

### 신규 파일

```
src/lib/external/types.ts
src/lib/external/books.ts
src/lib/external/movies.ts
src/lib/external/rate-limit.ts
src/app/api/external/books/search/route.ts
src/app/api/external/movies/search/route.ts
src/app/api/books/by-external/route.ts
src/app/api/movies/by-external/route.ts
src/components/external/SearchDropdown.tsx
src/components/external/useExternalSearch.ts
src/components/external/SelectedChip.tsx
src/components/ExternalBookSearchBar.tsx
src/components/ExternalMovieSearchBar.tsx
tests/unit/external/books.test.ts
tests/unit/external/movies.test.ts
tests/unit/external/rate-limit.test.ts
tests/integration/external-search.test.ts
tests/integration/by-external-scoping.test.ts
tests/e2e/external-search.spec.ts
```

### 수정 파일

```
src/lib/db/schema.ts                          # 신규 컬럼 + 인덱스
src/lib/validations.ts                        # Create/Update 스키마 4종
src/lib/db/queries/books.ts                   # 신규 필드 propagation + by-external 쿼리
src/lib/db/queries/movies.ts                  # 동일
src/components/BookForm.tsx                   # ExternalBookSearchBar 끼움 + 새 state 5종
src/components/MovieForm.tsx                  # ExternalMovieSearchBar 끼움 + 새 state 5종
src/app/books/[slug]/page.tsx                 # 상세 페이지에 표지 표시
src/app/movies/[slug]/page.tsx                # 동일
src/components/BookCard.tsx                   # 카드에 표지 썸네일 (선택적)
src/components/MovieCard.tsx                  # 동일
next.config.ts                                # images.remotePatterns
package.json                                  # cmdk, fast-xml-parser
.env.example                                  # NL_KR_API_KEY, TMDB_API_KEY 자리표시
README.md                                     # 환경변수 안내 한 줄 추가
```

---

## 10. Future Migration Trigger (분리 시점 가이드)

현재 schema에 외부 ID 컬럼만 추가. 아래 요구가 실제로 생기면 `external_works` 정규화 테이블로 분리 검토:

- **손입력 책끼리 사용자가 직접 "같은 책으로 묶기" UI 필요** — 검색 안 거치고 손으로 친 레코드를 canonical work에 연결
- **작품 단위 페이지에서 표지/제목 단일화 필요** — 사용자별로 다르게 입력된 메타를 canonical로 통일
- **글로벌 평점 평균/리뷰 카운트 표시 필요** — 각 work별 집계 데이터 영구 저장

분리 시 마이그레이션 경로: `books.isbn` 기준으로 `external_works.id`로 backfill → `books.work_id` FK 추가 → `isbn` 컬럼은 한동안 유지(downtime 0). 가역적.

---

## 11. Open Questions (구현 시 해결)

1. **국립중앙도서관 SRU 표지 URL 호스트** — adapter 구현 첫 단계에서 실제 응답 확인 후 `next.config` allowlist 확정. 미스매치 시 표지 omit + dev 콘솔 경고.
2. **KDC/DDC → BOOK_GENRES 매핑 테이블** — adapter 구현 시 실제 응답 분포 본 후 결정. 매핑 안 되면 `genre` omit (사용자가 select 박스에서 직접 선택).
3. **TMDB poster size** — `w185`로 시작. 카드 vs 상세 페이지에서 다른 size 필요해지면 adapter에서 `w185`/`w342` 둘 다 반환 고려.
