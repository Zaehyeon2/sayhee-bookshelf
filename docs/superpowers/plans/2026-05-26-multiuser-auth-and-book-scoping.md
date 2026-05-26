# 멀티유저 인증 + 책 Scoping Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 admin(환경변수)로 운영되는 현재 사이트를 **멀티유저 + 완전 비공개 + 데이터 분리** 모델로 전환한다. 각 사용자는 본인 서재만 본다. 사이트 제목은 로그인 상태에 따라 동적으로 바뀐다 (비로그인 "누구의 서재" / 로그인 "{displayName}의 서재"). 글방(writings)은 Plan 2에서 추가.

**Architecture:** Drizzle ORM(SQLite/Turso) 스키마에 `users` 신설 + `books.authorUserId` 추가. JWT(jose) 페이로드에 user identity를 담고, Next.js middleware로 보호 경로 redirect. 모든 책 라우트가 `WHERE author_user_id = me.id`로 scoping. admin 권한은 *사용자 관리에만 한정* — 다른 사용자 책은 admin도 못 봄. 타인 리소스 접근은 403 대신 **404** (존재 enumeration 방지). bcrypt 비번 + `mustChangePassword` 플래그로 첫 로그인 강제 변경 흐름.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM 0.45 · @libsql/client (Turso) · jose (JWT) · bcryptjs · zod · vitest · @playwright/test · sonner (toast) · @radix-ui/react-dialog · pnpm

**Related spec:** `docs/superpowers/specs/2026-05-26-multiuser-auth-design.md`

---

## File Structure

### Create

| Path | Responsibility |
|---|---|
| `src/lib/username-normalize.ts` | username NFC + lowercase + trim 정규화 |
| `src/lib/auth-helpers.ts` | `requireUser` / `requireAdmin` / `requireOwnBook` (HTTP 401/403/404 throw) |
| `src/middleware.ts` | 보호 경로(/books, /admin, /settings) 미로그인 → /login, mcp=1 → /settings/password |
| `src/app/api/users/me/password/route.ts` | 본인 비밀번호 변경 (current 검증 + confirm 일치 + 새 JWT 재발급) |
| `src/app/api/users/me/profile/route.ts` | displayName 변경 |
| `src/app/api/admin/users/route.ts` | GET 사용자 목록 / POST 신규 사용자 생성 (기본 비번) |
| `src/app/api/admin/users/[id]/route.ts` | DELETE 사용자 (본인 삭제 금지, CASCADE) |
| `src/app/api/admin/users/[id]/reset-password/route.ts` | 비밀번호 reset (기본 비번 + mcp=1) |
| `src/app/admin/users/page.tsx` | 사용자 관리 페이지 |
| `src/app/settings/password/page.tsx` | 비밀번호 변경 페이지 |
| `src/app/settings/profile/page.tsx` | 프로필(displayName) 변경 페이지 |
| `src/components/PasswordChangeForm.tsx` | 3필드 폼 (현재/새/새 확인) |
| `src/components/ProfileForm.tsx` | displayName 폼 |
| `src/components/UserAdminTable.tsx` | 사용자 목록 + 신규 생성 모달 + reset + 삭제 버튼 |
| `scripts/seed-admin.ts` | 멱등 admin 시드 (env로 username/password) |
| `tests/setup-db.ts` | 통합 테스트마다 SQLite 초기화 + admin seed |
| `tests/factories.ts` | `createUser` / `createBook` / `createSession` 헬퍼 |
| `tests/unit/username-normalize.test.ts` | 정규화 단위 테스트 |
| `tests/unit/auth.test.ts` | authenticate / signSession / getSessionUser 라운드트립 |
| `tests/unit/validations.test.ts` | 새 zod 스키마 |
| `tests/integration/books-scoping.test.ts` | 책 라우트 데이터 격리 |
| `tests/integration/users-me.test.ts` | 비번/프로필 변경 |
| `tests/integration/admin-users.test.ts` | admin 사용자 관리 권한 매트릭스 |
| `tests/e2e/anonymous-landing.spec.ts` | E2E #1 |
| `tests/e2e/onboarding.spec.ts` | E2E #2 |
| `tests/e2e/data-isolation.spec.ts` | E2E #3 |
| `tests/e2e/dynamic-title.spec.ts` | E2E #4 |
| `tests/e2e/password-reset-and-delete.spec.ts` | E2E #5 |
| `drizzle/0001_multiuser.sql` | (drizzle-kit 자동생성) |

### Modify

| Path | What changes |
|---|---|
| `src/lib/db/schema.ts` | users 테이블 신설, books에 `authorUserId` + composite UNIQUE `(authorUserId, slug)`, 기존 slug 단독 UNIQUE 제거 |
| `src/lib/auth.ts` | 전면 rewrite — `authenticate(username, password)`, `signSession(user)`, `getSessionUser(token)`, `getCurrentUser()` |
| `src/lib/validations.ts` | `LoginSchema`에 username 추가, `ChangePasswordSchema` / `CreateUserSchema` / `UpdateProfileSchema` 추가 |
| `src/lib/db/queries.ts` | 모든 책 함수에 `authorUserId` 파라미터, slug 충돌 에러 메시지를 composite 인덱스 이름에 맞춤 |
| `src/app/api/login/route.ts` | body에 `username` 추가, `authenticate` 호출, JWT에 user 식별자 |
| `src/app/api/books/route.ts` | requireUser + scoping (GET 본인만, POST `authorUserId = me.id`) |
| `src/app/api/books/[id]/route.ts` | requireOwnBook (GET/PATCH/DELETE) |
| `src/app/api/tags/suggest/route.ts` | requireUser + 본인 책의 태그 풀로 scoping |
| `src/app/layout.tsx` | 동적 사이트 제목, 로그인 상태별 우측 영역 |
| `src/app/login/page.tsx` | username 입력 추가 |
| `src/app/page.tsx` | 비로그인 안내 vs 로그인 본인 책 그리드 분기 |
| `src/app/books/page.tsx` | 데이터 fetch에 user id 전달 (자동 scoping) |
| `src/app/books/[slug]/page.tsx` | requireUser + 본인 책 slug만 조회 (다른 사용자 책이면 notFound) |
| `src/app/admin/edit/[id]/page.tsx` | requireOwnBook 진입 검사 |
| `.env.example` | `ADMIN_PASSWORD_HASH` 제거, `INITIAL_ADMIN_USERNAME/PASSWORD`, `DEFAULT_USER_PASSWORD` 추가 |
| `package.json` | `seed:admin` 스크립트 |
| `README.md` | 멀티유저 설정 섹션 |
| `tests/e2e/*.spec.ts` (기존) | 로그인 폼에 `username` 필드 입력 패치 |

---

## Phase 1: Foundation (DB & Auth Core)

### Task 1: users 테이블 추가 + books 스키마 변경

**Files:**
- Modify: `src/lib/db/schema.ts:1-66`

- [ ] **Step 1: schema.ts에 users 테이블 + books.authorUserId + composite UNIQUE 적용**

전체 파일을 다음으로 교체:

```ts
import { sqliteTable, integer, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'),  // 'admin' | 'member'
    mustChangePassword: integer('must_change_password').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    usernameIdx: uniqueIndex('idx_users_username').on(t.username),
  })
)

export const books = sqliteTable(
  'books',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // ★ Task 1 시점에는 NULLABLE FK. 기존 책을 sayhee.id로 backfill한 뒤
    //   Task 28의 NOT NULL 토글 단계에서 제약 재적용 (drizzle-kit이 table-rename).
    authorUserId: integer('author_user_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author').notNull(),
    genre: text('genre').notNull(),
    readDate: text('read_date').notNull(),
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    titleIdx: index('idx_books_title').on(t.title),
    authorIdx: index('idx_books_author').on(t.author),
    genreIdx: index('idx_books_genre').on(t.genre),
    dateIdx: index('idx_books_date').on(t.readDate),
    authorUserIdx: index('idx_books_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_books_user_slug').on(t.authorUserId, t.slug),
    ratingCheck: check('rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  })
)

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

export const bookTags = sqliteTable(
  'book_tags',
  {
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.bookId, t.tagId] }),
    tagIdx: index('idx_book_tags_tag').on(t.tagId),
  })
)

export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
}))
export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(users, { fields: [books.authorUserId], references: [users.id] }),
  bookTags: many(bookTags),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
}))
export const bookTagsRelations = relations(bookTags, ({ one }) => ({
  book: one(books, { fields: [bookTags.bookId], references: [books.id] }),
  tag: one(tags, { fields: [bookTags.tagId], references: [tags.id] }),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type BookTag = typeof bookTags.$inferSelect
export type NewBookTag = typeof bookTags.$inferInsert
```

- [ ] **Step 2: 사전 책 권수 기록**

Run: `sqlite3 local.db "SELECT COUNT(*) FROM books;"`
Expected: 어떤 숫자든 OK (기록만 — backfill 후 동일한지 검증 위해)

> 이 시점에서는 `author_user_id`가 NULLABLE이라 기존 책이 있어도 ALTER 통과.
> NOT NULL 제약은 Task 25에서 backfill 후 별도로 적용.

- [ ] **Step 3: Drizzle 마이그레이션 generate**

Run: `pnpm drizzle-kit generate`
Expected: `drizzle/0001_*.sql` 생성됨 (또는 비슷한 번호)

- [ ] **Step 4: 로컬 DB에 적용**

Run: `pnpm drizzle-kit push`
Expected: `[✓] Changes applied`

- [ ] **Step 5: 적용 확인**

Run: `sqlite3 local.db ".schema users" && sqlite3 local.db ".schema books"`
Expected: users 테이블 존재, books 테이블에 `author_user_id` 컬럼과 `idx_books_user_slug` 인덱스 존재

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): add users table and book ownership scoping"
```

---

### Task 2: username 정규화 유틸 (TDD)

**Files:**
- Create: `src/lib/username-normalize.ts`
- Test: `tests/unit/username-normalize.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/username-normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUsername, isValidUsername } from '@/lib/username-normalize'

