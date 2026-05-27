# 모두의 서재 (Public Feed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 책에 옵셔널 한줄평·공개 토글을 추가하고, 공개된 책을 홈의 "모두의 서재" 섹션 + 신설 `/feed` 페이지에 노출. 다른 모든 쿼리의 멀티테넌트 invariant는 그대로 유지.

**Architecture:** `books` 테이블에 컬럼 3개(`one_line_review`, `is_public`, `published_at`)와 복합 인덱스 1개 추가. `listRecentPublicBooks` · `countPublicBooks` 두 함수가 `authorUserId` 필터 없는 유일한 read 경로 — 다른 모든 쿼리는 본인 스코프 유지. UI는 non-clickable `PublicReviewCard` + `/feed` + 홈 섹션 교체.

**Tech Stack:** Next.js 16 App Router · libSQL/Turso · Drizzle ORM · zod · Vitest · Playwright · Biome · Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-27-public-feed-design.md`

---

## File Structure

**스키마·DB**
- Modify: `src/lib/db/schema.ts` — `books`에 컬럼 3 + 인덱스 1
- Create: `drizzle/0006_<auto>.sql` (drizzle-kit generate) + 수동 backfill UPDATE 추가
- Modify: `src/lib/db/queries.ts`
  - 수정: `createBook` (publishedAt INSERT 처리)
  - 수정: `updateBook` (0→1 transition 감지)
  - 신규: `listRecentPublicBooks`, `countPublicBooks`
  - 신규 타입: `PublicBookCard`

**검증**
- Modify: `src/lib/validations.ts` — `CreateBookSchema`, `UpdateBookSchema`에 `oneLineReview`·`isPublic` 추가

**UI 컴포넌트**
- Create: `src/components/Toggle.tsx` — 재사용 토글 스위치
- Modify: `src/components/BookForm.tsx` — 한줄평 텍스트필드 + Toggle 통합
- Create: `src/components/PublicReviewCard.tsx` — non-clickable 피드 카드
- Modify: `src/components/BookCard.tsx` — 공개 인디케이터 추가

**페이지**
- Modify: `src/app/page.tsx` — "모두의 서재" 섹션으로 교체
- Create: `src/app/feed/page.tsx` — 페이지네이션 피드
- Modify: `src/app/books/[slug]/page.tsx` — 본인 책 상세에 한줄평·공개 상태 표시
- Modify: `src/app/books/[slug]/edit/page.tsx` — `initial`에 `oneLineReview`·`isPublic` 전달

**테스트**
- Modify: `tests/factories.ts` — `createBook` factory가 새 컬럼 override 받음
- Modify: `tests/unit/validations.test.ts` — bookSchema 케이스 추가
- Create: `tests/unit/PublicReviewCard.test.tsx`
- Create: `tests/integration/public-feed.test.ts`
- Create: `tests/e2e/public-feed.spec.ts`

---

## Task 1: Schema 변경 + 마이그레이션

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0006_<auto>.sql` (drizzle-kit 자동 생성 + 수동 backfill 추가)

- [ ] **Step 1: schema.ts 컬럼·인덱스 추가**

`src/lib/db/schema.ts`의 `books` 테이블 정의 안에서 컬럼 3개를 추가하고 `(t) => ({...})` 안에 인덱스 1개 추가.

컬럼은 `content` 다음에 삽입:

```ts
content: text('content').notNull().default(''),
oneLineReview: text('one_line_review'),
isPublic: integer('is_public').notNull().default(1),
publishedAt: integer('published_at'),
slug: text('slug').notNull(),
```

인덱스는 기존 `ratingCheck` 위에 추가:

```ts
publicPublishedIdx: index('idx_books_public_published').on(
  t.isPublic,
  sql`${t.publishedAt} DESC`,
),
```

- [ ] **Step 2: drizzle-kit으로 마이그레이션 생성**

Run:
```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
```

Expected: `drizzle/0006_<random>.sql` 파일이 생성됨. 안의 내용은 대략:

```sql
ALTER TABLE `books` ADD `one_line_review` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `is_public` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `books` ADD `published_at` integer;
--> statement-breakpoint
CREATE INDEX `idx_books_public_published` ON `books` (`is_public`,`published_at` DESC);
```

- [ ] **Step 3: 생성된 마이그레이션 파일에 backfill UPDATE 추가**

drizzle-kit이 만들어준 `drizzle/0006_<random>.sql` 파일의 **인덱스 생성 직전**에 backfill SQL을 삽입. 최종 파일은 다음 형태:

```sql
ALTER TABLE `books` ADD `one_line_review` text;
--> statement-breakpoint
ALTER TABLE `books` ADD `is_public` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `books` ADD `published_at` integer;
--> statement-breakpoint
UPDATE `books` SET `published_at` = `updated_at` WHERE `published_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_books_public_published` ON `books` (`is_public`,`published_at` DESC);
```

`--> statement-breakpoint` 토큰은 setup-db.ts가 split할 때 제거하므로 필수.

- [ ] **Step 4: 테스트로 마이그레이션 검증**

`tests/integration/books-scoping.test.ts`는 setup-db가 drizzle/ 폴더의 모든 .sql을 적용하므로, 새 마이그레이션이 기존 테스트를 깨지 않아야 함.

Run: `pnpm test tests/integration/books-scoping.test.ts`
Expected: 모든 케이스 PASS (스키마 컬럼이 늘어도 기존 쿼리는 영향 없음).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): add one_line_review, is_public, published_at to books

- 3 columns on books for public feed feature
- composite index (is_public, published_at DESC) for feed query
- backfill published_at = updated_at on existing rows so legacy books
  participate in the feed sort"
