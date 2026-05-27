# "모두의 서재" 공개 한줄평 피드 — Design Spec

- **Date:** 2026-05-27
- **Status:** Draft (awaiting user review)
- **Scope:** Books만. Writings는 이번 범위 밖.
- **Owner:** insam2802@gmail.com

## 1. 목표 & 비목표

### 목표

- 책 작성 폼에 옵셔널 "한줄평 (≤150자)" 입력과 "모두의 서재에 공개" 토글 추가.
- 신규 작성·기존 책 모두 **디폴트 공개 (`is_public = 1`)**. 사용자가 끄면 비공개.
- `isPublic=1`인 책은 한줄평 유무와 무관하게 메인 홈의 **"모두의 서재"** 섹션 + 신설 `/feed` 페이지에서 다른 로그인 사용자에게 노출.
- 공개되는 정보: **한줄평(있으면) · 별점 · 책 제목 · 저자 · 작성자 닉네임(`displayName`) · publishedAt**.
- 긴 독후감(`books.content`) · 태그(`book_tags`)는 어떤 경로로도 외부 노출되지 않음.
- 카드는 클릭 가능한 상세 페이지로 이동하지 않음 (non-clickable).

### 비목표

- 비로그인자 노출 — 세션 게이트 그대로 유지, `/feed`도 미들웨어가 차단.
- 좋아요·댓글·공유 등 상호작용.
- 태그·본문(content) 등 다른 메타의 공개.
- Writings(`/writings`)의 공개 피드 — 후속 범위.
- 어드민의 강제 숨김(moderation) — 후속 범위.
- 작성자 displayName 클릭 → 사용자별 공개 서재 페이지 — 후속 범위.

### 마이그레이션 사건 (운영 주의)

`is_public DEFAULT 1`이라 마이그레이션 시점에 **DB에 이미 들어있는 모든 책이 일제히 공개로 전환**됩니다. 노출 표면은 한줄평·별점·제목·저자에 한정되므로 본문 유출 위험은 없으나, "본인이 읽은 책 목록 자체가 다른 사용자에게 보인다"는 변화가 발생합니다.

- 배포 전 모든 사용자에게 사전 공지 권장.
- 배포 직후 본인 책장(`/books`)에서 카드별 공개 인디케이터로 즉시 비공개 전환이 가능하도록 UI 우선 반영.

## 2. Schema 변경

`src/lib/db/schema.ts`의 `books` 테이블에 3개 컬럼 + 1개 인덱스 추가:

```ts
oneLineReview: text('one_line_review'),                       // nullable, ≤150자, trimmed
isPublic: integer('is_public').notNull().default(1),          // 0|1
publishedAt: integer('published_at'),                         // nullable epoch (ms)

// 인덱스
publicPublishedIdx: index('idx_books_public_published').on(
  t.isPublic,
  sql`${t.publishedAt} DESC`,
),
```

### 마이그레이션 (`drizzle-kit generate` → review → push)

1. `ALTER TABLE books ADD COLUMN one_line_review TEXT` — 기존 행 NULL.
2. `ALTER TABLE books ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1` — 기존 행 1.
3. `ALTER TABLE books ADD COLUMN published_at INTEGER` — 기존 행 NULL.
4. **Backfill**: `UPDATE books SET published_at = updated_at WHERE published_at IS NULL` — 기존 책이 피드 쿼리(`publishedAt IS NOT NULL`)를 통과하도록.
5. `CREATE INDEX idx_books_public_published ON books (is_public, published_at DESC)`.

`writings` · `users` · 태그 테이블은 손대지 않음. 기존 invariant(authorUserId FK, slug retry, composite index) 그대로.

## 3. Validation

`src/lib/validations.ts`의 `bookSchema`에 두 필드 추가:

```ts
oneLineReview: z
  .string()
  .trim()
  .max(150, '한줄평은 150자 이내로 입력해주세요')
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null)),
isPublic: z.coerce.boolean().optional().default(true),
```