describe('normalizeUsername', () => {
  it('lowercases ASCII', () => {
    expect(normalizeUsername('Sehee')).toBe('sehee')
  })
  it('trims whitespace', () => {
    expect(normalizeUsername('  sehee  ')).toBe('sehee')
  })
  it('NFC normalizes decomposed Hangul', () => {
    // U+1109 U+1166 U+1112 U+1174 (decomposed) → '세희' (composed)
    const decomposed = '세희'
    expect(normalizeUsername(decomposed)).toBe('세희')
  })
  it('keeps composed Hangul as is', () => {
    expect(normalizeUsername('세희')).toBe('세희')
  })
})

describe('isValidUsername', () => {
  it('accepts 2~20 chars (Korean OK)', () => {
    expect(isValidUsername('세희')).toBe(true)
    expect(isValidUsername('sehee_2')).toBe(true)
  })
  it('rejects too short / too long', () => {
    expect(isValidUsername('a')).toBe(false)
    expect(isValidUsername('a'.repeat(21))).toBe(false)
  })
  it('rejects forbidden chars', () => {
    expect(isValidUsername('a b')).toBe(false)   // space
    expect(isValidUsername('a/b')).toBe(false)
    expect(isValidUsername('a?b')).toBe(false)
    expect(isValidUsername('a#b')).toBe(false)
    expect(isValidUsername('a@b')).toBe(false)
    expect(isValidUsername('a&b')).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test username-normalize`
Expected: FAIL — `Cannot find module '@/lib/username-normalize'`

- [ ] **Step 3: 구현**

`src/lib/username-normalize.ts`:

```ts
const FORBIDDEN = /[\s/?#@&]/

export function normalizeUsername(input: string): string {
  return input.trim().normalize('NFC').toLowerCase()
}

export function isValidUsername(value: string): boolean {
  if (value.length < 2 || value.length > 20) return false
  if (FORBIDDEN.test(value)) return false
  return true
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test username-normalize`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/username-normalize.ts tests/unit/username-normalize.test.ts
git commit -m "feat(auth): add username normalization with NFC + Hangul support"
```

---

### Task 3: validations.ts 확장

**Files:**
- Modify: `src/lib/validations.ts:41-43`
- Test: `tests/unit/validations.test.ts` (Create)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/validations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateProfileSchema,
} from '@/lib/validations'

describe('LoginSchema', () => {
  it('requires username and password', () => {
    expect(LoginSchema.safeParse({ username: 'sehee', password: 'pass1234' }).success).toBe(true)
    expect(LoginSchema.safeParse({ password: 'pass1234' }).success).toBe(false)
    expect(LoginSchema.safeParse({ username: 'sehee' }).success).toBe(false)
  })
  it('rejects too-short password', () => {
    expect(LoginSchema.safeParse({ username: 'sehee', password: '123' }).success).toBe(false)
  })
})

describe('ChangePasswordSchema', () => {
  it('requires confirm matches', () => {
    const ok = ChangePasswordSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      newPasswordConfirm: 'new12345',
    })
    expect(ok.success).toBe(true)
  })
  it('rejects mismatched confirm', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      newPasswordConfirm: 'wrong___',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('일치'))).toBe(true)
    }
  })
})

describe('CreateUserSchema', () => {
  it('accepts valid username', () => {
    expect(CreateUserSchema.safeParse({ username: '세희' }).success).toBe(true)
    expect(CreateUserSchema.safeParse({ username: 'sehee', displayName: '세희' }).success).toBe(true)
  })
  it('rejects forbidden chars', () => {
    expect(CreateUserSchema.safeParse({ username: 'a/b' }).success).toBe(false)
  })
})

describe('UpdateProfileSchema', () => {
  it('requires displayName 1~30', () => {
    expect(UpdateProfileSchema.safeParse({ displayName: '세' }).success).toBe(true)
    expect(UpdateProfileSchema.safeParse({ displayName: '' }).success).toBe(false)
    expect(UpdateProfileSchema.safeParse({ displayName: 'a'.repeat(31) }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test validations`
Expected: FAIL — `ChangePasswordSchema is not exported` (또는 기존 LoginSchema가 username 미지원)

- [ ] **Step 3: validations.ts 수정**

기존 `src/lib/validations.ts:41-43`의 LoginSchema 교체 + 신규 스키마 추가:

```ts
import { z } from 'zod'
import { GENRES } from './genres'
import { isValidUsername } from './username-normalize'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export const CreateBookSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  author: z.string().trim().min(1, '작가를 입력하세요').max(100),
  genre: z.enum(GENRES),
  readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
  rating: z.number().int().min(1).max(5),
  content: z.string().default(''),
  tags: z
    .array(z.string())
    .default([])
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    ),
})

export type CreateBookInput = z.infer<typeof CreateBookSchema>

export const UpdateBookSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
  author: z.string().trim().min(1, '작가를 입력하세요').max(100).optional(),
  genre: z.enum(GENRES).optional(),
  readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
  rating: z.number().int().min(1).max(5).optional(),
  content: z.string().optional(),
  tags: z
    .array(z.string())
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    )
    .optional(),
})

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const LoginSchema = z.object({
  username: z.string().trim().min(2).max(20),
  password: z.string().min(8),
})

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    newPasswordConfirm: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    message: '새 비밀번호가 일치하지 않습니다',
    path: ['newPasswordConfirm'],
  })

export const CreateUserSchema = z.object({
  username: z.string().trim().refine(isValidUsername, '아이디는 2~20자, 공백·/·?·#·@·& 금지'),
  displayName: z.string().trim().min(1).max(30).optional(),
})

export const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
})
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test validations`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/validations.ts tests/unit/validations.test.ts
git commit -m "feat(auth): expand validation schemas for login/password/profile"
```

---

### Task 4: auth.ts 개편 (TDD)

**Files:**
- Modify: `src/lib/auth.ts` (전면 rewrite)
- Test: `tests/unit/auth.test.ts` (Create)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { authenticate, signSession, getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

const TEST_SECRET = 'a'.repeat(32)

beforeAll(async () => {
  process.env.AUTH_SECRET = TEST_SECRET
  await db.delete(users)
  const hash = await bcrypt.hash('password123', 10)
  await db.insert(users).values({
    username: 'sehee',
    displayName: '세희',
    passwordHash: hash,
    role: 'admin',
    mustChangePassword: 0,
    createdAt: Date.now(),
  })
})

describe('authenticate', () => {
  it('returns user on correct password', async () => {
    const u = await authenticate('sehee', 'password123')
    expect(u).not.toBeNull()
    expect(u?.username).toBe('sehee')
    expect(u?.role).toBe('admin')
  })

  it('returns null on wrong password', async () => {
    expect(await authenticate('sehee', 'wrong____')).toBeNull()
  })

  it('returns null on missing user', async () => {
    expect(await authenticate('ghost', 'whatever_')).toBeNull()
  })

  it('NFC + lowercase normalizes username at lookup', async () => {
    expect(await authenticate('  SEHEE  ', 'password123')).not.toBeNull()
  })
})

describe('signSession + getSessionUser', () => {
  it('round-trips user identity', async () => {
    const u = await authenticate('sehee', 'password123')
    expect(u).not.toBeNull()
    const token = await signSession(u!)
    const back = await getSessionUser(token)
    expect(back?.sub).toBe(u!.id)
    expect(back?.username).toBe('sehee')
    expect(back?.role).toBe('admin')
    expect(back?.mcp).toBe(0)
  })

  it('returns null for missing token', async () => {
    expect(await getSessionUser(undefined)).toBeNull()
  })

  it('returns null for tampered token', async () => {
    const u = await authenticate('sehee', 'password123')
    const token = (await signSession(u!)) + 'x'
    expect(await getSessionUser(token)).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test auth.test`
Expected: FAIL — `authenticate is not exported` 또는 비슷한 import 에러

- [ ] **Step 3: auth.ts rewrite**

`src/lib/auth.ts` 전체 교체:

```ts
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { users, type User } from '@/lib/db/schema'
import { normalizeUsername } from '@/lib/username-normalize'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7  // 7일
const DUMMY_HASH = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export type SessionUser = {
  sub: number
  username: string
  role: 'admin' | 'member'
  mcp: 0 | 1
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be ≥32 chars')
  return new TextEncoder().encode(s)
}

export async function authenticate(usernameInput: string, password: string): Promise<User | null> {
  const username = normalizeUsername(usernameInput)
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1)
  const user = rows[0]
  // timing-attack 방지: 사용자 미존재여도 bcrypt 한 번 실행
  const hash = user?.passwordHash ?? DUMMY_HASH
  const ok = await bcrypt.compare(password, hash)
  if (!user || !ok) return null
  return user
}

export async function signSession(user: User): Promise<string> {
  const payload: SessionUser = {
    sub: user.id,
    username: user.username,
    role: user.role as 'admin' | 'member',
    mcp: (user.mustChangePassword ? 1 : 0) as 0 | 1,
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret())
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'number' || typeof payload.username !== 'string') return null
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role as 'admin' | 'member',
      mcp: (payload.mcp as 0 | 1) ?? 1,
    }
  } catch {
    return null
  }
}

/** 서버 컴포넌트/route handler에서 현재 사용자 조회 (DB hit) */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  const session = await getSessionUser(token)
  if (!session) return null
  const rows = await db.select().from(users).where(eq(users.id, session.sub)).limit(1)
  return rows[0] ?? null
}