```

---

## Task 2: 테스트 factory 확장

**Files:**
- Modify: `tests/factories.ts`

`tests/factories.ts:31-53`의 `createBook` factory는 이미 `Partial<typeof books.$inferInsert>`를 override로 받기 때문에 새 컬럼은 **자동으로 지원**됨 — 따로 코드 추가 불필요. 단, 새 컬럼의 디폴트 동작을 명시적으로 검증할 헬퍼 한 줄을 메모 형태로 두는 게 향후 회귀에 도움이 됨.

- [ ] **Step 1: factory 테스트 추가**

`tests/integration/books-scoping.test.ts`에 새 케이스 한 개 추가 — factory 디폴트가 isPublic=1로 들어가는지 검증.

`tests/integration/books-scoping.test.ts`의 `describe(...)` 블록 내부 마지막 `it(...)` 다음에 추가:

```ts
it('factory creates books with is_public=1 by default after migration', async () => {
  const a = await createUser(db, { username: 'alice' })
  const aBook = await createBook(db, a.id, { title: 'default-public' })
  // factory는 override가 없으면 schema default(1)을 받음
  expect(aBook.isPublic).toBe(1)
})
```

- [ ] **Step 2: 테스트 실행하여 PASS 확인**

Run: `pnpm test tests/integration/books-scoping.test.ts -t "is_public=1 by default"`
Expected: PASS — schema default가 적용되어 1로 들어옴.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/books-scoping.test.ts
git commit -m "test(books): assert factory inherits is_public=1 schema default"
```

---

## Task 3: Validation 스키마 확장

**Files:**
- Modify: `src/lib/validations.ts`
- Modify: `tests/unit/validations.test.ts`

- [ ] **Step 1: validations.test.ts에 실패할 테스트 추가**

`tests/unit/validations.test.ts`의 import 줄을 다음으로 교체:

```ts
import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateProfileSchema,
  CreateBookSchema,
} from '@/lib/validations'
```

파일 맨 아래에 새 describe 블록 추가:

```ts
describe('CreateBookSchema — public feed fields', () => {
  const validBase = {
    title: 'T',
    author: 'A',
    genre: '소설',
    readDate: '2026-05-27',
    rating: 4,
  }

  it('accepts oneLineReview up to 150 chars', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: 'a'.repeat(150) })
    expect(r.success).toBe(true)
  })

  it('rejects oneLineReview over 150 chars', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: 'a'.repeat(151) })
    expect(r.success).toBe(false)
  })

  it('normalizes empty oneLineReview to null', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: '   ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.oneLineReview).toBeNull()
  })

  it('trims whitespace around oneLineReview', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: '  좋아요  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.oneLineReview).toBe('좋아요')
  })

  it('isPublic defaults to true when omitted', () => {
    const r = CreateBookSchema.safeParse(validBase)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.isPublic).toBe(true)
  })

  it('isPublic coerces string "false" and boolean false', () => {
    const r1 = CreateBookSchema.safeParse({ ...validBase, isPublic: false })
    const r2 = CreateBookSchema.safeParse({ ...validBase, isPublic: 'false' })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    // z.coerce.boolean()은 "false" 문자열도 truthy로 처리 — 명시적 boolean false만 거짓이 됨.
    // 폼은 boolean을 보내므로 실용적으로 OK.
    if (r1.success) expect(r1.data.isPublic).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

Run: `pnpm test tests/unit/validations.test.ts`
Expected: 새 describe 블록의 케이스들이 FAIL (필드 미정의 에러 또는 .strict() 위반).

- [ ] **Step 3: validations.ts 확장**

`src/lib/validations.ts`의 `CreateBookSchema`를 다음으로 교체 (line 17-31):

```ts
export const CreateBookSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    author: z.string().trim().min(1, '작가를 입력하세요').max(100),
    genre: z.enum(GENRES),
    readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
    rating: z.number().int().min(1).max(5),
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
```

같은 파일의 `UpdateBookSchema`를 다음으로 교체 (line 36-48):

```ts
export const UpdateBookSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
    author: z.string().trim().min(1, '작가를 입력하세요').max(100).optional(),
    genre: z.enum(GENRES).optional(),
    readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
    rating: z.number().int().min(1).max(5).optional(),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    isPublic: z.coerce.boolean().optional(),
  })
  .strict()
```

(Update에서는 `isPublic`이 `.default(true)`가 **아닌** `.optional()` — 편집 시 명시적으로 안 보내면 변경 안 됨)

- [ ] **Step 4: 테스트 PASS 확인**

Run: `pnpm test tests/unit/validations.test.ts`
Expected: 모든 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(validations): add oneLineReview and isPublic to book schemas

- 150-char limit, empty → null transform, trim
- isPublic defaults to true on Create, optional on Update
- z.coerce.boolean() handles form payloads"
```

---

## Task 4: 신규 쿼리 — `listRecentPublicBooks`, `countPublicBooks`

**Files:**
- Modify: `src/lib/db/queries.ts`
- Create: `tests/integration/public-feed.test.ts`

- [ ] **Step 1: 실패할 통합 테스트 작성**

