# 독후감 사이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1인용 독후감 사이트를 Next.js 16 + Drizzle + Turso로 구축한다. 읽기는 공개, 쓰기는 비밀번호 보호.

**Architecture:** Next.js App Router 풀스택. 서버 컴포넌트에서 Drizzle ORM으로 libsql/Turso 조회. `/admin/*`은 Edge middleware로 JWT 쿠키 검증. 본문은 Toast UI Editor로 작성·마크다운 저장.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Drizzle ORM, libsql/Turso, Toast UI Editor, Zod, bcrypt, jose, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-25-book-report-site-design.md`

---

## File Structure

작업 중 생성하거나 수정할 파일 매핑. 각 파일의 단일 책임을 명시한다.

```
book-report/
├─ package.json                          # pnpm 의존성·스크립트
├─ pnpm-lock.yaml                        # (자동 생성)
├─ tsconfig.json                         # TS 설정
├─ next.config.ts                        # Next.js 설정
├─ tailwind.config.ts                    # Tailwind v4 설정 (대부분 globals.css에서 @theme)
├─ drizzle.config.ts                     # 마이그레이션 설정
├─ vitest.config.ts                      # 단위 테스트 설정 (jsdom env)
├─ playwright.config.ts                  # E2E 설정
├─ .env.example                          # 환경변수 템플릿
├─ .env.local                            # 로컬 시크릿 (gitignore)
├─ src/
│  ├─ middleware.ts                      # /admin/* 인증 가드
│  ├─ app/
│  │  ├─ layout.tsx                      # 루트 레이아웃 + 네비
│  │  ├─ globals.css                     # Tailwind import + 테마 토큰
│  │  ├─ page.tsx                        # 홈 (장르 그리드 + 최근 6권)
│  │  ├─ not-found.tsx                   # 404
│  │  ├─ error.tsx                       # 500
│  │  ├─ books/
│  │  │  ├─ page.tsx                     # 목록 + 필터 + 검색
│  │  │  └─ [slug]/page.tsx              # 상세
│  │  ├─ login/page.tsx                  # 로그인 폼
│  │  ├─ admin/
│  │  │  ├─ new/page.tsx                 # 새 글
│  │  │  └─ edit/[id]/page.tsx           # 수정
│  │  └─ api/
│  │     ├─ login/route.ts               # POST: 비번 검증 → 쿠키 발급
│  │     ├─ logout/route.ts              # POST: 쿠키 삭제
│  │     ├─ books/route.ts               # POST: 책 생성
│  │     ├─ books/[id]/route.ts          # PUT/DELETE
│  │     └─ tags/suggest/route.ts        # GET: 태그 자동완성
│  ├─ components/
│  │  ├─ BookCard.tsx                    # 목록 카드
│  │  ├─ BookForm.tsx                    # 작성/수정 공용 폼
│  │  ├─ RatingStars.tsx                 # 별점 표시·입력
│  │  ├─ GenreBadge.tsx                  # 장르 배지
│  │  ├─ TagInput.tsx                    # 다중 태그 + 자동완성
│  │  ├─ SearchBox.tsx                   # 검색창
│  │  └─ Filters.tsx                     # 장르/태그/연도 필터
│  └─ lib/
│     ├─ db/
│     │  ├─ schema.ts                    # Drizzle 테이블
│     │  ├─ client.ts                    # libsql 클라이언트
│     │  └─ queries.ts                   # 자주 쓰는 쿼리 함수
│     ├─ auth.ts                         # 쿠키 발급/검증 + bcrypt
│     ├─ genres.ts                       # GENRES 상수
│     ├─ slug.ts                         # 제목 → slug 변환
│     └─ validations.ts                  # Zod 스키마
├─ drizzle/                              # 마이그레이션 (drizzle-kit 자동)
├─ tests/
│  ├─ unit/
│  │  ├─ slug.test.ts
│  │  ├─ validations.test.ts
│  │  ├─ auth.test.ts
│  │  └─ queries.test.ts
│  └─ e2e/
│     ├─ auth.spec.ts                    # 비번 오류 차단
│     └─ golden-path.spec.ts             # 로그인 → 작성 → 목록 노출
└─ .gitignore                            # 이미 생성됨
```

---

# M1 — 부트스트랩

## Task 1: Next.js 16 + Tailwind + TS 프로젝트 생성

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Next.js 프로젝트 부트스트랩**

```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --eslint \
  --tailwind \
  --app \
  --src-dir \
  --no-import-alias \
  --use-pnpm
```

(이미 디렉토리에 파일이 있다는 경고 → `Yes` 진행. `.gitignore`·`docs/` 보존됨)

- [ ] **Step 2: Next.js 버전 16으로 강제 업그레이드**

```bash
pnpm add next@latest react@latest react-dom@latest
pnpm dlx next --version  # 16.x.x 확인
```

- [ ] **Step 3: 개발 서버 기동 확인**

```bash
pnpm dev
```

브라우저 `http://localhost:3000`에서 Next.js 기본 페이지 확인 → `Ctrl+C`로 종료.

- [ ] **Step 4: 루트 레이아웃 정리**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '독후감',
  description: '내가 읽은 책의 기록',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b bg-white">
          <nav className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold">📚 독후감</a>
            <a href="/books" className="text-sm text-neutral-600 hover:text-neutral-900">목록</a>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 홈 페이지 placeholder**

`src/app/page.tsx`:
```tsx
export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">독후감 사이트</h1>
      <p className="mt-2 text-neutral-600">M1 부트스트랩 완료. 아직 데이터 없음.</p>
    </div>
  )
}
```

- [ ] **Step 6: 빌드 확인**

```bash
pnpm build
```
Expected: PASS. 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add .
git commit -m "feat(M1): Next.js 16 + Tailwind + TS 부트스트랩"
```

---

## Task 2: Vitest 설정 + 첫 테스트

**Files:**
- Create: `vitest.config.ts`, `tests/unit/sanity.test.ts`
- Modify: `package.json` (scripts.test)

- [ ] **Step 1: 테스트 도구 설치**

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
```

- [ ] **Step 3: `package.json` scripts에 test 추가**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: sanity 테스트 작성**

`tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('vitest이 동작한다', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: 테스트 실행**

```bash
pnpm test
```
Expected: 1 passed.

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "chore(M1): Vitest 설정 + sanity 테스트"
```

---

# M2 — DB & 모델

## Task 3: 의존성 설치

**Files:** none

- [ ] **Step 1: 런타임/개발 의존성 설치**

```bash
pnpm add drizzle-orm @libsql/client zod bcryptjs jose sonner
pnpm add -D drizzle-kit @types/bcryptjs
```

- [ ] **Step 2: 설치 확인**

```bash
pnpm ls drizzle-orm @libsql/client zod
```
Expected: 모두 표시됨.