export const SESSION = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
```

- [ ] **Step 4: 통과 확인**

Run: `AUTH_SECRET=$(node -e "console.log('a'.repeat(32))") pnpm test auth.test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(auth): rewrite auth.ts for multi-user sessions"
```

---

### Task 5: 권한 헬퍼 (auth-helpers.ts)

**Files:**
- Create: `src/lib/auth-helpers.ts`

- [ ] **Step 1: 구현**

`src/lib/auth-helpers.ts`:

```ts
import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { books, type Book } from '@/lib/db/schema'
import { getCurrentUser, type SessionUser } from '@/lib/auth'
import type { User } from '@/lib/db/schema'

/** API route helper — returns Response on failure, user on success */
export class HttpError extends Error {
  constructor(public status: number, public bodyJson: object) {
    super(`HTTP ${status}`)
  }
  toResponse(): Response {
    return NextResponse.json(this.bodyJson, { status: this.status })
  }
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser()
  if (!u) throw new HttpError(401, { error: '로그인이 필요합니다' })
  return u
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser()
  if (u.role !== 'admin') throw new HttpError(403, { error: '관리자 권한이 필요합니다' })
  return u
}

/**
 * API route용: 본인 책 한 권 조회. 다른 사용자의 책이면 404로 응답.
 * 라우트에서 try/catch로 HttpError를 잡아 response로 변환.
 */
export async function requireOwnBook(bookId: number): Promise<{ user: User; book: Book }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '책을 찾을 수 없습니다' })
  return { user, book: rows[0] }
}

/**
 * 서버 컴포넌트(페이지)용 변형: 다른 사용자의 책이면 Next.js notFound() throw.
 */
export async function requireOwnBookForPage(bookId: number): Promise<{ user: User; book: Book }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, book: rows[0] }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/auth-helpers.ts
git commit -m "feat(auth): add requireUser / requireAdmin / requireOwnBook helpers"
```

---

### Task 6: Next.js middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: 구현**

`src/middleware.ts`:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'

const PASSWORD_PATH = '/settings/password'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  const session = await getSessionUser(token)

  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (session.mcp === 1 && req.nextUrl.pathname !== PASSWORD_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = PASSWORD_PATH
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/books/:path*', '/admin/:path*', '/settings/:path*'],
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/middleware.ts
git commit -m "feat(auth): add middleware for protected routes and mcp redirect"
```

---

### Task 7: seed-admin 스크립트

**Files:**
- Create: `scripts/seed-admin.ts`
- Modify: `package.json` (scripts.seed:admin 추가)

- [ ] **Step 1: 스크립트 작성**

`scripts/seed-admin.ts`:

```ts
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from '../src/lib/db/client'
import { users } from '../src/lib/db/schema'
import { normalizeUsername, isValidUsername } from '../src/lib/username-normalize'

async function main() {
  const usernameRaw = process.env.INITIAL_ADMIN_USERNAME
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!usernameRaw || !password) {
    throw new Error('INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set')
  }
  const username = normalizeUsername(usernameRaw)
  if (!isValidUsername(username)) {
    throw new Error(`Invalid username: ${usernameRaw}`)
  }
  if (password.length < 8) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be ≥8 chars')
  }

  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) {
    console.log('Users already exist; seed is a no-op.')
    return
  }

  const hash = await bcrypt.hash(password, 10)
  const [inserted] = await db
    .insert(users)
    .values({
      username,
      displayName: usernameRaw.trim(),
      passwordHash: hash,
      role: 'admin',
      mustChangePassword: 0,
      createdAt: Date.now(),
    })
    .returning()
  console.log(`Seeded admin user: ${inserted.username} (id=${inserted.id})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: package.json scripts에 추가**

`package.json`의 `scripts` 객체에 한 줄 추가:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "seed:admin": "tsx scripts/seed-admin.ts"
  }
}
```

`tsx`가 의존성에 없으면 추가:

Run: `pnpm add -D tsx`

- [ ] **Step 3: 로컬 테스트**

`.env.local`에 잠시 추가:

```
INITIAL_ADMIN_USERNAME=sehee
INITIAL_ADMIN_PASSWORD=password1234
```

Run: `pnpm run seed:admin`
Expected: `Seeded admin user: sehee (id=1)`

다시 한 번:
Run: `pnpm run seed:admin`
Expected: `Users already exist; seed is a no-op.`

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed-admin.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): add seed-admin script for initial admin provisioning"
```

---

## Phase 2: Book Scoping (API)

### Task 8: queries.ts에 user scoping 적용

**Files:**
- Modify: `src/lib/db/queries.ts`

`★ Note:` `createBook`, `updateBook`, `deleteBook`, `getBookBySlug`, `getBookById`, `listBooks`, `searchBooks`, `suggestTags`, `listTagsForBook`, `listGenresWithCounts` 모두 `authorUserId` 파라미터를 받도록 변경. slug 충돌 에러 검사도 composite 인덱스 이름으로.

- [ ] **Step 1: queries.ts 전면 수정**

`src/lib/db/queries.ts` 교체:

```ts
import { eq, like, desc, and, sql, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { books, tags, bookTags } from './schema'
import type * as schema from './schema'
import { toSlug } from '@/lib/slug'
import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }

type Db = LibSQLDatabase<typeof schema>

async function attachTags(db: Db, bookId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, bookId))
  return rows.map((r) => r.name)
}

async function attachTagsBatch(db: Db, bookIds: number[]): Promise<Map<number, string[]>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db
    .select({ bookId: bookTags.bookId, name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(inArray(bookTags.bookId, bookIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.bookId) ?? []
    existing.push(r.name)
    map.set(r.bookId, existing)
  }
  return map
}

async function getOrCreateTag(db: Db, name: string): Promise<number> {
  await db.insert(tags).values({ name }).onConflictDoNothing({ target: tags.name })
  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).limit(1)
  if (!row) throw new Error(`Tag insert+select failed for ${name}`)
  return row.id
}

async function replaceBookTags(db: Db, bookId: number, tagNames: string[]): Promise<void> {
  await db.delete(bookTags).where(eq(bookTags.bookId, bookId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(db, name)
    await db.insert(bookTags).values({ bookId, tagId })
  }
}

function isSlugUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    if (
      err.code === 'SQLITE_CONSTRAINT' &&
      err.message?.includes('idx_books_user_slug')
    ) {
      return true
    }
    current = err.cause
  }
  return false
}

export async function createBook(
  db: Db,
  authorUserId: number,
  input: CreateBookInput,
): Promise<BookWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    try {
      const inserted = await db
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

      const book = inserted[0]
      await replaceBookTags(db, book.id, input.tags ?? [])
      const tagNames = await attachTags(db, book.id)
      return { ...book, tags: tagNames }
    } catch (e) {
      if (isSlugUniqueViolation(e)) continue
      throw e
    }
  }
  throw new Error(`Could not generate unique slug after 100 attempts for title: ${input.title}`)
}

export async function updateBook(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateBookInput,
): Promise<BookWithTags | null> {
  const existing = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (existing.length === 0) return null

  const now = Date.now()
  const updated = await db
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

  const book = updated[0]
  if (input.tags !== undefined) {
    await replaceBookTags(db, id, input.tags)
  }
  const tagNames = await attachTags(db, id)
  return { ...book, tags: tagNames }
}

export async function deleteBook(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .returning({ id: books.id })
  return result.length > 0
}

export async function getBookBySlug(
  db: Db,
  authorUserId: number,
  slug: string,
): Promise<BookWithTags | null> {
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, slug), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function getBookById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<BookWithTags | null> {
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function listBooks(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; sort?: 'date' | 'rating' },
): Promise<BookWithTags[]> {
  const conditions = [eq(books.authorUserId, authorUserId)]

  if (filters.genre) {
    conditions.push(eq(books.genre, filters.genre))
  }
  if (filters.year) {
    conditions.push(like(books.readDate, `${filters.year}-%`))
  }

  if (filters.tag) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return []
    const tagId = tagRows[0].id

    const joinCondition = and(eq(bookTags.bookId, books.id), eq(bookTags.tagId, tagId))

    const rows = await db
      .select({ book: books })
      .from(books)
      .innerJoin(bookTags, joinCondition!)
      .where(and(...conditions))
      .orderBy(
        filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
      )

    const tagMap = await attachTagsBatch(db, rows.map((r) => r.book.id))
    return rows.map((r) => ({ ...r.book, tags: tagMap.get(r.book.id) ?? [] }))
  }

  const rows = await db
    .select()
    .from(books)
    .where(and(...conditions))
    .orderBy(
      filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
    )

  const tagMap = await attachTagsBatch(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchBooks(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<BookWithTags[]> {
  const pattern = `%${q}%`
  const rows = await db
    .select()
    .from(books)
    .where(
      and(
        eq(books.authorUserId, authorUserId),
        sql`(${books.title} LIKE ${pattern} OR ${books.author} LIKE ${pattern} OR ${books.content} LIKE ${pattern})`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${books.title} LIKE ${pattern} THEN 1
        WHEN ${books.author} LIKE ${pattern} THEN 2
        ELSE 3
      END`,
      desc(books.readDate),
    )

  const tagMap = await attachTagsBatch(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function suggestTags(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<string[]> {
  const pattern = `${q}%`
  // 본인 책의 태그 풀에서만 자동완성
  const rows = await db
    .selectDistinct({ name: tags.name })
    .from(tags)
    .innerJoin(bookTags, eq(bookTags.tagId, tags.id))
    .innerJoin(books, eq(books.id, bookTags.bookId))
    .where(and(eq(books.authorUserId, authorUserId), like(tags.name, pattern)))
    .limit(8)
  return rows.map((r) => r.name)
}

export async function listTagsForBook(db: Db, bookId: number): Promise<string[]> {
  return attachTags(db, bookId)
}

export async function listGenresWithCounts(
  db: Db,
  authorUserId: number,
): Promise<{ genre: string; count: number }[]> {
  const rows = await db
    .select({
      genre: books.genre,
      count: sql<number>`COUNT(*)`,
    })
    .from(books)
    .where(eq(books.authorUserId, authorUserId))
    .groupBy(books.genre)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (다음 task에서 호출부 fix할 때까지 일부 err 있을 수 있음 — 무시 가능)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/db/queries.ts
git commit -m "feat(books): add authorUserId scoping to all book queries"
```

---

### Task 9: /api/login — username 필드 추가

**Files:**
- Modify: `src/app/api/login/route.ts`

- [ ] **Step 1: route 교체**

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LoginSchema } from '@/lib/validations'
import { authenticate, signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 400 },
    )
  }
  const user = await authenticate(parsed.data.username, parsed.data.password)
  if (!user) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    )
  }
  const token = await signSession(user)
  const store = await cookies()
  store.set(SESSION.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION.maxAge,
  })
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword === 1 })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/login/route.ts
git commit -m "feat(auth): /api/login accepts username and returns mcp flag"
```

---

### Task 10: /api/books — requireUser + scoping

**Files:**
- Modify: `src/app/api/books/route.ts`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat src/app/api/books/route.ts`

- [ ] **Step 2: route 교체**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createBook, listBooks, searchBooks } from '@/lib/db/queries'
import { CreateBookSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const q = url.searchParams.get('q')
    if (q && q.trim().length > 0) {
      const results = await searchBooks(db, user.id, q.trim())
      return NextResponse.json(results)
    }
    const genre = url.searchParams.get('genre') ?? undefined
    const tag = url.searchParams.get('tag') ?? undefined
    const yearStr = url.searchParams.get('year')
    const year = yearStr ? Number(yearStr) : undefined
    const sortParam = url.searchParams.get('sort')
    const sort = sortParam === 'rating' ? 'rating' : 'date'
    const list = await listBooks(db, user.id, { genre, tag, year, sort })
    return NextResponse.json(list)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = CreateBookSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    const book = await createBook(db, user.id, parsed.data)
    return NextResponse.json(book, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/books/route.ts
git commit -m "feat(books): scope /api/books to current user"
```

---

### Task 11: /api/books/[id] — requireOwnBook

**Files:**
- Modify: `src/app/api/books/[id]/route.ts`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat src/app/api/books/[id]/route.ts`

- [ ] **Step 2: route 교체**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { deleteBook, getBookById, updateBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'
import { requireOwnBook, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!Number.isInteger(bookId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const { user } = await requireOwnBook(bookId)
    const book = await getBookById(db, user.id, bookId)
    if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(book)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!Number.isInteger(bookId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const { user } = await requireOwnBook(bookId)
    const body = await req.json().catch(() => null)
    const parsed = UpdateBookSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    const updated = await updateBook(db, user.id, bookId, parsed.data)
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!Number.isInteger(bookId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const { user } = await requireOwnBook(bookId)
    const ok = await deleteBook(db, user.id, bookId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/books/[id]/route.ts
git commit -m "feat(books): scope /api/books/[id] to book owner with 404 on miss"
```

---

### Task 12: /api/tags/suggest — scoping

**Files:**
- Modify: `src/app/api/tags/suggest/route.ts`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat src/app/api/tags/suggest/route.ts`

- [ ] **Step 2: route 교체**

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { suggestTags } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? ''
    if (q.length === 0) return NextResponse.json([])
    const tags = await suggestTags(db, user.id, q)
    return NextResponse.json(tags)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/tags/suggest/route.ts
git commit -m "feat(books): scope tag suggestions to current user's books"
```

---

### Task 13: /api/users/me/password + profile

**Files:**
- Create: `src/app/api/users/me/password/route.ts`
- Create: `src/app/api/users/me/profile/route.ts`

- [ ] **Step 1: password route 작성**

`src/app/api/users/me/password/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ChangePasswordSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = ChangePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다' },
        { status: 400 },
      )
    }
    const { currentPassword, newPassword } = parsed.data
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다' }, { status: 400 })
    }
    const newHash = await bcrypt.hash(newPassword, 10)
    await db
      .update(users)
      .set({ passwordHash: newHash, mustChangePassword: 0 })
      .where(eq(users.id, user.id))
    // 세션 재발급 (mcp=0)
    const newUser = { ...user, passwordHash: newHash, mustChangePassword: 0 }
    const token = await signSession(newUser)
    const store = await cookies()
    store.set(SESSION.name, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION.maxAge,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 2: profile route 작성**

`src/app/api/users/me/profile/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { UpdateProfileSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = UpdateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    await db
      .update(users)
      .set({ displayName: parsed.data.displayName })
      .where(eq(users.id, user.id))
    return NextResponse.json({ ok: true, displayName: parsed.data.displayName })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/users/me/
git commit -m "feat(auth): add /api/users/me password and profile endpoints"
```

---

## Phase 3: Admin User Management API

### Task 14: /api/admin/users (GET + POST)

**Files:**
- Create: `src/app/api/admin/users/route.ts`

- [ ] **Step 1: 작성**

```ts
import { NextResponse } from 'next/server'
import { sql, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users, books } from '@/lib/db/schema'
import { CreateUserSchema } from '@/lib/validations'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'
import { normalizeUsername } from '@/lib/username-normalize'

export async function GET() {
  try {
    await requireAdmin()
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
        bookCount: sql<number>`(SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${users.id})`,
      })
      .from(users)
      .orderBy(users.createdAt)
    return NextResponse.json(rows.map((r) => ({ ...r, bookCount: Number(r.bookCount) })))
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const defaultPw = process.env.DEFAULT_USER_PASSWORD
    if (!defaultPw || defaultPw.length < 8) {
      return NextResponse.json(
        { error: 'DEFAULT_USER_PASSWORD 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = CreateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    const normalized = normalizeUsername(parsed.data.username)

    // 중복 검사
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, normalized)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 })
    }

    const hash = await bcrypt.hash(defaultPw, 10)
    const [inserted] = await db
      .insert(users)
      .values({
        username: normalized,
        displayName: parsed.data.displayName ?? parsed.data.username.trim(),
        passwordHash: hash,
        role: 'member',
        mustChangePassword: 1,
        createdAt: Date.now(),
      })
      .returning({ id: users.id, username: users.username, displayName: users.displayName })
    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/admin/users/route.ts
git commit -m "feat(admin): add user list and creation endpoints"
```

---

### Task 15: /api/admin/users/[id] DELETE + reset-password

**Files:**
- Create: `src/app/api/admin/users/[id]/route.ts`
- Create: `src/app/api/admin/users/[id]/reset-password/route.ts`

- [ ] **Step 1: DELETE 작성**

`src/app/api/admin/users/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    if (userId === admin.id) {
      return NextResponse.json({ error: '본인을 삭제할 수 없습니다' }, { status: 400 })
    }
    const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 2: reset-password 작성**

`src/app/api/admin/users/[id]/reset-password/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const defaultPw = process.env.DEFAULT_USER_PASSWORD
    if (!defaultPw || defaultPw.length < 8) {
      return NextResponse.json(
        { error: 'DEFAULT_USER_PASSWORD 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      )
    }
    const hash = await bcrypt.hash(defaultPw, 10)
    const result = await db
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: 1 })
      .where(eq(users.id, userId))
      .returning({ id: users.id })
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/users/\[id\]/
git commit -m "feat(admin): add user delete and password reset endpoints"
```

---

## Phase 4: UI Core

### Task 16: layout.tsx — 동적 헤더

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: layout.tsx 교체 (사이트 제목 동적 + 우측 영역 분기)**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import localFont from 'next/font/local'
import { Toaster } from 'sonner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'swap',
  variable: '--font-pretendard',
  preload: true,
})

export const metadata: Metadata = {
  title: {
    default: '누구의 서재',
    template: '%s · 서재',
  },
  description: '개인 독서 기록',
}

const themeBootstrap = `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser()
  const siteTitle = me ? `${me.displayName}의 서재` : '누구의 서재'

  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 bg-[var(--color-header-bg)] backdrop-blur border-b border-[var(--color-border-subtle)]">
          <nav className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
            <Link href="/" className="text-[17px] font-bold text-[var(--color-text-strong)] tracking-tight rounded-[var(--radius-toss-sm)] px-2 py-1 -mx-2 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50">
              📚 {siteTitle}
            </Link>
            <div className="flex items-center gap-1">
              {me ? (
                <>
                  <Link
                    href="/books"
                    className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
                  >
                    목록
                  </Link>
                  <Link
                    href="/admin/new"
                    className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
                  >
                    새 글
                  </Link>
                  <UserMenu displayName={me.displayName} role={me.role as 'admin' | 'member'} />
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition"
                >
                  로그인
                </Link>
              )}
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        <Toaster theme="system" position="top-center" richColors closeButton />
      </body>
    </html>
  )
}

function UserMenu({ displayName, role }: { displayName: string; role: 'admin' | 'member' }) {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition">
        {displayName} ▾
      </summary>
      <div className="absolute right-0 mt-1 w-48 rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
        <Link href="/settings/profile" className="block px-4 py-2 hover:bg-[var(--color-surface-2)]">프로필 변경</Link>
        <Link href="/settings/password" className="block px-4 py-2 hover:bg-[var(--color-surface-2)]">비밀번호 변경</Link>
        {role === 'admin' && (
          <Link href="/admin/users" className="block px-4 py-2 hover:bg-[var(--color-surface-2)]">사용자 관리</Link>
        )}
        <form action="/api/logout" method="POST" className="border-t border-[var(--color-border-subtle)] mt-1 pt-1">
          <button type="submit" className="w-full text-left px-4 py-2 hover:bg-[var(--color-surface-2)]">로그아웃</button>
        </form>
      </div>
    </details>
  )
}
```

- [ ] **Step 2: /api/logout이 form POST에 대응되는지 확인**

Run: `cat src/app/api/logout/route.ts`

만약 form POST에 대응 안 되면 (현재 코드는 fetch JSON 응답일 가능성), redirect 응답 추가:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const store = await cookies()
  store.delete('session')
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'), { status: 303 })
}
```

(실행 시 cookies 삭제 → 홈으로 redirect)

- [ ] **Step 3: 커밋**

```bash
git add src/app/layout.tsx src/app/api/logout/route.ts
git commit -m "feat(ui): dynamic site title and user menu in header"
```

---

### Task 17: /login — username 필드 추가

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat src/app/login/page.tsx`