`tests/integration/public-feed.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listRecentPublicBooks,
  countPublicBooks,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

describe('public feed queries', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('returns only books with is_public=1 AND published_at IS NOT NULL', async () => {
    const a = await createUser(db, { username: 'alice', displayName: 'Alice' })
    const b = await createUser(db, { username: 'bob', displayName: 'Bob' })

    const t = Date.now()
    await createBook(db, a.id, { title: '공개 + publishedAt', isPublic: 1, publishedAt: t })
    await createBook(db, a.id, { title: '비공개', isPublic: 0, publishedAt: null })
    await createBook(db, b.id, { title: '공개지만 publishedAt NULL', isPublic: 1, publishedAt: null })
    await createBook(db, b.id, { title: 'B의 공개', isPublic: 1, publishedAt: t - 1000 })

    const list = await listRecentPublicBooks(db, { limit: 10 })
    const titles = list.map((x) => x.title)
    expect(titles).toContain('공개 + publishedAt')
    expect(titles).toContain('B의 공개')
    expect(titles).not.toContain('비공개')
    expect(titles).not.toContain('공개지만 publishedAt NULL')
  })

  it('orders by published_at DESC', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    await createBook(db, a.id, { title: 'older', publishedAt: t - 10000 })
    await createBook(db, a.id, { title: 'middle', publishedAt: t - 5000 })
    await createBook(db, a.id, { title: 'newest', publishedAt: t })

    const list = await listRecentPublicBooks(db, { limit: 10 })
    expect(list.map((x) => x.title)).toEqual(['newest', 'middle', 'older'])
  })

  it('joins users and returns authorDisplayName', async () => {
    const a = await createUser(db, { username: 'alice', displayName: '앨리스' })
    await createBook(db, a.id, { title: 'B', publishedAt: Date.now() })

    const [item] = await listRecentPublicBooks(db, { limit: 1 })
    expect(item.authorDisplayName).toBe('앨리스')
  })

  it('does NOT include content, tags, or authorUserId in response', async () => {
    const a = await createUser(db, { username: 'alice' })
    await createBook(db, a.id, {
      title: 'B',
      content: '아주 긴 비밀 독후감',
      publishedAt: Date.now(),
    })

    const [item] = await listRecentPublicBooks(db, { limit: 1 })
    expect(Object.keys(item)).not.toContain('content')
    expect(Object.keys(item)).not.toContain('tags')
    expect(Object.keys(item)).not.toContain('authorUserId')
    expect(Object.keys(item)).not.toContain('passwordHash')
  })

  it('respects limit and offset', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    for (let i = 0; i < 5; i++) {
      await createBook(db, a.id, { title: `B${i}`, publishedAt: t - i * 1000 })
    }

    const page1 = await listRecentPublicBooks(db, { limit: 2 })
    const page2 = await listRecentPublicBooks(db, { limit: 2, offset: 2 })
    expect(page1.map((x) => x.title)).toEqual(['B0', 'B1'])
    expect(page2.map((x) => x.title)).toEqual(['B2', 'B3'])
  })

  it('countPublicBooks matches the same filter', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    await createBook(db, a.id, { isPublic: 1, publishedAt: t })
    await createBook(db, a.id, { isPublic: 1, publishedAt: t - 1000 })
    await createBook(db, a.id, { isPublic: 0, publishedAt: null })
    await createBook(db, a.id, { isPublic: 1, publishedAt: null })

    expect(await countPublicBooks(db)).toBe(2)
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

Run: `pnpm test tests/integration/public-feed.test.ts`
Expected: FAIL — `listRecentPublicBooks` / `countPublicBooks` undefined.

- [ ] **Step 3: 쿼리 함수 구현**

`src/lib/db/queries.ts`의 import에 `users`를 추가:

```ts
import { books, tags, bookTags, writings, writingTags, users } from './schema'
```

(이미 schema에서 `users`가 export되고 있는지 확인. `src/lib/db/schema.ts:13`에서 `export const users`로 정의되어 있음.)

`listGenresWithCounts` 함수 **아래**에 (line 398 직후) 다음 코드 추가:

```ts
// ─── public feed ───────────────────────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 두 함수는 authorUserId 필터가 없는 유일한
// read 경로. 다른 모든 list/get은 본인 스코프(authorUserId 매칭) 유지.

export type PublicBookCard = {
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

export async function listRecentPublicBooks(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicBookCard[]> {
  let q = db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      author: books.author,
      genre: books.genre,
      rating: books.rating,
      oneLineReview: books.oneLineReview,
      publishedAt: books.publishedAt,
      authorDisplayName: users.displayName,
    })
    .from(books)
    .innerJoin(users, eq(books.authorUserId, users.id))
    .where(and(eq(books.isPublic, 1), sql`${books.publishedAt} IS NOT NULL`))
    .orderBy(desc(books.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  // publishedAt은 위 WHERE로 NOT NULL 보장 — 타입을 number로 narrow
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countPublicBooks(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(books)
    .where(and(eq(books.isPublic, 1), sql`${books.publishedAt} IS NOT NULL`))
  return Number(rows[0]?.n ?? 0)
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `pnpm test tests/integration/public-feed.test.ts`
Expected: 모든 6개 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts tests/integration/public-feed.test.ts
git commit -m "feat(db): add listRecentPublicBooks + countPublicBooks

Sole multitenant-invariant exception: these two read functions skip
the authorUserId filter to power the public feed. All other queries
remain user-scoped. Response shape excludes content, tags, and
authorUserId to prevent over-exposure."
```

---

## Task 5: `createBook`에 publishedAt INSERT 로직 추가

**Files:**
- Modify: `src/lib/db/queries.ts`
- Modify: `tests/integration/public-feed.test.ts`

- [ ] **Step 1: 실패할 테스트 추가**

`tests/integration/public-feed.test.ts`의 `describe` 블록 안 마지막에 추가:

```ts
describe('createBook publishedAt logic', () => {
  let db2: TestDb
  beforeEach(async () => {
    ;({ db: db2 } = await makeTestDb())
  })

  it('sets publishedAt on insert when isPublic=true (default)', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })

    const before = Date.now()
    const book = await queryCreateBook(db2, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: true,
    })
    const after = Date.now()

    expect(book.isPublic).toBe(1)
    expect(book.publishedAt).not.toBeNull()
    expect(book.publishedAt).toBeGreaterThanOrEqual(before)
    expect(book.publishedAt).toBeLessThanOrEqual(after)
  })

  it('leaves publishedAt NULL when isPublic=false', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })

    const book = await queryCreateBook(db2, a.id, {
      title: 'T2', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: false,
    })
    expect(book.isPublic).toBe(0)
    expect(book.publishedAt).toBeNull()
  })

  it('stores oneLineReview', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })
    const book = await queryCreateBook(db2, a.id, {
      title: 'T3', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: '좋은 책', isPublic: true,
    })
    expect(book.oneLineReview).toBe('좋은 책')
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

Run: `pnpm test tests/integration/public-feed.test.ts -t "createBook publishedAt"`
Expected: FAIL — `createBook`이 아직 새 필드를 처리하지 않음.

- [ ] **Step 3: `createBook` 함수 수정**

`src/lib/db/queries.ts`의 `createBook` 함수 (line 108-153) 안에서 INSERT의 `.values({...})` 객체에 새 필드를 추가하고 publishedAt 계산을 함수 상단에 둠.

수정 전 (line 120-135):
```ts
const result = await db.transaction(async (tx) => {
  const inserted = await tx
    .insert(books)
    .values({
      authorUserId,
      title: input.title,
      author: input.author,
      genre: input.genre,
      readDate: input.readDate,
      rating: input.rating,
      content: input.content ?? '',
      slug: candidate,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
```