- 한줄평↔공개 토글 간 cross-field refine 없음 — 한줄평이 비어도 공개 OK.
- 빈 문자열·공백만은 `null`로 정규화 — DB에 빈 문자열과 NULL이 섞이는 사고 방지.
- 같은 스키마를 API 라우트(`POST /api/books`, `PATCH /api/books/[id]`)와 폼이 공유 — 라우트에서 zod chain을 새로 만들지 말 것 (기존 invariant).

## 4. Queries

`src/lib/db/queries.ts`에 2개 신규, 2개 수정.

### 신규: `listRecentPublicBooks`

**멀티테넌트 invariant의 유일한 예외** — `authorUserId` 필터 없는 유일한 read 경로. 코드 리뷰 시 이 함수와 `countPublicBooks` 두 개만 화이트리스트로 인식.

```ts
async function listRecentPublicBooks(
  db,
  opts: { limit: number; offset?: number },
): Promise<PublicBookCard[]> {
  // SELECT books.id, books.slug, books.title, books.author, books.genre,
  //        books.rating, books.one_line_review, books.published_at,
  //        users.display_name AS author_display_name
  // FROM books
  // INNER JOIN users ON books.author_user_id = users.id
  // WHERE books.is_public = 1 AND books.published_at IS NOT NULL
  // ORDER BY books.published_at DESC
  // LIMIT ? OFFSET ?
}
```

응답 타입:

```ts
type PublicBookCard = {
  id: number
  slug: string
  title: string
  author: string
  genre: string
  rating: number
  oneLineReview: string | null
  publishedAt: number
  authorDisplayName: string
}
// content, tags, authorUserId 등 다른 필드는 절대 노출 안 함
```

`users` 조인은 `displayName`만 select — `passwordHash` · `role` · `mustChangePassword` 등 민감 컬럼이 응답에 섞일 가능성 차단.

### 신규: `countPublicBooks`

```sql
SELECT COUNT(*) FROM books
WHERE is_public = 1 AND published_at IS NOT NULL
```

`/feed` 페이지네이션 total 계산용.

### 수정: `createBook`

신규 행 INSERT 시:

- `isPublic`이 `true`(디폴트) → `publishedAt = now()`로 같이 INSERT.
- `isPublic`이 `false` → `publishedAt = NULL`.
- 트랜잭션 내에서 책 row + 태그 처리 함께 (기존 invariant 유지).

### 수정: `updateBook`

트랜잭션 안에서 transition 판정:

```ts
const prev = await tx.select({ isPublic: books.isPublic, publishedAt: books.publishedAt })
  .from(books).where(eq(books.id, id)).get()

const transitionToPublic = prev.isPublic === 0 && next.isPublic === 1
const nextPublishedAt = transitionToPublic ? now() : prev.publishedAt
```

- `0 → 1`: `publishedAt = now()` (피드 상단으로 bubble).
- `1 → 0`: `publishedAt` 보존 (재공개 시 새 시각으로 갱신될 것).
- `1 → 1` (다른 필드만 변경): `publishedAt` 변경 안 함.
- `0 → 0`: 변경 없음.

## 5. Authorization

| 경로 | 가드 | 비고 |
|---|---|---|
| `GET /feed` (page) | `requireUser()` | 모든 로그인 사용자 OK |
| `GET /api/feed` | `requireUser()` | API도 세션 필수 |
| `POST /api/books` | `requireUser()` | 기존 그대로 |
| `PATCH /api/books/[id]` | `requireOwnBook(id)` | `isPublic` · `oneLineReview` 본인만 토글 |
| `/books/[slug]` (상세) | `requireOwnBookForPage(id)` | 기존 그대로 |
| 미들웨어 | CSRF + 세션 + mcp 게이트 | 기존 그대로 — `/feed`에도 적용 |

권한 모델 변경 없음. `requireOwnBook`이 다른 사용자 책의 isPublic 변경을 자동 차단.

## 6. Form (`src/components/BookForm.tsx`)