- [ ] **Step 2: page 교체**

```tsx
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Spinner } from '@/components/Spinner'

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErr(data.error ?? '로그인에 실패했습니다')
        setBusy(false)
        return
      }
      const data = await res.json()
      router.push(data.mustChangePassword ? '/settings/password' : next)
      router.refresh()
    } catch {
      setErr('네트워크 오류')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">로그인</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-[13px] font-medium text-[var(--color-text-muted)]">아이디</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-[var(--color-text-muted)]">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]"
          />
        </label>
        {err && <p className="text-[13px] text-red-500">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {busy && <Spinner />}
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): login form with username + password fields"
```

---

### Task 18: / — 비로그인 안내 / 로그인 본인 책

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page 교체**

```tsx
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listGenresWithCounts } from '@/lib/db/queries'
import { GENRES } from '@/lib/genres'
import { BookCard } from '@/components/BookCard'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const me = await getCurrentUser()

  if (!me) {
    return (
      <div className="mx-auto max-w-xl text-center space-y-6 py-16">
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-strong)]">
          누구의 서재
        </h1>
        <p className="text-[15px] text-[var(--color-text-muted)]">
          나만의 독서 기록을 시작해보세요.
        </p>
        <Link
          href="/login"
          className="inline-block px-6 h-11 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium leading-[44px]"
        >
          로그인
        </Link>
      </div>
    )
  }

  const [all, genreCounts] = await Promise.all([
    listBooks(db, me.id, { sort: 'date' }),
    listGenresWithCounts(db, me.id),
  ])
  const recent = all.slice(0, 6)
  const countMap = new Map(genreCounts.map((g) => [g.genre, g.count]))

  const total = all.length
  const thisYear = new Date().getFullYear()
  const yearCount = all.filter((b) => b.readDate.startsWith(String(thisYear))).length
  const avgRating = total > 0 ? all.reduce((s, b) => s + b.rating, 0) / total : 0

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-strong)] leading-tight">
          내가 읽은 책
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">
          장르별로 모아둔 독서 기록
        </p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="총 권수" value={`${total}`} suffix="권" />
        <StatCard label={`${thisYear}년`} value={`${yearCount}`} suffix="권" />
        <StatCard label="평균 별점" value={total > 0 ? avgRating.toFixed(1) : '—'} suffix={total > 0 ? '/5' : ''} />
      </section>

      <section>
        <h2 className="mb-4 text-[20px] font-bold text-[var(--color-text-strong)]">장르</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {GENRES.map((g) => {
            const count = countMap.get(g) ?? 0
            return (
              <Link
                key={g}
                href={`/books?genre=${encodeURIComponent(g)}`}
                className={
                  'group rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 ' +
                  (count === 0 ? 'opacity-60' : '')
                }
              >
                <div className="text-[15px] font-semibold text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">{g}</div>
                <div className="mt-1 text-[12px] text-[var(--color-text-weak)] font-tabular">{count}권</div>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[20px] font-bold text-[var(--color-text-strong)]">최근 읽은 책</h2>
        {recent.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="아직 등록된 책이 없어요"
            description="첫 독후감을 남겨보세요"
            action={{ href: '/admin/new', label: '새 독후감' }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recent.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-[var(--shadow-toss)]">
      <div className="text-[12px] font-medium text-[var(--color-text-weak)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[20px] sm:text-[28px] font-bold text-[var(--color-text-strong)] font-tabular leading-none">{value}</span>
        {suffix && <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{suffix}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): split home page into anonymous landing vs personal library"
```

---

### Task 19: 책 페이지들 — user scoping

**Files:**
- Modify: `src/app/books/page.tsx`
- Modify: `src/app/books/[slug]/page.tsx`
- Modify: `src/app/admin/edit/[id]/page.tsx`

- [ ] **Step 1: /books/page.tsx — 현재 확인**

Run: `cat src/app/books/page.tsx`

- [ ] **Step 2: /books/page.tsx 수정**

데이터 fetch 부분에 me.id를 전달하도록 변경. 예시 패턴 (구체 코드는 현재 파일 구조에 맞게):

```tsx
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
// ... 기존 import

export default async function BooksPage({ searchParams }: { searchParams: Promise<{...}> }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/books')

  // listBooks/searchBooks 호출 시 me.id를 두 번째 인자로 전달
  const books = await listBooks(db, me.id, { genre, tag, year, sort })
  // ... rest
}
```

- [ ] **Step 3: /books/[slug]/page.tsx 수정**

```tsx
import { getCurrentUser } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
// ... 기존 import

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')
  const { slug } = await params
  const book = await getBookBySlug(db, me.id, slug)
  if (!book) notFound()
  // ... 기존 렌더
}

// generateMetadata도 me.id로 scoping
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const book = await getBookBySlug(db, me.id, slug)
  if (!book) return {}
  return { title: book.title }
}
```

- [ ] **Step 4: /admin/edit/[id]/page.tsx 수정**

```tsx
import { requireOwnBookForPage } from '@/lib/auth-helpers'

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bookId = Number(id)
  const { book } = await requireOwnBookForPage(bookId)
  // ... 기존 폼 렌더 with book 데이터
}
```

- [ ] **Step 5: 빌드 + 타입 체크**

Run: `pnpm build 2>&1 | tail -10`
Expected: 빌드 성공

만약 타입 에러가 있으면 호출부 시그니처 맞추기.

- [ ] **Step 6: 커밋**

```bash
git add src/app/books/ src/app/admin/edit/
git commit -m "feat(books): scope all book pages to current user"
```

---

### Task 20: PasswordChangeForm + /settings/password 페이지

**Files:**
- Create: `src/components/PasswordChangeForm.tsx`
- Create: `src/app/settings/password/page.tsx`

- [ ] **Step 1: PasswordChangeForm 작성**

`src/components/PasswordChangeForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

export function PasswordChangeForm({ forced }: { forced: boolean }) {
  const router = useRouter()
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [newPasswordConfirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = newPassword.length > 0 && newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const canSubmit = !busy && !mismatch && !tooShort && currentPassword.length > 0 && newPassword.length >= 8 && newPasswordConfirm.length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const res = await fetch('/api/users/me/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '비밀번호 변경에 실패했습니다')
      setBusy(false)
      return
    }
    toast.success('비밀번호가 변경되었습니다')
    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
      {forced && (
        <p className="rounded-[var(--radius-toss-sm)] bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-[13px] text-yellow-900 dark:text-yellow-200">
          기본 비밀번호를 사용 중입니다. 변경 후 다른 기능을 이용할 수 있어요.
        </p>
      )}
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">현재 비밀번호</span>
        <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password"
          className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">새 비밀번호</span>
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={8} autoComplete="new-password"
          className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
        {tooShort && <p className="mt-1 text-[12px] text-red-500">최소 8자 이상</p>}
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">새 비밀번호 확인</span>
        <input type="password" value={newPasswordConfirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
          className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
        {mismatch && <p className="mt-1 text-[12px] text-red-500">비밀번호가 일치하지 않습니다</p>}
      </label>
      <button type="submit" disabled={!canSubmit}
        className="w-full h-11 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2">
        {busy && <Spinner />}
        변경
      </button>
    </form>
  )
}
```

- [ ] **Step 2: page 작성**

`src/app/settings/password/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PasswordChangeForm } from '@/components/PasswordChangeForm'

export default async function PasswordSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')
  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">비밀번호 변경</h1>
      <PasswordChangeForm forced={me.mustChangePassword === 1} />
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/PasswordChangeForm.tsx src/app/settings/password/
git commit -m "feat(auth): password change form with confirmation validation"
```

---

### Task 21: ProfileForm + /settings/profile 페이지

**Files:**
- Create: `src/components/ProfileForm.tsx`
- Create: `src/app/settings/profile/page.tsx`

- [ ] **Step 1: ProfileForm 작성**

`src/components/ProfileForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const router = useRouter()
  const [displayName, setName] = useState(initialDisplayName)
  const [busy, setBusy] = useState(false)
  const canSubmit = !busy && displayName.trim().length > 0 && displayName.trim().length <= 30

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const res = await fetch('/api/users/me/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: displayName.trim() }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '저장에 실패했습니다')
      setBusy(false)
      return
    }
    toast.success('프로필이 변경되었습니다')
    setBusy(false)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">표시 이름</span>
        <input type="text" value={displayName} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={30}
          className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
      </label>
      <button type="submit" disabled={!canSubmit}
        className="w-full h-11 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2">
        {busy && <Spinner />}
        저장
      </button>
    </form>
  )
}
```

- [ ] **Step 2: page 작성**

`src/app/settings/profile/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/ProfileForm'

export default async function ProfileSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')
  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">프로필 변경</h1>
      <p className="text-[13px] text-[var(--color-text-muted)]">서재 제목과 화면에 표시되는 이름입니다.</p>
      <ProfileForm initialDisplayName={me.displayName} />
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/ProfileForm.tsx src/app/settings/profile/
git commit -m "feat(auth): profile (displayName) edit page"
```

---

### Task 22: UserAdminTable + /admin/users 페이지

**Files:**
- Create: `src/components/UserAdminTable.tsx`
- Create: `src/app/admin/users/page.tsx`

- [ ] **Step 1: UserAdminTable 작성**