- [ ] **Step 3: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(M2): runtime/dev 의존성 설치"
```

---

## Task 4: 환경변수 설정

**Files:**
- Create: `.env.example`, `.env.local`

- [ ] **Step 1: `.env.example` 작성**

```env
# Turso DB
TURSO_URL=file:./local.db
TURSO_TOKEN=

# 인증 (bcrypt 해시는 별도 스크립트로 생성)
ADMIN_PASSWORD_HASH=
AUTH_SECRET=
```

- [ ] **Step 2: 로컬 비밀번호 해시 + 시크릿 생성**

```bash
node -e "console.log(require('bcryptjs').hashSync('changeme', 10))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
첫 번째 출력 → `ADMIN_PASSWORD_HASH`에, 두 번째 → `AUTH_SECRET`에 사용.

- [ ] **Step 3: `.env.local` 작성**

```env
TURSO_URL=file:./local.db
TURSO_TOKEN=
ADMIN_PASSWORD_HASH=<step 2의 bcrypt 해시>
AUTH_SECRET=<step 2의 32바이트 hex>
```

- [ ] **Step 4: 커밋 (`.env.local`은 gitignore되어 제외됨)**

```bash
git add .env.example
git commit -m "chore(M2): .env.example 추가 (로컬 비밀은 .env.local)"
```

---

## Task 5: Drizzle 스키마 정의

**Files:**
- Create: `src/lib/db/schema.ts`

- [ ] **Step 1: 스키마 작성**

`src/lib/db/schema.ts`:
```ts
import { sqliteTable, integer, text, primaryKey, index, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

export const books = sqliteTable(
  'books',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    author: text('author').notNull(),
    genre: text('genre').notNull(),
    readDate: text('read_date').notNull(),         // 'YYYY-MM-DD'
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    slug: text('slug').notNull().unique(),
    createdAt: integer('created_at').notNull(),    // unix ms
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    titleIdx: index('idx_books_title').on(t.title),
    authorIdx: index('idx_books_author').on(t.author),
    genreIdx: index('idx_books_genre').on(t.genre),
    dateIdx: index('idx_books_date').on(t.readDate),
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

export const booksRelations = relations(books, ({ many }) => ({
  bookTags: many(bookTags),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
}))
export const bookTagsRelations = relations(bookTags, ({ one }) => ({
  book: one(books, { fields: [bookTags.bookId], references: [books.id] }),
  tag: one(tags, { fields: [bookTags.tagId], references: [tags.id] }),
}))

export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type Tag = typeof tags.$inferSelect
```

- [ ] **Step 2: TS 컴파일 확인**

```bash
pnpm exec tsc --noEmit
```
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(M2): Drizzle 스키마 정의 (books, tags, book_tags)"
```

---

## Task 6: libsql 클라이언트 + drizzle.config

**Files:**
- Create: `src/lib/db/client.ts`, `drizzle.config.ts`

- [ ] **Step 1: 클라이언트 작성**

`src/lib/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.TURSO_URL
if (!url) throw new Error('TURSO_URL is not set')

const libsql = createClient({
  url,
  authToken: process.env.TURSO_TOKEN || undefined,
})

export const db = drizzle(libsql, { schema })
```

- [ ] **Step 2: drizzle.config.ts**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'turso',
  dbCredentials: {
    url: process.env.TURSO_URL!,
    authToken: process.env.TURSO_TOKEN,
  },
})
```

- [ ] **Step 3: 마이그레이션 생성**

```bash
pnpm exec drizzle-kit generate
```
Expected: `drizzle/0000_*.sql` 생성됨.

- [ ] **Step 4: 로컬 DB에 push**

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit push
```
(만약 dotenv 명령이 없으면: `pnpm add -D dotenv-cli` 후 재시도)

Expected: `local.db` 파일 생성, books/tags/book_tags 테이블 만들어짐.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/client.ts drizzle.config.ts drizzle/
git commit -m "feat(M2): libsql 클라이언트 + drizzle-kit 마이그레이션"
```

---

## Task 7: lib/genres.ts (상수)

**Files:**
- Create: `src/lib/genres.ts`

- [ ] **Step 1: 작성**

```ts
export const GENRES = [
  '소설', '추리/스릴러', '판타지/SF', '시', '에세이',
  '인문/철학', '역사', '사회/경제', '과학/IT', '자기계발',
  '예술', '종교', '만화', '기타',
] as const

export type Genre = typeof GENRES[number]

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value)
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/genres.ts
git commit -m "feat(M2): GENRES 상수 + Genre 타입"
```

---

## Task 8: lib/slug.ts (TDD)

**Files:**
- Create: `tests/unit/slug.test.ts`, `src/lib/slug.ts`

- [ ] **Step 1: 테스트 먼저 작성**

`tests/unit/slug.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toSlug, uniqueSlug } from '@/lib/slug'

describe('toSlug', () => {
  it('영문은 소문자 + 하이픈으로 변환', () => {
    expect(toSlug('The Stranger')).toBe('the-stranger')
  })
  it('한글은 유지하고 공백만 하이픈으로', () => {
    expect(toSlug('이방인 카뮈')).toBe('이방인-카뮈')
  })
  it('특수문자는 제거', () => {
    expect(toSlug('Hello, World!')).toBe('hello-world')
  })
  it('연속 하이픈은 한 번으로 압축', () => {
    expect(toSlug('a  --  b')).toBe('a-b')
  })
  it('앞뒤 하이픈은 제거', () => {
    expect(toSlug('-test-')).toBe('test')
  })
  it('빈 문자열은 "untitled"', () => {
    expect(toSlug('')).toBe('untitled')
    expect(toSlug('!!!')).toBe('untitled')
  })
  it('50자로 자른다', () => {
    expect(toSlug('a'.repeat(100)).length).toBeLessThanOrEqual(50)
  })
})

describe('uniqueSlug', () => {
  it('중복 없으면 그대로', () => {
    expect(uniqueSlug('foo', [])).toBe('foo')
  })
  it('중복이면 -2 접미사', () => {
    expect(uniqueSlug('foo', ['foo'])).toBe('foo-2')
  })
  it('-2도 있으면 -3', () => {
    expect(uniqueSlug('foo', ['foo', 'foo-2'])).toBe('foo-3')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm test
```
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`src/lib/slug.ts`:
```ts
export function toSlug(input: string): string {
  let s = input.toLowerCase()
  // 한글·영숫자만 허용, 나머지는 공백/하이픈으로
  s = s.replace(/[^a-z0-9가-힣]+/g, '-')
  s = s.replace(/-+/g, '-')
  s = s.replace(/^-+|-+$/g, '')
  if (s.length === 0) return 'untitled'
  if (s.length > 50) s = s.slice(0, 50).replace(/-+$/, '')
  return s
}

export function uniqueSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add tests/unit/slug.test.ts src/lib/slug.ts
git commit -m "feat(M2): slug 변환 함수 + 중복 처리 (TDD)"
```

---

## Task 9: lib/validations.ts (Zod, TDD)