| 위치 | 변경 |
|---|---|
| 별점 입력 아래 | "한줄평 (선택)" 텍스트필드 + 150자 카운터. 80자 넘으면 카운터 시각 강조. |
| 한줄평 아래 | **토글 스위치** "모두의 서재에 공개". 좌측에 라벨·보조 텍스트("이 책의 한줄평·별점·제목·저자를 모두의 서재에서 다른 사람도 볼 수 있어요"), 우측에 토글. |
| 폼 mode = 신규 작성 | `isPublic` 초기값 `true` (토글 켜진 상태) |
| 폼 mode = 편집 | `isPublic` 초기값 = `book.isPublic` (DB 현재값) |

### 토글 컴포넌트

- 구현 패턴은 기존 `src/components/ThemeToggle.tsx` 참고.
- 접근성: `role="switch"` + `aria-checked` + 키보드 Space/Enter 토글.
- 폼 안의 toggle 상태는 `useState`로 관리, submit 시 boolean으로 `isPublic` 필드에 들어감 (zod `z.coerce.boolean()`이 받음).

기존 폼 인프라(더블 제출 가드, CSRF, XSS 방어, slug 재시도) 그대로 유지.

## 7. UI / Pages

### 홈 (`src/app/page.tsx`)

기존 "최근 읽은 책" 섹션을 **"모두의 서재"** 로 교체. 레이아웃 순서:

1. 인사 (`{me.displayName}님의 서재`) — 그대로
2. 책장·글방 엔트리 카드 — 그대로
3. **모두의 서재** (신규, `listRecentPublicBooks(limit: 6)`) — "전체 보기 →" `/feed`
4. 최근 쓴 글 (내 글) — 그대로

```ts
const [stats, recentPublicBooks, recentWritings] = await Promise.all([
  getUserStats(db, me.id, thisYear),
  listRecentPublicBooks(db, { limit: 6 }),
  listWritings(db, me.id, { limit: 6 }),
])
```

빈 상태(공개된 책이 0개):

- 아이콘 + "아직 공개된 책이 없어요" + 보조 텍스트 "내 책을 공개하면 모두의 서재에 올라와요" + CTA "내 책장으로 가기" → `/books`.

### 신규 `src/components/PublicReviewCard.tsx`

```
┌─────────────────────────────────┐
│ ★★★★☆        [장르 배지]        │
│                                 │
│ "한줄평 본문이 있으면 여기..."   │  ← 있을 때만 1~3줄
│                                 │
│ 책 제목                          │
│ 저자                             │
│ ─                               │
│ 닉네임 · 3일 전                  │
└─────────────────────────────────┘
```

- non-clickable: `<article>`/`<div>` 사용, `<a>` · `onClick` 없음.
- hover 시 `shadow-[var(--shadow-toss-hover)]` lift만 — 시각적 흥미.
- 한줄평 없으면 그 영역 비고 책 정보로 카드 채움. 카드 높이는 살짝 줄어도 grid가 균형 유지.
- 한줄평 텍스트는 React 자동 escape — 마크다운 렌더 안 함, `dangerouslySetInnerHTML` 절대 안 씀.
- publishedAt → `LocalDate` 또는 relative time util("3일 전") — 기존 `LocalDate.tsx` 컨벤션과 일치.

### 신규 `src/app/feed/page.tsx`

```ts
export default async function FeedPage({ searchParams }) {
  await requireUser()
  const { page, limit } = paginationSchema.parse(searchParams)
  const [items, total] = await Promise.all([
    listRecentPublicBooks(db, { limit, offset: (page - 1) * limit }),
    countPublicBooks(db),
  ])
  return (
    <>
      <h1>모두의 서재</h1>
      <div className="grid ...">{items.map((b) => <PublicReviewCard ... />)}</div>
      <Pagination total={total} page={page} limit={limit} basePath="/feed" />
    </>
  )
}
```

- 기존 `Pagination.tsx` · `paginationSchema` 재사용.
- 빈 상태는 홈과 동일 카피.

### 본인 책장 (`/books`) — `BookCard.tsx` 변경

- 카드 우상단 또는 메타 줄에 작은 인디케이터:
  - `isPublic=1` → `🌐 공개` (또는 텍스트 `· 공개`)
  - `isPublic=0` → 표시 없음 (시각 노이즈 최소화)