`src/components/UserAdminTable.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

type UserRow = {
  id: number
  username: string
  displayName: string
  role: string
  mustChangePassword: number
  createdAt: number
  bookCount: number
}

export function UserAdminTable({ users, currentAdminId }: { users: UserRow[]; currentAdminId: number }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: newUsername, displayName: newDisplayName || undefined }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '생성 실패')
      setBusy(false)
      return
    }
    toast.success('사용자가 생성되었습니다. 기본 비밀번호로 안내해주세요.')
    setCreating(false)
    setNewUsername('')
    setNewDisplayName('')
    setBusy(false)
    router.refresh()
  }

  async function onReset(id: number, username: string) {
    if (!confirm(`${username}의 비밀번호를 초기화하시겠습니까?`)) return
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    if (!res.ok) {
      toast.error('초기화 실패')
      return
    }
    toast.success('초기화되었습니다. 사용자에게 기본 비밀번호로 로그인하라고 안내하세요.')
    router.refresh()
  }

  async function onDelete(id: number, username: string) {
    if (!confirm(`${username}을(를) 삭제하시겠습니까? 이 사용자의 모든 책도 함께 삭제됩니다.`)) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '삭제 실패')
      return
    }
    toast.success('삭제되었습니다')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="px-4 h-9 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] font-medium">
          신규 사용자
        </button>
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-[12px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
            <th className="text-left py-2">아이디</th>
            <th className="text-left">이름</th>
            <th className="text-left">권한</th>
            <th className="text-right">책</th>
            <th className="text-right">상태</th>
            <th className="text-right">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[var(--color-border-subtle)]/30">
              <td className="py-2">{u.username}</td>
              <td>{u.displayName}</td>
              <td>{u.role === 'admin' ? '관리자' : '멤버'}</td>
              <td className="text-right font-tabular">{u.bookCount}</td>
              <td className="text-right text-[12px] text-[var(--color-text-muted)]">
                {u.mustChangePassword ? '기본 비번' : '정상'}
              </td>
              <td className="text-right space-x-2">
                <button onClick={() => onReset(u.id, u.username)} className="text-[12px] text-[var(--color-toss-blue)] hover:underline">
                  비번 reset
                </button>
                <button
                  onClick={() => onDelete(u.id, u.username)}
                  disabled={u.id === currentAdminId}
                  className="text-[12px] text-red-500 hover:underline disabled:text-[var(--color-text-weak)] disabled:no-underline"
                  title={u.id === currentAdminId ? '본인은 삭제할 수 없습니다' : ''}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 z-20" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-[var(--color-surface)] rounded-[var(--radius-toss)] p-6 w-[360px] shadow-xl">
            <Dialog.Title className="text-[18px] font-bold mb-4">신규 사용자</Dialog.Title>
            <form onSubmit={onCreate} className="space-y-3">
              <label className="block">
                <span className="text-[13px] font-medium text-[var(--color-text-muted)]">아이디 (2~20자, 한글 OK)</span>
                <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required
                  className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-[var(--color-text-muted)]">표시 이름 (선택)</span>
                <input type="text" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[15px]" />
              </label>
              <p className="text-[12px] text-[var(--color-text-muted)]">초기 비밀번호는 환경변수 <code>DEFAULT_USER_PASSWORD</code> 값입니다. 사용자에게 따로 안내해주세요.</p>
              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close className="px-4 h-9 rounded-[var(--radius-toss-sm)] text-[13px] text-[var(--color-text-muted)]">취소</Dialog.Close>
                <button type="submit" disabled={busy} className="px-4 h-9 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] inline-flex items-center gap-2">
                  {busy && <Spinner />}
                  생성
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
```

- [ ] **Step 2: page 작성**

`src/app/admin/users/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, books } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { UserAdminTable } from '@/components/UserAdminTable'

export default async function AdminUsersPage() {
  const me = await getCurrentUser()
  if (!me || me.role !== 'admin') notFound()

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      bookCount: sql<number>`(SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${users.id})`,
    })
    .from(users)
    .orderBy(users.createdAt)

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">사용자 관리</h1>
      <UserAdminTable users={rows.map((r) => ({ ...r, bookCount: Number(r.bookCount) }))} currentAdminId={me.id} />
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/UserAdminTable.tsx src/app/admin/users/
git commit -m "feat(admin): users management page with create/reset/delete"
```

---

## Phase 5: Tests

### Task 23: 테스트 인프라 (setup-db + factories)

**Files:**
- Create: `tests/setup-db.ts`
- Create: `tests/factories.ts`

- [ ] **Step 1: setup-db.ts**

```ts
import { afterEach, beforeAll, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { users, books, bookTags, tags } from '@/lib/db/schema'

export async function resetDb() {
  // 외래키 의존성 역순
  await db.delete(bookTags)
  await db.delete(books)
  await db.delete(tags)
  await db.delete(users)
}

beforeAll(() => {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'test_'.repeat(7) + 'sec'  // 32+ chars
  }
  if (!process.env.DEFAULT_USER_PASSWORD) {
    process.env.DEFAULT_USER_PASSWORD = 'welcome1234'
  }
})

beforeEach(async () => {
  await resetDb()
})

afterEach(async () => {
  await resetDb()
})
```

- [ ] **Step 2: factories.ts**

```ts
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { users, books } from '@/lib/db/schema'
import { signSession } from '@/lib/auth'
import { normalizeUsername } from '@/lib/username-normalize'

export async function createUser(opts: {
  username: string
  displayName?: string
  role?: 'admin' | 'member'
  mustChangePassword?: 0 | 1
  password?: string
} = { username: 'tester' }) {
  const hash = await bcrypt.hash(opts.password ?? 'password1234', 4)  // fast hash for tests
  const [u] = await db
    .insert(users)
    .values({
      username: normalizeUsername(opts.username),
      displayName: opts.displayName ?? opts.username,
      passwordHash: hash,
      role: opts.role ?? 'member',
      mustChangePassword: opts.mustChangePassword ?? 0,
      createdAt: Date.now(),
    })
    .returning()
  return u
}

export async function createBook(authorUserId: number, overrides: Partial<typeof books.$inferInsert> = {}) {
  const [b] = await db
    .insert(books)
    .values({
      authorUserId,
      title: overrides.title ?? '테스트 책',
      author: overrides.author ?? '저자',
      genre: overrides.genre ?? '소설',
      readDate: overrides.readDate ?? '2025-01-01',
      rating: overrides.rating ?? 4,
      content: overrides.content ?? '',
      slug: overrides.slug ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .returning()
  return b
}

export async function tokenFor(userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return signSession(u)
}

// re-export to avoid eq import in test files
import { eq } from 'drizzle-orm'
```

- [ ] **Step 3: 커밋**

```bash
git add tests/setup-db.ts tests/factories.ts
git commit -m "test: add db reset and entity factory helpers"
```

---

### Task 24: Integration test — books scoping

**Files:**
- Create: `tests/integration/books-scoping.test.ts`

- [ ] **Step 1: 작성**

`tests/integration/books-scoping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db/client'
import { listBooks, getBookBySlug, createBook } from '@/lib/db/queries'
import { createUser, createBook as factoryBook } from '../factories'
import '../setup-db'

describe('book queries — user scoping', () => {
  it('listBooks returns only own user books', async () => {
    const a = await createUser({ username: 'alice' })
    const b = await createUser({ username: 'bob' })
    await factoryBook(a.id, { title: 'A1' })
    await factoryBook(a.id, { title: 'A2' })
    await factoryBook(b.id, { title: 'B1' })

    const aList = await listBooks(db, a.id, {})
    const bList = await listBooks(db, b.id, {})
    expect(aList.map((x) => x.title).sort()).toEqual(['A1', 'A2'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('getBookBySlug returns null for other user book', async () => {
    const a = await createUser({ username: 'alice' })
    const b = await createUser({ username: 'bob' })
    const aBook = await factoryBook(a.id, { slug: 'shared-slug' })
    expect(await getBookBySlug(db, a.id, 'shared-slug')).not.toBeNull()
    expect(await getBookBySlug(db, b.id, 'shared-slug')).toBeNull()
  })

  it('two users can have same slug (composite UNIQUE)', async () => {
    const a = await createUser({ username: 'alice' })
    const b = await createUser({ username: 'bob' })
    const aBook = await createBook(db, a.id, {
      title: '데미안', author: '헤세', genre: '소설',
      readDate: '2025-01-01', rating: 5, content: '', tags: [],
    })
    const bBook = await createBook(db, b.id, {
      title: '데미안', author: '헤세', genre: '소설',
      readDate: '2025-01-01', rating: 5, content: '', tags: [],
    })
    expect(aBook.slug).toBe(bBook.slug)  // 둘 다 'demian' 같은 slug
    expect(aBook.authorUserId).not.toBe(bBook.authorUserId)
  })
})
```

- [ ] **Step 2: 통과 확인**