**Files:**
- Create: `tests/unit/validations.test.ts`, `src/lib/validations.ts`

- [ ] **Step 1: 테스트**

`tests/unit/validations.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { CreateBookSchema, UpdateBookSchema } from '@/lib/validations'

const valid = {
  title: '이방인',
  author: '알베르 카뮈',
  genre: '소설',
  readDate: '2026-05-01',
  rating: 5,
  content: '인상 깊었다.',
  tags: ['실존주의', '여름'],
}

describe('CreateBookSchema', () => {
  it('유효한 입력 통과', () => {
    expect(CreateBookSchema.parse(valid)).toMatchObject(valid)
  })
  it('잘못된 장르 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, genre: '경제경영' })).toThrow()
  })
  it('별점 범위 밖 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, rating: 6 })).toThrow()
    expect(() => CreateBookSchema.parse({ ...valid, rating: 0 })).toThrow()
  })
  it('날짜 형식 강제', () => {
    expect(() => CreateBookSchema.parse({ ...valid, readDate: '2026/05/01' })).toThrow()
  })
  it('빈 제목 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, title: '' })).toThrow()
  })
  it('태그 공백 trim + 중복 제거', () => {
    const r = CreateBookSchema.parse({ ...valid, tags: [' a ', 'a', 'b'] })
    expect(r.tags).toEqual(['a', 'b'])
  })
})

describe('UpdateBookSchema', () => {
  it('모든 필드 optional', () => {
    expect(UpdateBookSchema.parse({})).toEqual({})
    expect(UpdateBookSchema.parse({ rating: 3 })).toEqual({ rating: 3 })
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

- [ ] **Step 3: 구현**

`src/lib/validations.ts`:
```ts
import { z } from 'zod'
import { GENRES } from './genres'

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

export const UpdateBookSchema = CreateBookSchema.partial()
export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const LoginSchema = z.object({
  password: z.string().min(1),
})
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add tests/unit/validations.test.ts src/lib/validations.ts
git commit -m "feat(M2): Zod 검증 스키마 (CreateBook/UpdateBook/Login)"
```

---

## Task 10: lib/db/queries.ts (in-memory libsql, TDD)

**Files:**
- Create: `tests/unit/queries.test.ts`, `src/lib/db/queries.ts`

- [ ] **Step 1: 테스트 작성**

`tests/unit/queries.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '@/lib/db/schema'
import { createBook, listBooks, getBookBySlug, searchBooks, suggestTags, listTagsForBook } from '@/lib/db/queries'
import migration from '../../drizzle/0000_init.sql?raw'

function makeDb() {
  const client = createClient({ url: ':memory:' })
  return { client, db: drizzle(client, { schema }) }
}

async function setup() {
  const { client, db } = makeDb()
  // 마이그레이션 SQL을 한 번에 실행 (statement 단위 분할)
  for (const stmt of migration.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await client.execute(stmt)
  }
  return db
}