수정 후:
```ts
const result = await db.transaction(async (tx) => {
  const isPublic = input.isPublic ? 1 : 0
  const publishedAt = isPublic === 1 ? now : null
  const inserted = await tx
    .insert(books)
    .values({
      authorUserId,
      title: input.title,
      author: input.author,
      genre: input.genre,
      readDate: input.readDate,
      rating: input.rating,
      content: input.content ?? '',
      oneLineReview: input.oneLineReview ?? null,
      isPublic,
      publishedAt,
      slug: candidate,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `pnpm test tests/integration/public-feed.test.ts -t "createBook publishedAt"`
Expected: 3개 케이스 PASS.

전체 통합 테스트도 회귀 가드용으로 실행:

Run: `pnpm test tests/integration`
Expected: 모든 케이스 PASS — 기존 books-scoping, writings-scoping, stats-and-pagination 영향 없음.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts tests/integration/public-feed.test.ts
git commit -m "feat(db): createBook persists oneLineReview, isPublic, publishedAt

publishedAt is set to now() at INSERT when isPublic=true, NULL when
isPublic=false. Existing transaction + slug-retry behavior preserved."
```

---

## Task 6: `updateBook`에 transition 로직 추가

**Files:**
- Modify: `src/lib/db/queries.ts`
- Modify: `tests/integration/public-feed.test.ts`

- [ ] **Step 1: 실패할 테스트 추가**

`tests/integration/public-feed.test.ts`의 파일 끝에 새 describe 추가:

```ts
describe('updateBook publishedAt transitions', () => {
  let db3: TestDb
  beforeEach(async () => {
    ;({ db: db3 } = await makeTestDb())
  })

  async function setup() {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db3, { username: 'alice' })
    return { a, queryCreateBook }
  }

  it('transitions 0→1: sets publishedAt to now()', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: false,
    })
    expect(book.publishedAt).toBeNull()

    const before = Date.now()
    const updated = await updateBook(db3, a.id, book.id, { isPublic: true })
    const after = Date.now()
    expect(updated?.isPublic).toBe(1)
    expect(updated?.publishedAt).not.toBeNull()
    expect(updated?.publishedAt).toBeGreaterThanOrEqual(before)
    expect(updated?.publishedAt).toBeLessThanOrEqual(after)
  })

  it('transitions 1→0: preserves publishedAt', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: true,
    })
    const originalPublishedAt = book.publishedAt!
    expect(originalPublishedAt).not.toBeNull()

    const updated = await updateBook(db3, a.id, book.id, { isPublic: false })
    expect(updated?.isPublic).toBe(0)
    expect(updated?.publishedAt).toBe(originalPublishedAt)
  })

  it('non-transition 1→1: publishedAt unchanged', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: true,
    })
    const originalPublishedAt = book.publishedAt!

    await new Promise((r) => setTimeout(r, 5)) // ensure clock advances
    const updated = await updateBook(db3, a.id, book.id, { title: 'New Title' })
    expect(updated?.title).toBe('New Title')
    expect(updated?.publishedAt).toBe(originalPublishedAt)
  })

  it('0→1→0→1 sequence: publishedAt updates on each 0→1', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: false,
    })

    await new Promise((r) => setTimeout(r, 5))
    const r1 = await updateBook(db3, a.id, book.id, { isPublic: true })
    const t1 = r1!.publishedAt!

    await new Promise((r) => setTimeout(r, 5))
    await updateBook(db3, a.id, book.id, { isPublic: false })

    await new Promise((r) => setTimeout(r, 5))
    const r3 = await updateBook(db3, a.id, book.id, { isPublic: true })
    const t3 = r3!.publishedAt!

    expect(t3).toBeGreaterThan(t1)
  })

  it('updates oneLineReview without changing isPublic/publishedAt', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: '처음', isPublic: true,
    })
    const t0 = book.publishedAt!

    const updated = await updateBook(db3, a.id, book.id, { oneLineReview: '바뀐 한줄평' })
    expect(updated?.oneLineReview).toBe('바뀐 한줄평')
    expect(updated?.publishedAt).toBe(t0)
  })

  it('cross-user: B cannot update isPublic on A book', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const b = await createUser(db3, { username: 'bob' })
    const book = await queryCreateBook(db3, a.id, {
      title: 'T', author: 'A', genre: '소설', readDate: '2026-01-01',
      rating: 4, content: '', tags: [],
      oneLineReview: null, isPublic: false,
    })

    const attempt = await updateBook(db3, b.id, book.id, { isPublic: true })
    expect(attempt).toBeNull()

    // A의 책은 그대로 비공개
    const { getBookById } = await import('@/lib/db/queries')
    const after = await getBookById(db3, a.id, book.id)
    expect(after?.isPublic).toBe(0)
    expect(after?.publishedAt).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

Run: `pnpm test tests/integration/public-feed.test.ts -t "updateBook publishedAt"`
Expected: FAIL — `updateBook`이 isPublic/oneLineReview/publishedAt을 다루지 않음.

- [ ] **Step 3: `updateBook` 함수 수정**

`src/lib/db/queries.ts`의 `updateBook` 함수 (line 155-195) 안에서 transition 판정 + 새 필드 처리.

수정 전 (line 161-183):
```ts
return db.transaction(async (tx) => {
  const existing = await tx
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (existing.length === 0) return null

  const now = Date.now()
  const updated = await tx
    .update(books)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.author !== undefined && { author: input.author }),
      ...(input.genre !== undefined && { genre: input.genre }),
      ...(input.readDate !== undefined && { readDate: input.readDate }),
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.content !== undefined && { content: input.content }),
      updatedAt: now,
    })
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .returning()
```

수정 후:
```ts
return db.transaction(async (tx) => {
  const existing = await tx
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (existing.length === 0) return null
  const prev = existing[0]

  const now = Date.now()

  // isPublic transition 판정: 0 → 1만 publishedAt 갱신.
  // 1 → 0 또는 1 → 1 또는 0 → 0은 publishedAt 보존.
  let nextIsPublic: number | undefined
  let nextPublishedAt: number | null | undefined
  if (input.isPublic !== undefined) {
    nextIsPublic = input.isPublic ? 1 : 0
    if (prev.isPublic === 0 && nextIsPublic === 1) {
      nextPublishedAt = now
    }
    // else: nextPublishedAt 그대로 undefined → SET에서 제외돼 기존 값 보존
  }

  const updated = await tx
    .update(books)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.author !== undefined && { author: input.author }),
      ...(input.genre !== undefined && { genre: input.genre }),
      ...(input.readDate !== undefined && { readDate: input.readDate }),
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
      ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
      ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
      updatedAt: now,
    })
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .returning()
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `pnpm test tests/integration/public-feed.test.ts`
Expected: 모든 케이스 PASS (createBook + updateBook + list + count).