- 한줄평이 있으면 카드 하단에 1줄 요약 표시.

### 본인 책 상세 (`/books/[slug]`)

- 별점·메타 줄 옆에 공개 상태 인디케이터.
- 한줄평이 있으면 본문 상단의 큰 인용 박스로 노출 — 본인 요약 가치.
- 토글 변경은 "수정" 페이지의 폼에서 — 상세에서 인라인 토글은 이번 범위 밖.

### 비로그인 랜딩 (`page.tsx`의 `!me` branch)

변경 없음. "로그인" CTA만. 비로그인 노출 절대 없음.

## 8. Tests

### Unit (`tests/unit/`)

- `validations.test.ts` 확장:
  - `oneLineReview` 150자 초과 → 에러.
  - 빈 문자열·공백만 → `null`로 transform.
  - `isPublic` coerce: `"true"`/`true`/미지정 → `true`; `"false"`/`false` → `false`.
- `PublicReviewCard.test.tsx` 신규:
  - 한줄평 있을 때 본문 렌더.
  - 한줄평 없을 때 책 정보만 렌더.
  - 별점·displayName·publishedAt 표시.
  - `<a>` · `onClick` 없음 (non-clickable 보장).

### Integration (`tests/integration/`, 실제 in-memory libSQL)

`public-feed.test.ts` (신규):

- 두 user + 다양한 상태(공개+한줄평 / 공개 한줄평 없음 / 비공개) 시드.
- `listRecentPublicBooks`:
  - `isPublic=1` AND `publishedAt IS NOT NULL` 만 반환.
  - `publishedAt DESC` 정렬.
  - 다른 user 책 포함 (멀티테넌트 예외 가드).
  - `content` · `tags` · `authorUserId` 등 민감 필드가 응답 객체에 **없음** (`Object.keys` 검증).
- `countPublicBooks`: 같은 조건.
- `createBook`:
  - isPublic=true(디폴트) → `publishedAt` 채워지고 피드에 등장.
  - isPublic=false → `publishedAt` NULL + 피드에 없음.
- `updateBook` transition:
  - `0 → 1`: `publishedAt = now()`.
  - `1 → 0`: `publishedAt` 보존.
  - `1 → 1` (다른 필드만): `publishedAt` 변경 안 됨.
  - `0 → 1 → 0 → 1` 시퀀스: 마지막 `0 → 1` 시점으로 갱신.
- 멀티테넌트 회귀: user A가 PATCH로 user B 책의 `isPublic`을 못 바꿈 (`requireOwnBook` 403).

`books-scoping.test.ts` 확장: 새 컬럼 추가가 본인 리스트·CRUD에 영향 없음 가드.

### E2E (`tests/e2e/`, Playwright)

`public-feed.spec.ts` (신규):

- user A 로그인 → 책 작성 (한줄평 + 디폴트 공개 on) → `/feed`에서 보임.
- user B 로그인 → `/feed`에서 A의 책 카드 확인. 한줄평·★·제목·저자·A의 displayName 노출, `content` 텍스트는 DOM에 없음.
- user A 책 수정 → 공개 토글 off → `/feed` 새로고침 → A의 책 사라짐.
- 비로그인 상태로 `/feed` 직접 접근 → `/login` 리다이렉트 (미들웨어 세션 게이트).
- 한줄평에 `<script>alert(1)</script>` 입력 + 공개 → `/feed`에 escape된 리터럴 텍스트로 표시 (XSS 회귀 가드).

## 9. Out of Scope (후속)

- 한줄평 좋아요·이모지·댓글.
- 어드민 강제 숨김 (moderation).
- Writings의 공개 피드.
- 작성자 닉네임 클릭 → 해당 사용자의 공개 서재 페이지.
- 비로그인 노출.

## 10. Open Decisions

- 마이그레이션 사전 공지의 운영 절차 — 사용자가 결정.
- BookCard 공개 인디케이터의 정확한 모양 (이모지 vs 텍스트 배지) — 구현 단계에서 톤 확인.
- 한줄평 카운터의 시각 강조 임계값 (현재 80자 제안) — 구현 단계 미세 조정.