Run: `pnpm test books-scoping`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/integration/books-scoping.test.ts
git commit -m "test: book queries are properly user-scoped"
```

---

### Task 25: E2E 시나리오 5개 작성

**Files:**
- Create: `tests/e2e/anonymous-landing.spec.ts`
- Create: `tests/e2e/onboarding.spec.ts`
- Create: `tests/e2e/data-isolation.spec.ts`
- Create: `tests/e2e/dynamic-title.spec.ts`
- Create: `tests/e2e/password-reset-and-delete.spec.ts`

- [ ] **Step 1: 기존 e2e 파일 패턴 확인**

Run: `ls tests/e2e/ && head -40 tests/e2e/*.spec.ts | head -80`

기존 패턴(setup, helper)을 그대로 따라간다. admin seed는 playwright globalSetup 또는 beforeAll에서 처리.

- [ ] **Step 2: anonymous-landing.spec.ts 작성**

```ts
import { test, expect } from '@playwright/test'

test('비로그인 / 진입 시 "누구의 서재" 안내', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '누구의 서재' })).toBeVisible()
  await expect(page.getByRole('link', { name: '로그인' })).toBeVisible()
})

test('비로그인 /books 진입 시 /login redirect', async ({ page }) => {
  await page.goto('/books')
  await expect(page).toHaveURL(/\/login/)
})

test('비로그인 /admin 진입 시 /login redirect', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 3: onboarding.spec.ts 작성**

```ts
import { test, expect } from '@playwright/test'

const ADMIN_USER = process.env.E2E_ADMIN_USERNAME ?? 'sehee'
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'password1234'
const DEFAULT_PW = process.env.DEFAULT_USER_PASSWORD ?? 'welcome1234'

test('신규 사용자 온보딩 — 생성 후 기본 비번 로그인 → mcp 강제 변경', async ({ page }) => {
  // 1. admin 로그인
  await page.goto('/login')
  await page.getByLabel('아이디').fill(ADMIN_USER)
  await page.getByLabel('비밀번호').fill(ADMIN_PASS)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL('/')

  // 2. 사용자 관리 → 새 멤버 생성
  await page.goto('/admin/users')
  await page.getByRole('button', { name: '신규 사용자' }).click()
  const uname = `member${Date.now() % 100000}`
  await page.getByLabel(/아이디/).fill(uname)
  await page.getByRole('button', { name: '생성' }).click()
  await expect(page.getByText(uname)).toBeVisible()

  // 3. 로그아웃
  await page.getByText('▾').click()
  await page.getByRole('button', { name: '로그아웃' }).click()

  // 4. 기본 비번으로 로그인 → 강제 변경 페이지
  await page.goto('/login')
  await page.getByLabel('아이디').fill(uname)
  await page.getByLabel('비밀번호').fill(DEFAULT_PW)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/settings\/password/)
  await expect(page.getByText('기본 비밀번호를 사용 중')).toBeVisible()

  // 5. confirm 불일치 → 에러
  await page.getByLabel('현재 비밀번호').fill(DEFAULT_PW)
  await page.getByLabel('새 비밀번호', { exact: true }).fill('newpassword1')
  await page.getByLabel('새 비밀번호 확인').fill('different___')
  await expect(page.getByText('비밀번호가 일치하지 않습니다')).toBeVisible()

  // 6. 일치 → 변경 성공
  await page.getByLabel('새 비밀번호 확인').fill('newpassword1')
  await page.getByRole('button', { name: '변경' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText(`${uname}의 서재`)).toBeVisible()
})
```

- [ ] **Step 4: data-isolation.spec.ts 작성**

```ts
import { test, expect } from '@playwright/test'

// 사전 조건: 두 사용자 alice, bob이 있고, 각자 한 권씩 책을 가짐
// admin이 두 명을 생성하고 각자 로그인해서 책을 만드는 흐름을 시나리오에 포함

test('데이터 격리 — A의 책은 B에게 안 보이고 URL 직접 진입 시 404', async ({ page, context }) => {
  // 이 시나리오는 두 사용자가 이미 시드되어 있다고 가정 (별도 setup 또는 admin via UI)
  // 구체 시나리오는 기존 e2e 패턴에 맞춰 작성

  // 단순화: 두 사용자가 같은 slug로 책을 등록할 수 있는지 검증
  // (전체 흐름은 onboarding.spec.ts와 결합)

  test.skip(true, '시나리오 구체화 후 활성화 — 아래 단계 참고')
  // [Pending — 다음 단계에서 채움]
  // 1. admin 로그인 → alice, bob 생성
  // 2. alice 로그인 → /admin/new → "데미안" 책 생성
  // 3. URL 기록 (예: /books/demian)
  // 4. 로그아웃 → bob 로그인 → /books 진입 → "데미안" 안 보임
  // 5. bob이 /books/demian 직접 URL 진입 → 404
  // 6. bob도 /admin/new → "데미안" 책 생성 (slug 충돌 없음)
})
```

> `★ Note:` E2E 시나리오 구체화는 실행 단계에서 기존 패턴에 맞춰 보강. test.skip을 풀고 단계별 코드로 채워야 함. 위 주석을 그대로 사용하지 말고 *실제 코드*로 변환할 것 — admin login → 사용자 생성 → 로그아웃 → 멤버 로그인 → 책 등록 같은 helper로 추출.

- [ ] **Step 5: dynamic-title.spec.ts 작성**

```ts
import { test, expect } from '@playwright/test'

test('헤더 사이트 제목 동적 변경', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header').getByText('누구의 서재')).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('아이디').fill(process.env.E2E_ADMIN_USERNAME ?? 'sehee')
  await page.getByLabel('비밀번호').fill(process.env.E2E_ADMIN_PASSWORD ?? 'password1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('header').getByText(/\S의 서재$/)).toBeVisible()  // X의 서재 형식

  // displayName 변경 → 헤더 즉시 반영
  await page.goto('/settings/profile')
  await page.getByLabel('표시 이름').fill('변경된이름')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.locator('header').getByText('변경된이름의 서재')).toBeVisible()
})
```

- [ ] **Step 6: password-reset-and-delete.spec.ts 작성**

(onboarding과 비슷한 흐름 — admin이 reset 클릭 → 멤버 재로그인 → 강제 변경. admin이 삭제 → 그 사용자로 로그인 안 됨)

```ts
import { test, expect } from '@playwright/test'

test('비밀번호 reset → 강제 변경 페이지', async ({ page }) => {
  // 사전: admin이 로그인된 상태, 멤버 1명 이미 존재
  // 1. admin 로그인 → /admin/users
  // 2. 멤버 행의 "비번 reset" 클릭 → confirm 수락
  // 3. 멤버로 로그인 시도 (기본 비번) → /settings/password redirect 확인
  test.skip(true, '시나리오 구체화 후 활성화 — admin 로그인 + 멤버 생성 helper로 추출')
})

test('admin은 본인을 삭제할 수 없다', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('아이디').fill(process.env.E2E_ADMIN_USERNAME ?? 'sehee')
  await page.getByLabel('비밀번호').fill(process.env.E2E_ADMIN_PASSWORD ?? 'password1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await page.goto('/admin/users')
  const adminRow = page.locator('tr', { hasText: process.env.E2E_ADMIN_USERNAME ?? 'sehee' })
  await expect(adminRow.getByRole('button', { name: '삭제' })).toBeDisabled()
})
```

- [ ] **Step 7: 기존 E2E의 로그인 입력 패치**

기존 `tests/e2e/*.spec.ts`에서 `getByLabel('비밀번호')` 직전에 `getByLabel('아이디').fill(...)`이 없으면 추가.

Run: `grep -l "getByLabel('비밀번호')" tests/e2e/`

각 파일에 아이디 입력 라인 한 줄씩 추가.

- [ ] **Step 8: E2E 실행**

Run: `pnpm e2e --reporter=line` (백그라운드 또는 timeout 늘려서)
Expected: 일부 시나리오 skip, 나머지 PASS

- [ ] **Step 9: 커밋**

```bash
git add tests/e2e/
git commit -m "test(e2e): add multiuser scenarios (anonymous landing, onboarding, dynamic title, admin self-delete)"
```

---

## Phase 6: Deployment

### Task 26: 환경변수 & README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: .env.example 업데이트**

```
# Turso DB
TURSO_URL=file:./local.db
TURSO_TOKEN=

# 세션 JWT 서명 키 (32자 이상)
AUTH_SECRET=

# 초기 admin 시드 (seed:admin 스크립트가 한 번 사용)
INITIAL_ADMIN_USERNAME=
INITIAL_ADMIN_PASSWORD=

# 신규 사용자/비번 reset 시 부여되는 기본 비밀번호 (8자 이상)
DEFAULT_USER_PASSWORD=
```

- [ ] **Step 2: README.md 멀티유저 섹션 추가**

기존 README에 다음 섹션 추가 (구체 위치는 기존 구조에 맞춰):

```markdown
## 멀티유저 설정

이 사이트는 멀티유저 + 완전 비공개 서재 모델입니다. 각 사용자는 본인 책장만 봅니다.

### 초기 admin 시드

`.env.local`에 다음을 설정:

```
INITIAL_ADMIN_USERNAME=<원하는 아이디 (한글 OK)>
INITIAL_ADMIN_PASSWORD=<8자 이상>
DEFAULT_USER_PASSWORD=<신규 멤버에게 부여되는 기본 비번, 8자 이상>
```

그리고:

```bash
pnpm drizzle-kit push   # 스키마 적용
pnpm run seed:admin     # 첫 admin 1명 생성 (멱등)
```

### 새 사용자 추가

admin으로 로그인 → 우측 상단 메뉴 → "사용자 관리" → "신규 사용자" → 아이디 입력.
새 사용자에게 `DEFAULT_USER_PASSWORD` 값을 알려주면 첫 로그인 시 강제 변경됩니다.

### 비밀번호 reset

admin이 사용자 관리에서 "비번 reset" 클릭 → 그 사용자는 기본 비번으로 다시 로그인 후 강제 변경.
```

- [ ] **Step 3: 커밋**

```bash
git add .env.example README.md
git commit -m "docs: multiuser setup instructions"
```

---

### Task 27: scripts/migrate-existing-books.ts 작성

**Files:**
- Create: `scripts/migrate-existing-books.ts`
- Modify: `package.json` (scripts.migrate:existing-books 추가)

- [ ] **Step 1: 스크립트 작성**

`scripts/migrate-existing-books.ts`:

```ts
import 'dotenv/config'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { users, books } from '../src/lib/db/schema'
import { normalizeUsername, isValidUsername } from '../src/lib/username-normalize'

async function main() {
  const usernameRaw = process.env.LEGACY_OWNER_USERNAME
  const passwordHash = process.env.LEGACY_OWNER_PASSWORD_HASH
  if (!usernameRaw || !passwordHash) {
    throw new Error('LEGACY_OWNER_USERNAME and LEGACY_OWNER_PASSWORD_HASH must be set')
  }
  if (!passwordHash.startsWith('$2a$') && !passwordHash.startsWith('$2b$') && !passwordHash.startsWith('$2y$')) {
    throw new Error('LEGACY_OWNER_PASSWORD_HASH must be a bcrypt hash ($2a$/$2b$/$2y$)')
  }
  const username = normalizeUsername(usernameRaw)
  if (!isValidUsername(username)) {
    throw new Error(`Invalid username: ${usernameRaw}`)
  }

  // 1) 사용자 존재 확인. 없으면 INSERT.
  let owner = (
    await db.select().from(users).where(eq(users.username, username)).limit(1)
  )[0]
  if (!owner) {
    const [inserted] = await db
      .insert(users)
      .values({
        username,
        displayName: usernameRaw.trim(),
        passwordHash,         // 해시 그대로 저장 (bcrypt 재실행 X)
        role: 'member',
        mustChangePassword: 0,
        createdAt: Date.now(),
      })
      .returning()
    owner = inserted
    console.log(`Inserted legacy owner: ${owner.username} (id=${owner.id})`)
  } else {
    console.log(`Legacy owner already exists: ${owner.username} (id=${owner.id})`)
  }

  // 2) author_user_id가 NULL인 책을 owner.id로 backfill.
  const orphans = await db
    .select({ id: books.id })
    .from(books)
    .where(isNull(books.authorUserId))
  if (orphans.length === 0) {
    console.log('All books already have an author_user_id; nothing to backfill.')
    return
  }
  await db
    .update(books)
    .set({ authorUserId: owner.id })
    .where(isNull(books.authorUserId))
  console.log(`Backfilled ${orphans.length} books with author_user_id=${owner.id}`)

  // 3) 검증: NULL이 남아있지 않은지 확인.
  const remaining = await db
    .select({ id: books.id })
    .from(books)
    .where(isNull(books.authorUserId))
  if (remaining.length > 0) {
    throw new Error(`Backfill incomplete: ${remaining.length} books still NULL`)
  }
  console.log('Verified: no NULL author_user_id remaining.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: package.json scripts 추가**

```json
{
  "scripts": {
    "...": "...",
    "seed:admin": "tsx scripts/seed-admin.ts",
    "migrate:existing-books": "tsx scripts/migrate-existing-books.ts"
  }
}
```

- [ ] **Step 3: 로컬 테스트 (책이 있는 로컬 DB가 있다면)**

`.env.local`에 잠시:

```
LEGACY_OWNER_USERNAME=sayhee
LEGACY_OWNER_PASSWORD_HASH=\$2a\$12\$JUy9.QnW.Y9COhtlFHb2FOlbzqubuoxEBcq75CUbNHfC8RYYAaM7C
```

(`$`를 `\$`로 escape — dotenv-expand가 `$2a`, `$12`를 변수 참조로 해석하지 못하게.)

Run: `pnpm run migrate:existing-books`
Expected: `Inserted legacy owner: sayhee (id=2)` + `Backfilled N books ...` + `Verified: ...`

다시 실행 시:
Expected: `Legacy owner already exists: sayhee` + `All books already have an author_user_id; nothing to backfill.`

- [ ] **Step 4: 커밋**

```bash
git add scripts/migrate-existing-books.ts package.json
git commit -m "feat(migrate): script to backfill existing books to a member account"
```

---

### Task 28: Production 마이그레이션 (책 backfill + NOT NULL 토글)

**Files:** (no code — operational steps + schema toggle)

- [ ] **Step 1: 사전 백업 (prod)**

Run:

```bash
turso db shell <db-name> ".dump" > backup-pre-multiuser-$(date +%Y%m%d-%H%M%S).sql
```

기존 책 권수 확인:

```bash
turso db shell <db-name> "SELECT COUNT(*) FROM books;"
```

→ 결과 기록 (N)

- [ ] **Step 2: Vercel 환경변수 정리**

Vercel 프로젝트 → Settings → Environment Variables:

- `AUTH_SECRET` (기존 값 유지 — 32자 이상인지 확인)
- `ADMIN_PASSWORD_HASH` → **현재 값 복사해서 안전한 곳에 백업한 뒤 삭제**
- `INITIAL_ADMIN_USERNAME` = `hammer_turtle`
- `INITIAL_ADMIN_PASSWORD` = (8자 이상의 평문)
- `LEGACY_OWNER_USERNAME` = `sayhee`
- `LEGACY_OWNER_PASSWORD_HASH` = `$2a$12$JUy9.QnW.Y9COhtlFHb2FOlbzqubuoxEBcq75CUbNHfC8RYYAaM7C`
  (Vercel UI에 직접 입력 시 escape 불필요 — dotenv 안 거침)
- `DEFAULT_USER_PASSWORD` = (8자 이상의 평문)

- [ ] **Step 3: 로컬에서 prod 자격증명으로 1차 push (NULLABLE FK까지)**

`.env.local` 임시 백업 후 prod 값 채움 (TURSO_URL, TURSO_TOKEN을 prod로):

Run:

```bash
pnpm drizzle-kit push
```

Expected: `[✓] Changes applied` — users 신설 + books.author_user_id NULLABLE + composite UNIQUE 적용.

- [ ] **Step 4: prod admin seed**

Run:

```bash
INITIAL_ADMIN_USERNAME=hammer_turtle \
INITIAL_ADMIN_PASSWORD=<평문> \
pnpm run seed:admin
```

Expected: `Seeded admin user: hammer_turtle (id=1)`

- [ ] **Step 5: prod 책 backfill**

Run:

```bash
LEGACY_OWNER_USERNAME=sayhee \
LEGACY_OWNER_PASSWORD_HASH='$2a$12$JUy9.QnW.Y9COhtlFHb2FOlbzqubuoxEBcq75CUbNHfC8RYYAaM7C' \
pnpm run migrate:existing-books
```

(쉘에서 직접 실행 시 single quote로 감싸서 `$` escape 우회.)

Expected:
- `Inserted legacy owner: sayhee (id=2)`
- `Backfilled N books with author_user_id=2`
- `Verified: no NULL author_user_id remaining.`

- [ ] **Step 6: schema.ts에서 `author_user_id`를 NOT NULL로 토글**

`src/lib/db/schema.ts:7-9` 영역의 books.authorUserId에 `.notNull()` 추가:

```ts
authorUserId: integer('author_user_id')
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),
```

(Task 1에서 적었던 NULLABLE 코멘트는 삭제.)

- [ ] **Step 7: 2차 마이그레이션 generate + push**

Run:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

Expected: `[✓] Changes applied` — drizzle-kit이 table-rename + INSERT SELECT 패턴으로 NOT NULL 제약을 books 테이블에 재적용.

- [ ] **Step 8: 검증 SQL**

```bash
turso db shell <db-name> "SELECT COUNT(*) FROM users;"
# Expected: 2 (hammer_turtle + sayhee)

turso db shell <db-name> "SELECT COUNT(*) FROM books WHERE author_user_id IS NULL;"
# Expected: 0

turso db shell <db-name> "SELECT COUNT(*) FROM books;"
# Expected: N (Step 1에서 기록한 값과 동일)
```

- [ ] **Step 9: schema NOT NULL 토글 커밋 + 코드 push (CI → auto-deploy)**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): make books.author_user_id NOT NULL after backfill"
git push origin main
```

Vercel이 자동 배포.

- [ ] **Step 10: prod smoke test**

배포 완료 후 (https://<domain>):

1. 비로그인 `/` 진입 → "누구의 서재" 안내 + 로그인 버튼만 표시
2. `/books` 직접 진입 → `/login` redirect
3. **sayhee로 로그인** → 헤더 "sayhee의 서재" → 기존 책 N권 그대로 보임 → 한 권 상세 진입 OK
4. 로그아웃 → **hammer_turtle로 로그인** → 헤더 "hammer_turtle의 서재" → 책 0권 (사용자 분리 검증)
5. `/admin/users` 진입 → 행 2개 (hammer_turtle, sayhee), sayhee의 책 개수 = N
6. hammer_turtle 본인 행의 삭제 버튼이 비활성인지 확인
7. hammer_turtle이 `/books/<sayhee의 책 slug>` 직접 URL 진입 → 404 (admin도 못 봄)

- [ ] **Step 11: 사후 정리**

```bash
# .env.local에서 prod 자격증명 제거, 로컬 값 복원
git checkout .env.local  # 또는 백업에서 복원
```

---

## Self-Review 체크리스트

이 plan을 실행 시작하기 전 한 번 훑고:

- [ ] spec의 §3 (데이터 모델) → Task 1에서 users + books 변경 적용. books.author_user_id는 Task 1에서 NULLABLE, Task 28에서 NOT NULL로 토글.
- [ ] spec의 §4 (인증) → Task 4 (auth.ts) + Task 5 (helpers) + Task 6 (middleware)에서 다 다룸
- [ ] spec의 §5 API 매트릭스 → Task 9~15에서 모든 라우트 커버
- [ ] spec의 §6 UI → Task 16~22에서 모든 페이지/컴포넌트 커버
- [ ] spec의 §7 마이그레이션 → Task 27 (`migrate-existing-books.ts` 작성) + Task 28 (prod 실행: 1차 push → admin seed → backfill → NOT NULL 토글 → 2차 push)
- [ ] spec의 §8 테스트 → Task 23 (인프라) + Task 24 (integration) + Task 25 (E2E 5개)
- [ ] 기존 책이 N권 있고 모두 `sayhee` member 소유로 backfill되는지 — Task 27/28의 검증 step에서 보장
- [ ] `hammer_turtle` admin과 `sayhee` member가 분리된 두 계정인지 — Task 28 Step 4/5
- [ ] 글방(writings) 관련 — *이 plan에 없음, Plan 2에서 처리*

## 다음 plan

Plan 2: 글방(writings) 추가 — `docs/superpowers/plans/2026-05-26-writings-feature.md`에서 작성 예정.