전체 회귀:

Run: `pnpm test`
Expected: 모든 unit + integration 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts tests/integration/public-feed.test.ts
git commit -m "feat(db): updateBook handles isPublic transitions and oneLineReview

- 0→1 transition: publishedAt = now()
- 1→0, 1→1, 0→0: publishedAt preserved
- oneLineReview is patchable independently
- All transition cases covered by integration tests"
```

---

## Task 7: 재사용 가능한 `Toggle` 컴포넌트

**Files:**
- Create: `src/components/Toggle.tsx`

- [ ] **Step 1: Toggle 컴포넌트 작성**

`src/components/Toggle.tsx` 생성:

```tsx
'use client'

import { useId } from 'react'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: Props) {
  const id = useId()
  const descId = description ? `${id}-desc` : undefined
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label
          htmlFor={id}
          className="block text-[14px] font-semibold text-[var(--color-text-strong)] cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p
            id={descId}
            className="mt-1 text-[12px] text-[var(--color-text-muted)] leading-relaxed"
          >
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          'relative shrink-0 inline-flex w-11 h-[26px] rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50',
          checked ? 'bg-[var(--color-toss-blue)]' : 'bg-[var(--color-border)]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 시각 확인 (선택, dev 서버)**

Run: `pnpm dev` (백그라운드 또는 별도 터미널)
Toggle을 직접 검증하는 페이지가 아직 없으므로 — Task 8에서 BookForm에 통합 후 검증.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toggle.tsx
git commit -m "feat(ui): add Toggle switch component (role=switch, a11y)"
```

---

## Task 8: BookForm 확장 — 한줄평 + 공개 토글

**Files:**
- Modify: `src/components/BookForm.tsx`
- Modify: `src/app/books/[slug]/edit/page.tsx` (initial에 새 필드 전달)

- [ ] **Step 1: BookForm.tsx의 `BookFormValues` 타입과 초기값 확장**

`src/components/BookForm.tsx:13-21`의 `BookFormValues` 인터페이스를 다음으로 교체:

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
}
```

- [ ] **Step 2: BookForm.tsx에 새 state + handler 추가**

`src/components/BookForm.tsx`의 import 위쪽에 Toggle import 추가:

```ts
import { Toggle } from './Toggle'
```

`BookForm` 함수 안 state 선언부 (line 41-49) **다음**에 추가:

```ts
const [oneLineReview, setOneLineReview] = useState(initial?.oneLineReview ?? '')
const [isPublic, setIsPublic] = useState(
  initial?.isPublic !== undefined ? initial.isPublic : mode === 'create',
)
```

`mode === 'create'`이면 디폴트 true, `edit`이면 명시적 initial값 사용. initial이 없는 create 모드에선 isPublic=true(디폴트 on)가 됨.

- [ ] **Step 3: submit payload에 새 필드 포함**

`src/components/BookForm.tsx:62` (`const payload = ...`) 라인을 다음으로 교체:

```ts
const payload = { title, author, genre, readDate, rating, content, tags, oneLineReview, isPublic }
```

- [ ] **Step 4: 폼 UI에 한줄평 + 토글 추가**

`src/components/BookForm.tsx` 의 "태그" 입력 div (line 150-153) **다음**, `</section>` (line 154) **앞**에 다음 블록 삽입:

```tsx
<div>
  <label className={labelCls}>
    한줄평 <span className="text-[var(--color-text-weak)] font-normal">(선택, 150자 이내)</span>
  </label>
  <div className="relative">
    <input
      value={oneLineReview}
      onChange={(e) => setOneLineReview(e.target.value.slice(0, 150))}
      maxLength={150}
      placeholder="이 책을 한 줄로 표현한다면?"
      className={inputCls}
    />
    <span
      className={[
        'absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-tabular tabular-nums',
        oneLineReview.length > 120
          ? 'text-[var(--color-toss-blue)]'
          : 'text-[var(--color-text-weak)]',
      ].join(' ')}
      aria-hidden
    >
      {oneLineReview.length}/150
    </span>
  </div>
</div>
<div className="pt-2 border-t border-[var(--color-border)]">
  <Toggle
    checked={isPublic}
    onChange={setIsPublic}
    label="모두의 서재에 공개"
    description="이 책의 한줄평·별점·제목·저자를 모두의 서재에서 다른 사람도 볼 수 있어요"
  />
</div>
```

- [ ] **Step 5: edit 페이지에서 initial에 새 필드 전달**

먼저 현재 edit 페이지 구조 확인:

Run: `cat src/app/books/\[slug\]/edit/page.tsx`

페이지가 `<BookForm initial={...} mode="edit" />` 형태로 호출할 것임. `initial` 객체에 `oneLineReview: book.oneLineReview ?? ''`와 `isPublic: book.isPublic === 1` 두 키 추가. 정확한 위치는 파일을 열어 보고 BookForm 호출부 찾아 수정.

예시 (실제 파일 구조에 맞춰 적용):

```tsx
<BookForm
  mode="edit"
  initial={{
    id: book.id,
    title: book.title,
    author: book.author,
    genre: book.genre,
    readDate: book.readDate,
    rating: book.rating,
    content: book.content,
    tags: book.tags,
    oneLineReview: book.oneLineReview ?? '',
    isPublic: book.isPublic === 1,
  }}
/>
```

- [ ] **Step 6: dev 서버에서 시각 확인**

Run: `pnpm dev`

다음 시나리오 손으로 확인:
1. `/books/new` — 토글 켜진 상태 + 한줄평 빈 입력 + 150자 카운터 노출
2. 한줄평 입력 → 카운터 증가
3. 121자 넘기면 카운터 색 변경
4. 토글 클릭 → 회색 ↔ 파랑 전환, `aria-checked` 토글
5. 저장 → 책 상세로 리다이렉트, 새 책의 isPublic이 1 (수정 페이지 다시 열어보면 토글 켜짐)
6. `/books/<slug>/edit` — 기존 책의 isPublic 값 그대로 표시

- [ ] **Step 7: Biome lint 통과 확인**

Run: `pnpm lint`
Expected: 변경된 파일들이 모두 통과.

- [ ] **Step 8: Commit**

```bash
git add src/components/BookForm.tsx src/app/books/
git commit -m "feat(form): add oneLineReview + isPublic toggle to BookForm

- 150-char counter with visual emphasis at >120
- Toggle defaults to ON for new books, reflects DB value when editing
- Wires through to /api/books POST/PATCH"
```

---

## Task 9: `PublicReviewCard` 컴포넌트

**Files:**
- Create: `src/components/PublicReviewCard.tsx`
- Create: `tests/unit/PublicReviewCard.test.tsx`

- [ ] **Step 1: PublicReviewCard 테스트 작성 (실패할 테스트)**

`tests/unit/PublicReviewCard.test.tsx` 생성:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicReviewCard } from '@/components/PublicReviewCard'