describe('queries', () => {
  let db: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => { db = await setup() })

  it('createBook + getBookBySlug', async () => {
    const created = await createBook(db, {
      title: '이방인', author: '카뮈', genre: '소설',
      readDate: '2026-05-01', rating: 5, content: '...', tags: ['t1', 't2'],
    })
    expect(created.slug).toBe('이방인')
    const fetched = await getBookBySlug(db, '이방인')
    expect(fetched?.title).toBe('이방인')
    expect(fetched?.tags.sort()).toEqual(['t1', 't2'])
  })

  it('동일 제목 두 번 → slug 충돌 해소', async () => {
    await createBook(db, { title: '같은책', author: 'a', genre: '소설', readDate: '2026-05-01', rating: 3, tags: [] })
    const b = await createBook(db, { title: '같은책', author: 'b', genre: '소설', readDate: '2026-05-02', rating: 4, tags: [] })
    expect(b.slug).toBe('같은책-2')
  })

  it('listBooks 정렬 (최근 읽은 순)', async () => {
    await createBook(db, { title: 'A', author: 'a', genre: '소설', readDate: '2026-01-01', rating: 3, tags: [] })
    await createBook(db, { title: 'B', author: 'a', genre: '소설', readDate: '2026-03-01', rating: 3, tags: [] })
    const list = await listBooks(db, {})
    expect(list.map((b) => b.title)).toEqual(['B', 'A'])
  })

  it('searchBooks 제목·작가 매치', async () => {
    await createBook(db, { title: '이방인', author: '카뮈', genre: '소설', readDate: '2026-05-01', rating: 5, tags: [] })
    await createBook(db, { title: '페스트', author: '카뮈', genre: '소설', readDate: '2026-04-01', rating: 5, tags: [] })
    const r = await searchBooks(db, '카뮈')
    expect(r.length).toBe(2)
    const r2 = await searchBooks(db, '이방')
    expect(r2.length).toBe(1)
  })

  it('suggestTags 자동완성', async () => {
    await createBook(db, { title: 'a', author: 'a', genre: '소설', readDate: '2026-05-01', rating: 3, tags: ['여름', '여행지에서', '재독'] })
    const r = await suggestTags(db, '여')
    expect(r.sort()).toEqual(['여름', '여행지에서'])
  })
})
```

(`vitest.config.ts`의 `assetsInclude`에 `**/*.sql`을 추가하거나 `?raw` import가 이미 동작하는지 확인. Vite 기본은 `?raw`로 처리 가능.)

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

- [ ] **Step 3: 구현**

`src/lib/db/queries.ts`:
```ts
import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { books, tags as tagsTable, bookTags } from './schema'
import { toSlug, uniqueSlug } from '@/lib/slug'
import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'

type DB = LibSQLDatabase<typeof schema>

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }

async function getOrCreateTagIds(db: DB, names: string[]): Promise<number[]> {
  if (names.length === 0) return []
  const ids: number[] = []
  for (const name of names) {
    const existing = await db.select().from(tagsTable).where(eq(tagsTable.name, name)).limit(1)
    if (existing[0]) {
      ids.push(existing[0].id)
    } else {
      const [inserted] = await db.insert(tagsTable).values({ name }).returning({ id: tagsTable.id })
      ids.push(inserted.id)
    }
  }
  return ids
}

async function attachTags(db: DB, bookId: number, tagIds: number[]) {
  if (tagIds.length === 0) return
  await db.insert(bookTags).values(tagIds.map((tagId) => ({ bookId, tagId }))).onConflictDoNothing()
}

async function tagsOf(db: DB, bookId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tagsTable.name })
    .from(bookTags)
    .innerJoin(tagsTable, eq(bookTags.tagId, tagsTable.id))
    .where(eq(bookTags.bookId, bookId))
  return rows.map((r) => r.name)
}

export async function createBook(db: DB, input: CreateBookInput): Promise<BookWithTags> {
  const base = toSlug(input.title)
  const existingSlugs = await db.select({ slug: books.slug }).from(books).where(like(books.slug, `${base}%`))
  const slug = uniqueSlug(base, existingSlugs.map((r) => r.slug))
  const now = Date.now()
  const [row] = await db
    .insert(books)
    .values({
      title: input.title,
      author: input.author,
      genre: input.genre,
      readDate: input.readDate,
      rating: input.rating,
      content: input.content ?? '',
      slug,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  const tagIds = await getOrCreateTagIds(db, input.tags)
  await attachTags(db, row.id, tagIds)
  return { ...row, tags: await tagsOf(db, row.id) }
}

export async function updateBook(db: DB, id: number, input: UpdateBookInput): Promise<BookWithTags | null> {
  const existing = await db.select().from(books).where(eq(books.id, id)).limit(1)
  if (!existing[0]) return null
  const next = {
    ...existing[0],
    ...input,
    updatedAt: Date.now(),
  }
  const [row] = await db.update(books).set(next).where(eq(books.id, id)).returning()
  if (input.tags) {
    await db.delete(bookTags).where(eq(bookTags.bookId, id))
    const tagIds = await getOrCreateTagIds(db, input.tags)
    await attachTags(db, id, tagIds)
  }
  return { ...row, tags: await tagsOf(db, id) }
}

export async function deleteBook(db: DB, id: number): Promise<boolean> {
  const r = await db.delete(books).where(eq(books.id, id)).returning({ id: books.id })
  return r.length > 0
}

export async function getBookBySlug(db: DB, slug: string): Promise<BookWithTags | null> {
  const [row] = await db.select().from(books).where(eq(books.slug, slug)).limit(1)
  if (!row) return null
  return { ...row, tags: await tagsOf(db, row.id) }
}

export async function getBookById(db: DB, id: number): Promise<BookWithTags | null> {
  const [row] = await db.select().from(books).where(eq(books.id, id)).limit(1)
  if (!row) return null
  return { ...row, tags: await tagsOf(db, row.id) }
}

export interface ListFilters {
  genre?: string
  tag?: string
  year?: string
  sort?: 'date' | 'rating'
}

export async function listBooks(db: DB, f: ListFilters): Promise<BookWithTags[]> {
  const where = [] as ReturnType<typeof eq>[]
  if (f.genre) where.push(eq(books.genre, f.genre))
  if (f.year) where.push(like(books.readDate, `${f.year}-%`))

  let rows
  if (f.tag) {
    const tagId = await db.select({ id: tagsTable.id }).from(tagsTable).where(eq(tagsTable.name, f.tag)).limit(1)
    if (!tagId[0]) return []
    const ordered = f.sort === 'rating' ? desc(books.rating) : desc(books.readDate)
    rows = await db
      .select(books._.columns ? undefined as any : undefined as any)
      .from(books)
      .innerJoin(bookTags, eq(books.id, bookTags.bookId))
      .where(and(eq(bookTags.tagId, tagId[0].id), ...where))
      .orderBy(ordered)
    rows = rows.map((r: any) => r.books)
  } else {
    const ordered = f.sort === 'rating' ? desc(books.rating) : desc(books.readDate)
    rows = await db.select().from(books).where(where.length ? and(...where) : undefined).orderBy(ordered)
  }

  const enriched = await Promise.all(
    rows.map(async (b) => ({ ...b, tags: await tagsOf(db, b.id) }))
  )
  return enriched
}

export async function searchBooks(db: DB, q: string): Promise<BookWithTags[]> {
  const term = `%${q}%`
  const rows = await db
    .select()
    .from(books)
    .where(or(like(books.title, term), like(books.author, term)))
    .orderBy(desc(books.readDate))
  return Promise.all(rows.map(async (b) => ({ ...b, tags: await tagsOf(db, b.id) })))
}

export async function suggestTags(db: DB, q: string): Promise<string[]> {
  const rows = await db
    .select({ name: tagsTable.name })
    .from(tagsTable)
    .where(like(tagsTable.name, `${q}%`))
    .limit(8)
  return rows.map((r) => r.name)
}

export async function listTagsForBook(db: DB, bookId: number): Promise<string[]> {
  return tagsOf(db, bookId)
}

export async function listGenresWithCounts(db: DB): Promise<{ genre: string; count: number }[]> {
  const rows = await db
    .select({ genre: books.genre, count: sql<number>`count(*)`.as('count') })
    .from(books)
    .groupBy(books.genre)
  return rows
}
```

(주의: `listBooks`의 tag join 처리는 위 형태로 두지만, 단위 테스트가 통과하면 그대로 사용. 통과하지 않으면 동등한 쿼리로 단순화.)

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add tests/unit/queries.test.ts src/lib/db/queries.ts
git commit -m "feat(M2): DB 쿼리 함수 (TDD) — CRUD/검색/태그 자동완성"
```

---

# M3 — 공개 페이지

## Task 11: GenreBadge + RatingStars 컴포넌트 (TDD)

**Files:**
- Create: `src/components/GenreBadge.tsx`, `src/components/RatingStars.tsx`, `tests/unit/components.test.tsx`

- [ ] **Step 1: 테스트**

`tests/unit/components.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'

describe('GenreBadge', () => {
  it('장르 이름을 표시한다', () => {
    render(<GenreBadge genre="소설" />)
    expect(screen.getByText('소설')).toBeDefined()
  })
})

describe('RatingStars', () => {
  it('value 만큼 채워진 별을 렌더링', () => {
    const { container } = render(<RatingStars value={3} />)
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(3)
    expect(container.querySelectorAll('[data-filled="false"]').length).toBe(2)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

- [ ] **Step 3: GenreBadge 구현**

`src/components/GenreBadge.tsx`:
```tsx
import type { Genre } from '@/lib/genres'

export function GenreBadge({ genre }: { genre: Genre | string }) {
  return (
    <span className="inline-block rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
      {genre}
    </span>
  )
}
```

- [ ] **Step 4: RatingStars 구현**

`src/components/RatingStars.tsx`:
```tsx
'use client'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const sizeClass = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size]
  const editable = !!onChange
  return (
    <div className={`inline-flex gap-0.5 ${sizeClass}`} aria-label={`별점 ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        const Star = (
          <span data-filled={filled} className={filled ? 'text-amber-500' : 'text-neutral-300'}>
            ★
          </span>
        )
        if (!editable) return <span key={n}>{Star}</span>
      return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            aria-label={`${n}점`}
            className="cursor-pointer"
          >
            {Star}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm test
```

- [ ] **Step 6: 인스톨/import 검증**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 7: 커밋**

```bash
git add src/components/GenreBadge.tsx src/components/RatingStars.tsx tests/unit/components.test.tsx
git commit -m "feat(M3): GenreBadge + RatingStars 컴포넌트 (TDD)"
```

---

## Task 12: BookCard 컴포넌트

**Files:**
- Create: `src/components/BookCard.tsx`

- [ ] **Step 1: 작성**

`src/components/BookCard.tsx`:
```tsx
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { BookWithTags } from '@/lib/db/queries'

export function BookCard({ book }: { book: BookWithTags }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      className="block rounded-lg border bg-white p-4 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-lg line-clamp-2">{book.title}</h3>
        <GenreBadge genre={book.genre} />
      </div>
      <p className="mt-1 text-sm text-neutral-600">{book.author}</p>
      <div className="mt-2 flex items-center justify-between">
        <RatingStars value={book.rating} size="sm" />
        <time className="text-xs text-neutral-500">{book.readDate}</time>
      </div>
      {book.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {book.tags.slice(0, 3).map((t) => (
            <li key={t} className="text-xs text-neutral-500">#{t}</li>
          ))}
        </ul>
      )}
    </Link>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/BookCard.tsx
git commit -m "feat(M3): BookCard 컴포넌트"
```

---

## Task 13: 홈 페이지 (`/`)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 구현**

`src/app/page.tsx`:
```tsx
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listGenresWithCounts } from '@/lib/db/queries'
import { GENRES } from '@/lib/genres'
import { BookCard } from '@/components/BookCard'

export default async function HomePage() {
  const [recent, genreCounts] = await Promise.all([
    listBooks(db, { sort: 'date' }).then((b) => b.slice(0, 6)),
    listGenresWithCounts(db),
  ])
  const countMap = new Map(genreCounts.map((g) => [g.genre, g.count]))

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-xl font-semibold">장르</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {GENRES.map((g) => (
            <Link
              key={g}
              href={`/books?genre=${encodeURIComponent(g)}`}
              className="rounded-lg border bg-white p-4 hover:shadow transition"
            >
              <div className="font-medium">{g}</div>
              <div className="mt-1 text-xs text-neutral-500">{countMap.get(g) ?? 0}권</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">최근 읽은 책</h2>
        {recent.length === 0 ? (
          <p className="text-neutral-500">아직 등록된 책이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recent.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: 개발 서버에서 시각 확인**

```bash
pnpm dev
```
http://localhost:3000 — 장르 그리드 + "아직 등록된 책이 없습니다" 표시. → Ctrl+C 종료.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat(M3): 홈 — 장르 그리드 + 최근 6권"
```

---

## Task 14: 책 목록 페이지 (`/books`)

**Files:**
- Create: `src/app/books/page.tsx`

- [ ] **Step 1: 구현 (필터·검색은 M6에서 컴포넌트화. 여기선 쿼리스트링 처리만)**

`src/app/books/page.tsx`:
```tsx
import { db } from '@/lib/db/client'
import { listBooks, searchBooks } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'

interface SP {
  searchParams: Promise<{ genre?: string; tag?: string; year?: string; q?: string; sort?: string }>
}

export default async function BooksPage({ searchParams }: SP) {
  const sp = await searchParams
  let books
  if (sp.q && sp.q.trim()) {
    books = await searchBooks(db, sp.q.trim())
  } else {
    books = await listBooks(db, {
      genre: sp.genre,
      tag: sp.tag,
      year: sp.year,
      sort: sp.sort === 'rating' ? 'rating' : 'date',
    })
  }
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">
        {sp.q ? `"${sp.q}" 검색 결과` : sp.genre ? `장르: ${sp.genre}` : sp.tag ? `태그: ${sp.tag}` : '전체 책'}
        <span className="ml-2 text-base font-normal text-neutral-500">({books.length}권)</span>
      </h2>
      {books.length === 0 ? (
        <p className="text-neutral-500">결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {books.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/books/page.tsx
git commit -m "feat(M3): /books 목록 페이지 (쿼리스트링 필터)"
```

---

## Task 15: 책 상세 페이지 + 마크다운 렌더링

**Files:**
- Create: `src/app/books/[slug]/page.tsx`, `src/app/not-found.tsx`
- Modify: `package.json` (`@toast-ui/react-editor` 추가)

- [ ] **Step 1: 의존성**

```bash
pnpm add @toast-ui/react-editor @toast-ui/editor
```

- [ ] **Step 2: not-found.tsx**

`src/app/not-found.tsx`:
```tsx
export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-neutral-600">그런 책이 없어요.</p>
    </div>
  )
}
```

- [ ] **Step 3: 상세 페이지 (Viewer는 client component)**

`src/components/MarkdownViewer.tsx`:
```tsx
'use client'

import dynamic from 'next/dynamic'

const Viewer = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Viewer),
  { ssr: false, loading: () => <div className="text-neutral-400">불러오는 중…</div> }
)

export function MarkdownViewer({ initialValue }: { initialValue: string }) {
  return <Viewer initialValue={initialValue} />
}
```

`src/app/books/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getBookBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import Link from 'next/link'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = await getBookBySlug(db, decodeURIComponent(slug))
  if (!book) notFound()

  return (
    <article className="prose max-w-none">
      <header className="not-prose mb-6">
        <div className="flex items-center gap-2">
          <GenreBadge genre={book.genre} />
          <time className="text-sm text-neutral-500">{book.readDate}</time>
        </div>
        <h1 className="mt-2 text-3xl font-bold">{book.title}</h1>
        <p className="mt-1 text-lg text-neutral-700">{book.author}</p>
        <div className="mt-2"><RatingStars value={book.rating} /></div>
        {book.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {book.tags.map((t) => (
              <li key={t}>
                <Link href={`/books?tag=${encodeURIComponent(t)}`} className="text-sm text-neutral-500 hover:text-neutral-800">
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>
      {book.content ? (
        <MarkdownViewer initialValue={book.content} />
      ) : (
        <p className="text-neutral-500">본문이 없습니다.</p>
      )}
    </article>
  )
}
```

- [ ] **Step 4: error.tsx**

`src/app/error.tsx`:
```tsx
'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold">문제가 발생했어요</h1>
      <button onClick={() => reset()} className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white">
        다시 시도
      </button>
    </div>
  )
}
```

- [ ] **Step 5: 시각 확인 (수동)**

```bash
pnpm dev
```
DB에 데이터가 없으니 시드를 먼저 넣어보자. 새 터미널에서:

```bash
pnpm exec dotenv -e .env.local -- tsx -e "import { db } from './src/lib/db/client'; import { createBook } from './src/lib/db/queries'; (async () => { await createBook(db, { title: '이방인', author: '카뮈', genre: '소설', readDate: '2026-05-01', rating: 5, content: '# 테스트\\n\\n인상 깊었다.', tags: ['실존주의'] }); console.log('seeded'); process.exit(0) })()"
```
(필요 시 `pnpm add -D tsx`)

`/books/이방인` 접속 → 본문 마크다운 렌더링 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/books/[slug]/page.tsx src/app/not-found.tsx src/app/error.tsx src/components/MarkdownViewer.tsx package.json pnpm-lock.yaml
git commit -m "feat(M3): 책 상세 + not-found + error 페이지 + Markdown Viewer"
```

---

# M4 — 인증

## Task 16: lib/auth.ts (TDD)

**Files:**
- Create: `tests/unit/auth.test.ts`, `src/lib/auth.ts`

- [ ] **Step 1: 테스트**

`tests/unit/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { verifyPassword, signSession, verifySession } from '@/lib/auth'

beforeAll(() => {
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('s3cret', 10)
  process.env.AUTH_SECRET = 'a'.repeat(64)
})

describe('verifyPassword', () => {
  it('맞으면 true', async () => {
    expect(await verifyPassword('s3cret')).toBe(true)
  })
  it('틀리면 false', async () => {
    expect(await verifyPassword('nope')).toBe(false)
  })
})

describe('session JWT', () => {
  it('서명/검증 라운드트립', async () => {
    const token = await signSession()
    const ok = await verifySession(token)
    expect(ok).toBe(true)
  })
  it('잘못된 토큰은 false', async () => {
    expect(await verifySession('garbage')).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm test
```

- [ ] **Step 3: 구현**

`src/lib/auth.ts`:
```ts
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7  // 7일

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be ≥32 chars')
  return new TextEncoder().encode(s)
}

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash) return false
  return bcrypt.compare(input, hash)
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}

export const SESSION = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm test
```

- [ ] **Step 5: 커밋**

```bash
git add tests/unit/auth.test.ts src/lib/auth.ts
git commit -m "feat(M4): bcrypt 비번 검증 + HS256 JWT 세션 (TDD)"
```

---

## Task 17: /api/login, /api/logout

**Files:**
- Create: `src/app/api/login/route.ts`, `src/app/api/logout/route.ts`

- [ ] **Step 1: /api/login**

`src/app/api/login/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LoginSchema } from '@/lib/validations'
import { verifyPassword, signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '로그인 실패' }, { status: 400 })
  }
  const ok = await verifyPassword(parsed.data.password)
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json({ error: '로그인 실패' }, { status: 401 })
  }
  const token = await signSession()
  const store = await cookies()
  store.set(SESSION.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION.maxAge,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: /api/logout**

`src/app/api/logout/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION } from '@/lib/auth'

export async function POST() {
  const store = await cookies()
  store.set(SESSION.name, '', { path: '/', maxAge: 0 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/login/route.ts src/app/api/logout/route.ts
git commit -m "feat(M4): /api/login, /api/logout"
```

---

## Task 18: middleware.ts

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: 작성**

`src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { verifySession, SESSION } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION.name)?.value
  const ok = await verifySession(token)
  if (ok) return NextResponse.next()
  const url = new URL('/login', req.url)
  url.searchParams.set('from', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*', '/api/books/:path*', '/api/tags/suggest'],
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/middleware.ts
git commit -m "feat(M4): middleware — /admin, /api/books, /api/tags/suggest 보호"
```

---

## Task 19: /login 페이지 + 네비 로그아웃 버튼

**Files:**
- Create: `src/app/login/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 로그인 페이지**

`src/app/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('로그인 실패')
      return
    }
    router.push(sp.get('from') || '/admin/new')
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-bold">관리자 로그인</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded border px-3 py-2"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || pw.length === 0}
          className="w-full rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: 시각 확인**

```bash
pnpm dev
```
`/admin/new` 접근 → `/login`으로 리다이렉트. 잘못된 비번 → 1초 후 에러. 맞으면 `/admin/new`(404)로 이동.

- [ ] **Step 3: 커밋**

```bash
git add src/app/login/page.tsx
git commit -m "feat(M4): 로그인 페이지 — 리다이렉트 흐름"
```

---

# M5 — 작성/수정 (보호)

## Task 20: TagInput 컴포넌트

**Files:**
- Create: `src/components/TagInput.tsx`

- [ ] **Step 1: 작성**

`src/components/TagInput.tsx`:
```tsx
'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export function TagInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!input.trim()) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/tags/suggest?q=${encodeURIComponent(input.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.tags.filter((t: string) => !value.includes(t)))
      }
    }, 200)
  }, [input, value])

  function add(t: string) {
    const trimmed = t.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInput('')
    setSuggestions([])
  }

  function remove(t: string) {
    onChange(value.filter((x) => x !== t))
  }

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-2">
        {value.map((t) => (
          <li key={t} className="inline-flex items-center gap-1 rounded bg-neutral-200 px-2 py-1 text-sm">
            #{t}
            <button type="button" onClick={() => remove(t)} aria-label={`${t} 제거`} className="text-neutral-500 hover:text-neutral-900">
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(input)
          } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
            remove(value[value.length - 1])
          }
        }}
        placeholder="태그 입력 후 Enter"
        className="w-full rounded border px-3 py-2"
      />
      {suggestions.length > 0 && (
        <ul className="mt-1 rounded border bg-white shadow">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s)} className="block w-full px-3 py-1 text-left hover:bg-neutral-100">
                #{s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/TagInput.tsx
git commit -m "feat(M5): TagInput 컴포넌트 (자동완성 + Enter/콤마/Backspace)"
```

---

## Task 21: BookForm 컴포넌트 (Toast UI Editor 통합)

**Files:**
- Create: `src/components/BookForm.tsx`, `src/components/MarkdownEditor.tsx`

- [ ] **Step 1: MarkdownEditor (client-only wrapper)**

`src/components/MarkdownEditor.tsx`:
```tsx
'use client'

import dynamic from 'next/dynamic'
import '@toast-ui/editor/dist/toastui-editor.css'

const Editor = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Editor),
  { ssr: false, loading: () => <div className="h-60 rounded border bg-neutral-50" /> }
)

interface Props {
  value: string
  onChange: (md: string) => void
}

export function MarkdownEditor({ value, onChange }: Props) {
  return (
    <Editor
      initialValue={value || ' '}
      previewStyle="vertical"
      height="400px"
      initialEditType="wysiwyg"
      useCommandShortcut
      onChange={() => {
        const md = (document.querySelector('.toastui-editor-md-container textarea') as HTMLTextAreaElement | null)?.value
        if (typeof md === 'string') onChange(md)
      }}
    />
  )
}
```

(주의: Toast UI Editor의 onChange는 markdown 추출 API가 ref 기반. 위는 단순화된 형태이며, 정확하게는 `editorRef.current?.getInstance().getMarkdown()` 사용. 다음 step의 BookForm에서 ref 기반으로 다시 작성한다.)

- [ ] **Step 2: 수정 — ref 기반 MarkdownEditor**

`src/components/MarkdownEditor.tsx` (재작성):
```tsx
'use client'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import dynamic from 'next/dynamic'
import '@toast-ui/editor/dist/toastui-editor.css'

const Editor = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Editor),
  { ssr: false }
)

export interface MarkdownEditorHandle {
  getMarkdown: () => string
}

interface Props {
  initialValue: string
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(({ initialValue }, ref) => {
  const editorRef = useRef<any>(null)
  useImperativeHandle(ref, () => ({
    getMarkdown: () => editorRef.current?.getInstance().getMarkdown() ?? '',
  }))
  return (
    <Editor
      ref={editorRef}
      initialValue={initialValue || ' '}
      previewStyle="vertical"
      height="400px"
      initialEditType="wysiwyg"
      useCommandShortcut
    />
  )
})
MarkdownEditor.displayName = 'MarkdownEditor'
```

- [ ] **Step 3: BookForm**

`src/components/BookForm.tsx`:
```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GENRES } from '@/lib/genres'
import { RatingStars } from './RatingStars'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'

export interface BookFormValues {
  title: string
  author: string
  genre: string
  readDate: string
  rating: number
  content: string
  tags: string[]
}

interface Props {
  initial?: Partial<BookFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

export function BookForm({ initial, mode }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? GENRES[0])
  const [readDate, setReadDate] = useState(initial?.readDate ?? new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(initial?.rating ?? 3)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const editorRef = useRef<MarkdownEditorHandle>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const content = editorRef.current?.getMarkdown() ?? ''
    const payload = { title, author, genre, readDate, rating, content, tags }

    startTransition(async () => {
      const url = mode === 'create' ? '/api/books' : `/api/books/${initial?.id}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '저장 실패')
        return
      }
      const data = await res.json()
      router.push(`/books/${data.slug}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">작가</label>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">장르</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="mt-1 w-full rounded border px-3 py-2">
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">읽은 날짜</label>
          <input type="date" value={readDate} onChange={(e) => setReadDate(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">별점</label>
        <RatingStars value={rating} onChange={setRating} size="lg" />
      </div>
      <div>
        <label className="block text-sm font-medium">태그</label>
        <TagInput value={tags} onChange={setTags} />
      </div>
      <div>
        <label className="block text-sm font-medium">본문</label>
        <div className="mt-1">
          <MarkdownEditor ref={editorRef} initialValue={initial?.content ?? ''} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
        {pending ? '저장 중…' : mode === 'create' ? '등록' : '수정'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/BookForm.tsx src/components/MarkdownEditor.tsx
git commit -m "feat(M5): BookForm + MarkdownEditor (Toast UI) 컴포넌트"
```

---

## Task 22: API — 책 CRUD

**Files:**
- Create: `src/app/api/books/route.ts`, `src/app/api/books/[id]/route.ts`

- [ ] **Step 1: POST /api/books**

`src/app/api/books/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createBook } from '@/lib/db/queries'
import { CreateBookSchema } from '@/lib/validations'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = CreateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
  }
  const book = await createBook(db, parsed.data)
  return NextResponse.json({ id: book.id, slug: book.slug }, { status: 201 })
}
```

- [ ] **Step 2: PUT/DELETE /api/books/[id]**

`src/app/api/books/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { updateBook, deleteBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  const parsed = UpdateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
  }
  const book = await updateBook(db, numId, parsed.data)
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ id: book.id, slug: book.slug })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const ok = await deleteBook(db, numId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/books/route.ts src/app/api/books/[id]/route.ts
git commit -m "feat(M5): 책 CRUD API (POST/PUT/DELETE)"
```

---

## Task 23: /api/tags/suggest

**Files:**
- Create: `src/app/api/tags/suggest/route.ts`

- [ ] **Step 1: 작성**

`src/app/api/tags/suggest/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { suggestTags } from '@/lib/db/queries'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ tags: [] })
  const tags = await suggestTags(db, q.trim())
  return NextResponse.json({ tags })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/tags/suggest/route.ts
git commit -m "feat(M5): /api/tags/suggest 태그 자동완성"
```

---

## Task 24: /admin/new, /admin/edit/[id] 페이지

**Files:**
- Create: `src/app/admin/new/page.tsx`, `src/app/admin/edit/[id]/page.tsx`

- [ ] **Step 1: /admin/new**

`src/app/admin/new/page.tsx`:
```tsx
import { BookForm } from '@/components/BookForm'

export default function NewBookPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">새 독후감</h1>
      <BookForm mode="create" />
    </div>
  )
}
```

- [ ] **Step 2: /admin/edit/[id]**

`src/app/admin/edit/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getBookById } from '@/lib/db/queries'
import { BookForm } from '@/components/BookForm'

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) notFound()
  const book = await getBookById(db, numId)
  if (!book) notFound()
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">독후감 수정</h1>
      <BookForm mode="edit" initial={book} />
    </div>
  )
}
```

- [ ] **Step 3: 시각 확인 (수동)**

```bash
pnpm dev
```
로그인 → `/admin/new`에서 책 등록 → 목록과 상세에 노출 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/new/page.tsx src/app/admin/edit/[id]/page.tsx
git commit -m "feat(M5): /admin/new, /admin/edit/[id] 페이지"
```

---

# M6 — 필터·검색

## Task 25: SearchBox + Filters 컴포넌트

**Files:**
- Create: `src/components/SearchBox.tsx`, `src/components/Filters.tsx`

- [ ] **Step 1: SearchBox**

`src/components/SearchBox.tsx`:
```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function SearchBox() {
  const router = useRouter()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    router.push(`/books?${params.toString()}`)
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·작가 검색"
        className="flex-1 rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">검색</button>
    </form>
  )
}
```

- [ ] **Step 2: Filters**

`src/components/Filters.tsx`:
```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { GENRES } from '@/lib/genres'

export function Filters() {
  const router = useRouter()
  const sp = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/books?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={sp.get('genre') ?? ''}
        onChange={(e) => setParam('genre', e.target.value || null)}
        className="rounded border px-3 py-2 text-sm"
      >
        <option value="">전체 장르</option>
        {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <select
        value={sp.get('sort') ?? 'date'}
        onChange={(e) => setParam('sort', e.target.value === 'date' ? null : e.target.value)}
        className="rounded border px-3 py-2 text-sm"
      >
        <option value="date">최근 읽은 순</option>
        <option value="rating">별점 높은 순</option>
      </select>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/SearchBox.tsx src/components/Filters.tsx
git commit -m "feat(M6): SearchBox + Filters 컴포넌트"
```

---

## Task 26: /books 페이지에 SearchBox + Filters 통합

**Files:**
- Modify: `src/app/books/page.tsx`

- [ ] **Step 1: 페이지 갱신**

`src/app/books/page.tsx`:
```tsx
import { db } from '@/lib/db/client'
import { listBooks, searchBooks } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'

interface SP {
  searchParams: Promise<{ genre?: string; tag?: string; year?: string; q?: string; sort?: string }>
}

export default async function BooksPage({ searchParams }: SP) {
  const sp = await searchParams
  let books
  if (sp.q && sp.q.trim()) {
    books = await searchBooks(db, sp.q.trim())
  } else {
    books = await listBooks(db, {
      genre: sp.genre,
      tag: sp.tag,
      year: sp.year,
      sort: sp.sort === 'rating' ? 'rating' : 'date',
    })
  }

  const title =
    sp.q ? `"${sp.q}" 검색 결과`
    : sp.genre ? `장르: ${sp.genre}`
    : sp.tag ? `태그: ${sp.tag}`
    : '전체 책'

  return (
    <div className="space-y-6">
      <SearchBox />
      <Filters />
      <h2 className="text-xl font-semibold">
        {title}
        <span className="ml-2 text-sm font-normal text-neutral-500">({books.length}권)</span>
      </h2>
      {books.length === 0 ? (
        <p className="text-neutral-500">결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {books.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 시각 확인 (수동)**

```bash
pnpm dev
```
장르 필터·검색·정렬 동작 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/app/books/page.tsx
git commit -m "feat(M6): /books에 SearchBox + Filters 통합"
```

---

# M7 — 배포 + E2E

## Task 27: Playwright 설치 + 골든 패스 E2E

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/golden-path.spec.ts`
- Modify: `package.json` (`scripts.e2e`)

- [ ] **Step 1: 설치**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: 설정**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000', headless: true },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

`package.json`:
```json
{ "scripts": { "e2e": "playwright test" } }
```

- [ ] **Step 3: 인증 E2E**

`tests/e2e/auth.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('잘못된 비밀번호는 차단된다', async ({ page }) => {
  await page.goto('/admin/new')
  await expect(page).toHaveURL(/\/login/)
  await page.fill('input[type="password"]', 'wrong-password')
  await page.click('button[type="submit"]')
  await expect(page.getByText('로그인 실패')).toBeVisible({ timeout: 3000 })
})
```

- [ ] **Step 4: 골든 패스 E2E**

`tests/e2e/golden-path.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('로그인 → 새 글 작성 → 목록에 노출', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="password"]', 'changeme')  // .env.local의 평문
  await page.click('button[type="submit"]')

  await page.goto('/admin/new')
  await page.fill('input[name="title"], input[required]:nth-of-type(1)', 'E2E 책 제목')
  // (input들이 name 없으므로 nth-of-type 또는 placeholder로 잡는 게 안전)
  const inputs = page.locator('input')
  await inputs.nth(0).fill('E2E 책 제목')   // 제목
  await inputs.nth(1).fill('테스트 작가')   // 작가
  // 장르·날짜는 기본값 사용
  await page.click('button:has-text("등록")')

  await expect(page).toHaveURL(/\/books\//)
  await expect(page.getByRole('heading', { name: 'E2E 책 제목' })).toBeVisible()

  await page.goto('/books')
  await expect(page.getByText('E2E 책 제목')).toBeVisible()
})
```

- [ ] **Step 5: 실행**

먼저 로컬 DB가 초기화되어 있도록:
```bash
rm -f local.db && pnpm exec dotenv -e .env.local -- drizzle-kit push
pnpm e2e
```
Expected: 2 passed.

- [ ] **Step 6: 커밋**

```bash
git add tests/e2e/ playwright.config.ts package.json pnpm-lock.yaml
git commit -m "test(M7): Playwright E2E — 인증 차단 + 골든 패스"
```

---

## Task 28: 배포 가이드 + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: README**

`README.md`:
```markdown
# 독후감 사이트

1인용 독후감/독서 기록 사이트. Next.js 16 + Drizzle + Turso + Vercel.

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local
# .env.local 안의 ADMIN_PASSWORD_HASH, AUTH_SECRET 채우기
node -e "console.log(require('bcryptjs').hashSync('내비밀번호', 10))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

pnpm exec drizzle-kit push   # 로컬 SQLite 마이그레이션
pnpm dev
```

## 테스트

```bash
pnpm test         # Vitest 단위
pnpm e2e          # Playwright E2E
```

## Vercel 배포

1. GitHub 저장소 생성 후 main 브랜치 push
2. Turso CLI로 prod DB 생성:
   ```bash
   turso db create book-report
   turso db show book-report --url      # → TURSO_URL
   turso db tokens create book-report   # → TURSO_TOKEN
   ```
3. Vercel에서 GitHub 저장소 연결
4. 환경변수 등록: `TURSO_URL`, `TURSO_TOKEN`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`
5. 첫 배포 후 운영 DB에 스키마 push:
   ```bash
   TURSO_URL=libsql://... TURSO_TOKEN=... pnpm exec drizzle-kit push
   ```
6. 이후 `git push origin main` → Vercel 자동 빌드/배포
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs(M7): README — 로컬 실행/테스트/배포 가이드"
```

- [ ] **Step 3 (수동): Vercel 배포 실행**

브라우저에서 GitHub 저장소 생성·연결 후 환경변수 등록. 첫 배포 빌드 통과 확인. 운영 DB 스키마 push. 골든 패스를 prod URL에서 수동 검증.

---

# Self-Review (작성 직후 점검)

## 1. 스펙 커버리지

- ✅ 사용자: 단일 운영자, 공개 읽기 → middleware matcher가 `/admin/*`만 보호 (M4 Task 18)
- ✅ 저장 항목 7개 → schema(M2 Task 5), BookForm(M5 Task 21) 모두 매핑
- ✅ Toast UI Editor → MarkdownEditor(M5 Task 21), MarkdownViewer(M3 Task 15)
- ✅ Turso/libsql → client.ts(M2 Task 6)
- ✅ Vercel 배포 → Task 28
- ✅ bcrypt + JWT 쿠키 → auth.ts(M4 Task 16) + /api/login(Task 17) + middleware(Task 18)
- ✅ 장르 14종 enum → genres.ts(M2 Task 7) + validations(Task 9)
- ✅ 본문 검색 제외 → searchBooks가 title/author만 LIKE(M2 Task 10)
- ✅ slug 충돌 처리 → uniqueSlug(M2 Task 8) + createBook(Task 10)
- ✅ 404, 500 페이지 → M3 Task 15
- ✅ Playwright E2E 2개 → M7 Task 27
- ✅ pnpm — 모든 명령어가 `pnpm` 시작

## 2. Placeholder 스캔

- "TBD", "TODO", "implement later" — 없음
- "add error handling" 같은 추상 step — 없음
- "Similar to Task N" — 없음
- 모든 코드 step에 실제 코드 포함

## 3. 타입/이름 일관성

- `createBook`, `updateBook`, `deleteBook`, `getBookBySlug`, `getBookById`, `searchBooks`, `suggestTags`, `listBooks`, `listGenresWithCounts`, `listTagsForBook` — queries.ts 시그니처가 호출부와 일치
- `SESSION.name`, `SESSION.maxAge` — auth.ts에서 정의, API/middleware에서 동일하게 사용
- `BookWithTags` 타입 — queries.ts에서 export, BookCard/페이지에서 import
- `MarkdownEditorHandle.getMarkdown()` — MarkdownEditor와 BookForm 호출부 일치