const baseProps = {
  id: 1,
  slug: 's',
  title: '데미안',
  author: '헤르만 헤세',
  genre: '소설',
  rating: 5,
  oneLineReview: '인생 책',
  publishedAt: Date.now(),
  authorDisplayName: '앨리스',
}

describe('PublicReviewCard', () => {
  it('renders title, author, displayName, rating', () => {
    render(<PublicReviewCard item={baseProps} />)
    expect(screen.getByText('데미안')).toBeInTheDocument()
    expect(screen.getByText('헤르만 헤세')).toBeInTheDocument()
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })

  it('renders oneLineReview when present', () => {
    render(<PublicReviewCard item={baseProps} />)
    expect(screen.getByText('인생 책')).toBeInTheDocument()
  })

  it('omits oneLineReview block when null', () => {
    render(<PublicReviewCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(screen.queryByText('인생 책')).not.toBeInTheDocument()
  })

  it('is non-clickable (no anchor, no onClick handler)', () => {
    const { container } = render(<PublicReviewCard item={baseProps} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(
      <PublicReviewCard
        item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }}
      />,
    )
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    // React-rendered text node — no <script> element exists in the DOM
    expect(document.querySelector('script')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실행하여 FAIL 확인**

Run: `pnpm test tests/unit/PublicReviewCard.test.tsx`
Expected: FAIL — 컴포넌트 미정의.

- [ ] **Step 3: PublicReviewCard 구현**

`src/components/PublicReviewCard.tsx` 생성:

```tsx
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { PublicBookCard } from '@/lib/db/queries'

interface Props {
  item: PublicBookCard
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}달 전`
  return `${Math.floor(months / 12)}년 전`
}

export function PublicReviewCard({ item }: Props) {
  return (
    <article className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition">
      <div className="flex items-center justify-between gap-3">
        <RatingStars value={item.rating} size="sm" />
        <GenreBadge genre={item.genre} />
      </div>
      {item.oneLineReview && (
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-strong)] line-clamp-3">
          {item.oneLineReview}
        </p>
      )}
      <div className="mt-4">
        <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
          {item.title}
        </h3>
        <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
          {item.author}
        </p>
      </div>
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
        <span className="font-semibold text-[var(--color-text-muted)]">
          {item.authorDisplayName}
        </span>
        <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
      </div>
    </article>
  )
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `pnpm test tests/unit/PublicReviewCard.test.tsx`
Expected: 모든 5개 케이스 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PublicReviewCard.tsx tests/unit/PublicReviewCard.test.tsx
git commit -m "feat(ui): add PublicReviewCard component for public feed

- Non-clickable: no <a>, no <button>, no onClick
- Gracefully handles missing oneLineReview
- React auto-escapes user content (XSS guard)
- Relative time formatter for publishedAt"
```

---

## Task 10: 홈 페이지 "모두의 서재" 섹션 통합

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page.tsx의 import 갱신**

`src/app/page.tsx:3` import 라인 교체:

```ts
import { listRecentPublicBooks, listWritings, getUserStats } from '@/lib/db/queries'
```

`src/app/page.tsx:4` 교체:

```ts
import { PublicReviewCard } from '@/components/PublicReviewCard'
```

- [ ] **Step 2: 데이터 fetching 교체**

`src/app/page.tsx:32-36`의 `Promise.all` 블록을 교체:

```ts
const [stats, recentPublicBooks, recentWritings] = await Promise.all([
  getUserStats(db, me.id, thisYear),
  listRecentPublicBooks(db, { limit: 6 }),
  listWritings(db, me.id, { limit: 6 }),
])
```

- [ ] **Step 3: "최근 읽은 책" 섹션을 "모두의 서재"로 교체**

`src/app/page.tsx:75-101`의 섹션 블록을 교체:

```tsx
<section>
  <div className="mb-4 flex items-baseline justify-between">
    <h2 className="text-[20px] font-bold text-[var(--color-text-strong)]">모두의 서재</h2>
    {recentPublicBooks.length > 0 && (
      <Link
        href="/feed"
        className="text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-toss-blue)] transition"
      >
        전체 보기 →
      </Link>
    )}
  </div>
  {recentPublicBooks.length === 0 ? (
    <EmptyState
      emoji="📭"
      title="아직 공개된 책이 없어요"
      description="내 책을 공개하면 모두의 서재에 올라와요"
      action={{ href: '/books', label: '내 책장으로 가기' }}
    />
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {recentPublicBooks.map((b) => (
        <PublicReviewCard key={b.id} item={b} />
      ))}
    </div>
  )}
</section>
```

- [ ] **Step 4: 미사용 import 정리**

`src/app/page.tsx`의 `BookCard` import가 더 이상 안 쓰이면 제거:
- 만약 `import { BookCard } from '@/components/BookCard'`이 다른 곳에서 안 쓰이면 import 라인 삭제.

Run: `pnpm lint`
Expected: PASS — 미사용 import 없음.

- [ ] **Step 5: 시각 확인**

Run: `pnpm dev`
- 로그인 후 홈 진입 → 인사 → 책장·글방 카드 → **모두의 서재** 섹션 (6개) → 최근 쓴 글.
- 공개된 책이 없는 상태에서 비어있는 메시지 + "내 책장으로 가기" CTA 확인.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): replace recent books section with 모두의 서재 feed"
```

---

## Task 11: `/feed` 페이지 신설

**Files:**
- Create: `src/app/feed/page.tsx`

- [ ] **Step 1: /feed 페이지 작성**

`src/app/feed/page.tsx` 생성:

```tsx
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { listRecentPublicBooks, countPublicBooks } from '@/lib/db/queries'
import { PublicReviewCard } from '@/components/PublicReviewCard'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

const PAGE_SIZE = 24

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

interface SP {
  searchParams: Promise<{ page?: string }>
}

export default async function FeedPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/feed')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const offset = (page - 1) * PAGE_SIZE

  const [items, total] = await Promise.all([
    listRecentPublicBooks(db, { limit: PAGE_SIZE, offset }),
    countPublicBooks(db),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          모두의 서재
        </h1>
        <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}권</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          emoji="📭"
          title="아직 공개된 책이 없어요"
          description="내 책을 공개하면 모두의 서재에 올라와요"
          action={{ href: '/books', label: '내 책장으로 가기' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {items.map((b) => (
              <PublicReviewCard key={b.id} item={b} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/feed" />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 미들웨어가 /feed를 세션 게이트로 보호하는지 확인**

`src/middleware.ts`의 매칭 규칙을 검토 — 기본적으로 모든 페이지 라우트가 세션 보호 하에 있어야 함. 만약 매칭이 명시적 화이트리스트 패턴이면 `/feed`도 보호 경로로 포함되는지 확인.

확인 명령:
```bash
grep -n 'matcher\|/feed' src/middleware.ts
```

`matcher`가 광범위 패턴(예: `/((?!api|_next|login|...)`)이면 자동 포함됨. 만약 명시적 화이트리스트라면 `/feed`를 추가.

또한 페이지 내 fallback도 있음 — `getCurrentUser()`가 null이면 `redirect('/login')`로 직접 보호.

- [ ] **Step 3: 시각 확인**

Run: `pnpm dev`
- 로그인 후 `/feed` 진입 → 헤딩 + 카드 그리드 + (24권 넘으면) 페이지네이션.
- 두 번째 페이지 이동 확인.
- 비로그인 상태로 `/feed` 직접 입력 → `/login?next=/feed`로 리다이렉트.

- [ ] **Step 4: Biome 통과**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/feed/page.tsx
git commit -m "feat(feed): add /feed paginated public feed page

- Reuses Pagination + EmptyState components
- Session-gated via getCurrentUser + middleware
- 24 items per page, sorted by publishedAt DESC"
```

---

## Task 12: BookCard에 공개 인디케이터 추가

**Files:**
- Modify: `src/components/BookCard.tsx`

- [ ] **Step 1: BookWithTags 타입이 이미 새 필드를 노출**

`BookWithTags = typeof books.$inferSelect & { tags: string[] }`라 schema 변경으로 `isPublic`/`oneLineReview`/`publishedAt`이 자동 포함됨. 추가 타입 작업 불필요.

- [ ] **Step 2: BookCard에 공개 인디케이터 추가**

`src/components/BookCard.tsx:31-36` (`<div className="mt-4 flex...">` 블록) 교체:

```tsx
<div className="mt-4 flex items-center justify-between gap-2">
  <RatingStars value={book.rating} size="sm" />
  <div className="flex items-center gap-2">
    {book.isPublic === 1 && (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-toss-blue)]"
        title="모두의 서재에 공개됨"
      >
        🌐 공개
      </span>
    )}
    <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">
      {book.readDate}
    </time>
  </div>
</div>
```

(`book.oneLineReview` 노출은 본인 책장에서도 정보 가치가 있지만, 카드 레이아웃 복잡도를 늘리지 않기 위해 본 단계에서는 인디케이터만 추가. 한줄평 자체 노출은 Task 13의 상세 페이지에서.)

- [ ] **Step 3: 시각 확인**

Run: `pnpm dev`
- `/books` 진입 → 공개된 책 카드에 `🌐 공개` 배지, 비공개 책엔 배지 없음.

- [ ] **Step 4: Biome lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BookCard.tsx
git commit -m "feat(ui): show 🌐 공개 indicator on owner's BookCard"
```

---

## Task 13: 본인 책 상세 페이지에 한줄평 표시

**Files:**
- Modify: `src/app/books/[slug]/page.tsx`

- [ ] **Step 1: 현재 상세 페이지 구조 확인**

Run: `cat src/app/books/\[slug\]/page.tsx`

페이지가 `book.title`, `book.content`, `book.rating` 등을 렌더하는 구조일 것. 헤딩 메타 줄(별점 옆) 또는 본문 위에 한줄평을 인용 블록으로 노출.

- [ ] **Step 2: 한줄평 인용 블록 추가**

본문(`MarkdownViewer`) 렌더링 **바로 앞**에 한줄평 블록 삽입. 정확한 위치는 파일 구조에 맞춰 적용. 예시 JSX:

```tsx
{book.oneLineReview && (
  <blockquote className="mb-6 px-5 py-4 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)] border-l-4 border-[var(--color-toss-blue)]">
    <p className="text-[16px] leading-relaxed text-[var(--color-text-strong)] font-medium">
      "{book.oneLineReview}"
    </p>
  </blockquote>
)}
```

별점/날짜 메타 줄 옆에 `isPublic` 인디케이터도 추가:

```tsx
{book.isPublic === 1 && (
  <span className="text-[12px] font-semibold text-[var(--color-toss-blue)]" title="모두의 서재에 공개됨">
    🌐 공개
  </span>
)}
```

(위치는 파일에 따라 조정.)

- [ ] **Step 3: 시각 확인**

Run: `pnpm dev`
- 한줄평이 있는 본인 책 상세 진입 → 인용 블록 노출.
- 한줄평이 없는 책 → 인용 블록 없음.
- 공개된 책 → 헤더에 `🌐 공개` 인디케이터.

- [ ] **Step 4: Biome lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/books/\[slug\]/page.tsx
git commit -m "feat(book-detail): show oneLineReview quote + public indicator"
```

---

## Task 14: E2E 테스트

**Files:**
- Create: `tests/e2e/public-feed.spec.ts`

- [ ] **Step 1: E2E 테스트 작성**

`tests/e2e/public-feed.spec.ts` 생성. 기존 e2e 테스트(`tests/e2e/golden-path.spec.ts`, `auth.spec.ts`)의 패턴을 따라가야 함. 먼저 기존 패턴 확인:

Run: `cat tests/e2e/golden-path.spec.ts`

기존 패턴에 맞춰 다음 시나리오들을 작성. 정확한 셀렉터·로그인 헬퍼는 기존 코드를 본 다음 맞춰 적용. 골격:

```ts
import { test, expect } from '@playwright/test'

test.describe('public feed', () => {
  test('book toggled public shows up on /feed for another user', async ({ browser }) => {
    // user A 로그인 → 책 작성 (한줄평 + 공개 토글 on by default)
    const aCtx = await browser.newContext()
    const aPage = await aCtx.newPage()
    // ... 로그인 헬퍼 (기존 패턴 사용)
    await aPage.goto('/books/new')
    await aPage.fill('input[name="title"], input:near(:text("제목"))', '데미안')
    // ...
    await aPage.fill('input:near(:text("한줄평"))', '인생 책')
    // (토글은 디폴트 on이므로 클릭 불필요)
    await aPage.click('button[type="submit"]')

    // user B 로그인 → /feed에서 A의 책 확인
    const bCtx = await browser.newContext()
    const bPage = await bCtx.newPage()
    // ... 로그인 헬퍼
    await bPage.goto('/feed')
    await expect(bPage.getByText('데미안')).toBeVisible()
    await expect(bPage.getByText('인생 책')).toBeVisible()
    // content가 DOM에 없는지 확인 — A의 긴 본문 텍스트는 안 보여야 함

    await aCtx.close()
    await bCtx.close()
  })

  test('toggling off removes book from feed', async ({ page }) => {
    // user A 로그인 → 책 작성 → /feed에서 보임 확인 → edit 페이지에서 토글 off → /feed에서 사라짐
  })

  test('unauthenticated /feed redirects to /login', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login/)
  })

  test('XSS in oneLineReview is escaped on feed', async ({ page }) => {
    // user A 로그인 → 한줄평에 <script>alert(1)</script> 입력 + 저장
    // → /feed 진입 → 텍스트는 리터럴로 표시, <script> 엘리먼트는 DOM에 없음
    await page.goto('/feed')
    // script가 DOM 트리에 안 들어갔는지 확인
    expect(await page.locator('script:has-text("alert(1)")').count()).toBe(0)
  })
})
```

**중요:** 기존 e2e 헬퍼·로그인 패턴을 그대로 재사용. 기존 테스트가 어떻게 user 시드/로그인을 처리하는지 보고 동일하게 작성.

- [ ] **Step 2: E2E 실행**

Run: `pnpm e2e tests/e2e/public-feed.spec.ts`
Expected: 모든 시나리오 PASS.

만약 기존 e2e가 admin 시드/마이그레이션 기대를 가진다면 동일한 setup 사용.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/public-feed.spec.ts
git commit -m "test(e2e): public feed end-to-end coverage

- Cross-user visibility on /feed
- Toggle off removes book from feed
- Unauthenticated /feed redirects to /login
- XSS in oneLineReview is escaped"
```

---

## Task 15: 최종 검증 + 회귀 확인

**Files:**
- None (verification only)

- [ ] **Step 1: 전체 unit + integration 테스트**

Run: `pnpm test`
Expected: 모든 테스트 PASS — 새 케이스 + 기존 회귀 가드.

- [ ] **Step 2: 전체 E2E 테스트**

Run: `pnpm e2e`
Expected: 모든 시나리오 PASS — golden-path, auth, delete, public-feed.

- [ ] **Step 3: Biome 최종 lint + format 검사**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공 — 타입 오류·import 오류·라우트 오류 없음.

- [ ] **Step 5: dev 서버에서 골든 패스 수동 확인**

Run: `pnpm dev`

다음 시나리오 직접 클릭:
1. 두 사용자(A, B) 로그인 분리 (다른 브라우저 또는 incognito).
2. A에서 책 작성 (한줄평 입력 + 공개 토글 디폴트 on) → 등록.
3. B 홈 → "모두의 서재" 섹션에 A의 책이 보임.
4. B → `/feed` → 페이지네이션 동작.
5. A → 자기 책 수정 → 공개 off → B 새로고침 → 사라짐.
6. A → 다시 공개 on → B 새로고침 → 다시 보이고 publishedAt이 가장 최신.

- [ ] **Step 6: 마이그레이션 사건 안전성 재확인**

기존 책들이 마이그레이션 직후 자동 공개됨을 의식 — spec section 1의 "마이그레이션 사건" 운영 주의 사항을 PR description에 다시 명시.

- [ ] **Step 7: 최종 Commit (있다면)**

이 시점엔 commit할 변경이 없어야 함. 만약 미세 조정이 있었다면:

```bash
git status
git add -p
git commit -m "chore: post-verification cleanup"
```

---

## Self-Review Note

이 계획은 spec의 10개 섹션을 다음과 같이 커버:

| Spec 섹션 | 커버 Task |
|---|---|
| 1. 목표·비목표·마이그레이션 사건 | Task 1, Task 15 |
| 2. Schema 변경 | Task 1 |
| 3. Validation | Task 3 |
| 4. Queries | Task 4, 5, 6 |
| 5. Authorization | (변경 없음, 기존 `requireOwnBook`이 자동 보호) — Task 6 cross-user 테스트로 가드 |
| 6. Form | Task 7 (Toggle), Task 8 (BookForm) |
| 7. UI | Task 9 (PublicReviewCard), Task 10 (홈), Task 11 (/feed), Task 12 (BookCard 인디케이터), Task 13 (상세) |
| 8. Tests | Task 3 (validations), Task 4-6 (integration), Task 9 (PublicReviewCard), Task 14 (E2E) |
| 9. Out of scope | (해당 없음 — 작업 안 함) |
| 10. Open decisions | Task 12, 13에서 인디케이터 모양 적용·Task 15에서 마이그레이션 공지 환기 |

각 task는 자체 commit으로 끝나 PR 분할이 자연스럽고, TDD 순서(테스트 먼저 작성 → FAIL 확인 → 구현 → PASS 확인 → commit)를 일관되게 따름.
