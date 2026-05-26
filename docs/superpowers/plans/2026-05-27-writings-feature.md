# 글방(writings) Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 책장(`/books`) 외에 **개인 글(시/에세이/일기 등 자유 형식)** 작성 공간을 별도 메뉴로 추가. 책과 같은 비공개 + 사용자별 격리 정책. 태그 풀은 책과 공유.

**Architecture:** Plan 1의 인증/scoping/UI 패턴을 그대로 평행 복제. `writings` 테이블 신설 + `writingTags` 조인 테이블, `requireOwnWriting` helper, `/writings/*` 페이지/라우트. 데이터 0개라 마이그레이션이 단순 (한 번의 `drizzle-kit push`).

**Tech Stack:** Plan 1과 동일 — Next.js 16 / Drizzle ORM / Turso / Toast UI Editor (마크다운 본문 재사용)

**Related spec:** `docs/superpowers/specs/2026-05-26-multiuser-auth-design.md` (§3.3, §5.3, §6 — 글방 부분)

---

## File Structure

### Create

| Path | Responsibility |
|---|---|
| `src/app/api/writings/route.ts` | GET 목록 + POST 생성 (본인 글만) |
| `src/app/api/writings/[id]/route.ts` | GET / PATCH / DELETE 단건 (requireOwnWriting) |
| `src/app/writings/page.tsx` | 본인 글 목록 (카드 그리드) |
| `src/app/writings/[slug]/page.tsx` | 본인 글 상세 + 수정 버튼 |
| `src/app/writings/new/page.tsx` | 글 생성 폼 |
| `src/app/writings/edit/[id]/page.tsx` | 글 수정 폼 |
| `src/components/WritingCard.tsx` | 카드 (제목 + 본문 미리보기 + 작성일 + 태그) |
| `src/components/WritingForm.tsx` | 폼 (제목 + 마크다운 본문 + 태그) |
| `tests/integration/writings-scoping.test.ts` | 격리 검증 통합 테스트 |

### Modify

| Path | What changes |
|---|---|
| `src/lib/db/schema.ts` | `writings` + `writingTags` 테이블 신설 + relations |
| `src/lib/db/queries.ts` | `createWriting` / `updateWriting` / `deleteWriting` / `listWritings` / `getWritingBySlug` / `getWritingById`. `suggestTags`는 책+글 태그 합집합으로 scoping 확장. |
| `src/lib/auth-helpers.ts` | `requireOwnWriting` / `requireOwnWritingForPage` 헬퍼 추가 |
| `src/lib/validations.ts` | `CreateWritingSchema` / `UpdateWritingSchema` 추가 |
| `src/middleware.ts` | matcher에 `/writings/:path*` 추가 |
| `src/app/layout.tsx` | 헤더 메뉴에 "✏️ 글방(/writings)" 추가 + "새 책" 위치 재조정 |
| `src/components/BookForm.tsx` | (변경 없음 — 패턴 참고용) |
| `tests/factories.ts` | `createWriting` 헬퍼 추가 |
| `tests/setup-db.ts` | (변경 없음 — 마이그레이션 SQL 자동 인식) |

---

## Phase 1: Schema & Migration

### Task 1: writings 테이블 + writingTags 조인 테이블

**Files:**
- Modify: `src/lib/db/schema.ts`

`books` 테이블 정의 *직후*에 추가, relations도 확장:

```ts
export const writings = sqliteTable(
  'writings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_writings_author_user').on(t.authorUserId),
    createdAtIdx: index('idx_writings_created_at').on(t.createdAt),
    userSlugUnique: uniqueIndex('idx_writings_user_slug').on(t.authorUserId, t.slug),
  })
)

export const writingTags = sqliteTable(
  'writing_tags',
  {
    writingId: integer('writing_id')
      .notNull()
      .references(() => writings.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.writingId, t.tagId] }),
    tagIdx: index('idx_writing_tags_tag').on(t.tagId),
  })
)
```

`usersRelations`에 `writings: many(writings)` 추가.
`tagsRelations`에 `writingTags: many(writingTags)` 추가.
신규 `writingsRelations` + `writingTagsRelations` 추가 (booksRelations 패턴).

타입 export 추가: `Writing`, `NewWriting`, `WritingTag`, `NewWritingTag`.

**Steps:**
- [ ] 위 코드 추가 + relations/types
- [ ] `pnpm drizzle-kit generate` — `drizzle/0003_*.sql` 생성 확인
- [ ] `pnpm drizzle-kit push` (로컬)
- [ ] `sqlite3 local.db ".schema writings"` 확인
- [ ] 커밋: `feat(db): add writings and writing_tags tables`

---

### Task 2: prod 마이그레이션 (1-step push)

데이터 0개라 단순. Plan 1과 동일하게 `scripts/apply-migration.ts` 사용 (prod에 직접 SQL).

**Steps:**
- [ ] `.env.local`에 prod TURSO_URL/TOKEN 임시 셋팅
- [ ] `pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/apply-migration.ts drizzle/0003_*.sql`
- [ ] prod 검증: `SELECT name FROM sqlite_master WHERE type='table'` → writings + writing_tags 존재
- [ ] `.env.local` 원복

(이 단계는 *코드 배포 전*에 미리 해두면, 코드 push 시 schema 차이로 깨지지 않음.)

---

## Phase 2: Validation & Queries

### Task 3: validations에 글 schema 추가

**Files:**
- Modify: `src/lib/validations.ts`

```ts
export const CreateWritingSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  body: z.string().max(50000).default(''),
  tags: z
    .array(z.string())
    .default([])
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    ),
})

export type CreateWritingInput = z.infer<typeof CreateWritingSchema>

export const UpdateWritingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(50000).optional(),
  tags: z
    .array(z.string())
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    )
    .optional(),
})

export type UpdateWritingInput = z.infer<typeof UpdateWritingSchema>
```

**Steps:**
- [ ] 위 추가
- [ ] 커밋: `feat(writings): add validation schemas`

---

### Task 4: queries.ts에 글 CRUD + 태그 풀 확장

**Files:**
- Modify: `src/lib/db/queries.ts`

신규 함수:
- `createWriting(db, authorUserId, input)` — books `createBook` 패턴 미러. slug 충돌 시 `-2`, `-3`. `idx_writings_user_slug` 매칭.
- `updateWriting(db, authorUserId, id, input)` — `updateBook` 패턴.
- `deleteWriting(db, authorUserId, id)` — `deleteBook` 패턴.
- `getWritingById(db, authorUserId, id)`, `getWritingBySlug(db, authorUserId, slug)`.
- `listWritings(db, authorUserId)` — createdAt DESC 정렬. 책 filter 같은 옵션 없음 (초기 스코프 단순).
- `attachWritingTags(db, writingId)`, `attachWritingTagsBatch`, `replaceWritingTags` (책 태그 함수와 같은 형태).
- `WritingWithTags` 타입 export.

**`suggestTags` 확장**: 책 `bookTags ∪ writingTags`의 합집합에서 본인 풀로 scoping. UNION 또는 두 query 결과 dedupe.

```ts
export async function suggestTags(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<string[]> {
  const pattern = `${q}%`
  // 책 태그 + 글 태그를 본인 풀에서 합집합 (DB-level UNION이 가장 깔끔)
  const rows = await db.all(sql`
    SELECT DISTINCT t.name
    FROM ${tags} t
    WHERE t.name LIKE ${pattern}
      AND (
        EXISTS (
          SELECT 1 FROM ${bookTags} bt
          INNER JOIN ${books} b ON b.id = bt.book_id
          WHERE bt.tag_id = t.id AND b.author_user_id = ${authorUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ${writingTags} wt
          INNER JOIN ${writings} w ON w.id = wt.writing_id
          WHERE wt.tag_id = t.id AND w.author_user_id = ${authorUserId}
        )
      )
    LIMIT 8
  `)
  return (rows as { name: string }[]).map((r) => r.name)
}
```

**Steps:**
- [ ] 위 모든 함수 추가
- [ ] `pnpm tsc --noEmit` — queries.ts 에러 없음 확인 (호출부 에러는 무시)
- [ ] 커밋: `feat(writings): add CRUD queries and extend tag suggestion to writings pool`

---

### Task 5: auth-helpers에 requireOwnWriting

**Files:**
- Modify: `src/lib/auth-helpers.ts`

`requireOwnBook` 직후에 추가:

```ts
export async function requireOwnWriting(writingId: number): Promise<{ user: User; writing: Writing }> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, writingId), eq(writings.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) throw new HttpError(404, { error: '글을 찾을 수 없습니다' })
  return { user, writing: rows[0] }
}

export async function requireOwnWritingForPage(writingId: number): Promise<{ user: User; writing: Writing }> {
  const user = await getCurrentUser()
  if (!user) notFound()
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, writingId), eq(writings.authorUserId, user.id)))
    .limit(1)
  if (rows.length === 0) notFound()
  return { user, writing: rows[0] }
}
```

import `writings, type Writing` 추가.

**Steps:**
- [ ] 추가 + 커밋: `feat(writings): add requireOwnWriting helper`

---

## Phase 3: API Routes

### Task 6: /api/writings (GET + POST)

**Files:**
- Create: `src/app/api/writings/route.ts`

`src/app/api/books/route.ts`의 GET/POST를 미러. listWritings은 filter 없으니 더 단순.

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createWriting, listWritings } from '@/lib/db/queries'
import { CreateWritingSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const list = await listWritings(db, user.id)
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
    const parsed = CreateWritingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
    }
    const writing = await createWriting(db, user.id, parsed.data)
    return NextResponse.json({ id: writing.id, slug: writing.slug }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createWriting failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
```

**Steps:**
- [ ] 작성 + 커밋: `feat(writings): /api/writings list and create`

---

### Task 7: /api/writings/[id] (GET + PATCH + DELETE)

**Files:**
- Create: `src/app/api/writings/[id]/route.ts`

`src/app/api/books/[id]/route.ts`를 미러. `requireOwnWriting` 사용.

(코드 전체는 books 라우트와 동일 패턴, writing/Writing/Writings 명칭만 변경)

**Steps:**
- [ ] 작성 + 커밋: `feat(writings): /api/writings/[id] get/update/delete`

---

## Phase 4: UI

### Task 8: WritingCard 컴포넌트

**Files:**
- Create: `src/components/WritingCard.tsx`

```tsx
import Link from 'next/link'
import type { WritingWithTags } from '@/lib/db/queries'

function bodyPreview(body: string, max = 80): string {
  // strip markdown markers loosely; just preview plain text
  const stripped = body
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > max ? stripped.slice(0, max) + '…' : stripped
}

export function WritingCard({ writing }: { writing: WritingWithTags }) {
  return (
    <Link
      href={`/writings/${encodeURIComponent(writing.slug)}`}
      className="block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <h3 className="text-[16px] font-semibold text-[var(--color-text-strong)] truncate">{writing.title}</h3>
      <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2">{bodyPreview(writing.body)}</p>
      <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--color-text-weak)] font-tabular">
        <span>{new Date(writing.createdAt).toISOString().slice(0, 10)}</span>
        {writing.tags.length > 0 && (
          <span className="truncate">#{writing.tags.slice(0, 3).join(' #')}</span>
        )}
      </div>
    </Link>
  )
}
```

**Steps:**
- [ ] 작성 + 커밋: `feat(ui): WritingCard component`

---

### Task 9: WritingForm 컴포넌트

**Files:**
- Create: `src/components/WritingForm.tsx`

기존 `BookForm.tsx`에서 *필요한 필드만* 남긴 단순화 버전:
- title input
- `MarkdownEditor` (기존 재사용)
- `TagInput` (기존 재사용 — 책/글 공통)
- 저장/삭제 버튼
- POST `/api/writings` 또는 PATCH `/api/writings/{id}`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { TagInput } from '@/components/TagInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Spinner } from '@/components/Spinner'
import type { WritingWithTags } from '@/lib/db/queries'

type Props =
  | { mode: 'create'; initial?: undefined }
  | { mode: 'edit'; initial: WritingWithTags }

export function WritingForm(props: Props) {
  const router = useRouter()
  const initial = props.mode === 'edit' ? props.initial : undefined
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [busy, setBusy] = useState(false)
  const [askDelete, setAskDelete] = useState(false)

  const canSubmit = !busy && title.trim().length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const payload = { title: title.trim(), body, tags }
    const url = props.mode === 'create' ? '/api/writings' : `/api/writings/${initial!.id}`
    const method = props.mode === 'create' ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '저장에 실패했습니다')
      setBusy(false)
      return
    }
    const data = await res.json()
    toast.success(props.mode === 'create' ? '글이 등록되었습니다' : '글이 수정되었습니다')
    router.push(`/writings/${encodeURIComponent(data.slug)}`)
    router.refresh()
  }

  async function onDelete() {
    if (!initial) return
    setBusy(true)
    const res = await fetch(`/api/writings/${initial.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('삭제 실패')
      setBusy(false)
      return
    }
    toast.success('삭제되었습니다')
    router.push('/writings')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        required
        maxLength={200}
        className="w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[18px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      <MarkdownEditor initialValue={body} onChange={setBody} />
      <TagInput tags={tags} onChange={setTags} />
      <div className="flex items-center justify-between gap-3">
        {props.mode === 'edit' ? (
          <button
            type="button"
            onClick={() => setAskDelete(true)}
            className="px-4 h-11 rounded-[var(--radius-toss-sm)] text-[14px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition"
          >
            삭제
          </button>
        ) : <div />}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center px-6 h-11 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium gap-2 disabled:opacity-50 transition"
        >
          {busy && <Spinner />}
          {props.mode === 'create' ? '등록' : '수정'}
        </button>
      </div>
      <ConfirmDialog
        open={askDelete}
        onOpenChange={setAskDelete}
        title="글 삭제"
        description="이 글을 정말 삭제하시겠습니까? 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={onDelete}
        destructive
      />
    </form>
  )
}
```

> 만약 `MarkdownEditor`의 `onChange` prop 시그니처가 다르면 BookForm 사용 방식과 동일하게 맞추기. `TagInput`도 동일 점검.

**Steps:**
- [ ] 작성 + 커밋: `feat(ui): WritingForm component`

---

### Task 10: /writings (목록)

**Files:**
- Create: `src/app/writings/page.tsx`

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { listWritings } from '@/lib/db/queries'
import { WritingCard } from '@/components/WritingCard'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

export default async function WritingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings')
  const writings = await listWritings(db, me.id)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">글방</h1>
        <Link
          href="/writings/new"
          className="inline-flex items-center px-3 h-9 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] font-medium"
        >
          새 글
        </Link>
      </div>
      {writings.length === 0 ? (
        <EmptyState
          emoji="✍️"
          title="아직 쓴 글이 없어요"
          description="첫 글을 남겨보세요"
          action={{ href: '/writings/new', label: '새 글 쓰기' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {writings.map((w) => <WritingCard key={w.id} writing={w} />)}
        </div>
      )}
    </div>
  )
}
```

**Steps:**
- [ ] 작성 + 커밋: `feat(ui): /writings list page`

---

### Task 11: /writings/[slug] (상세)

**Files:**
- Create: `src/app/writings/[slug]/page.tsx`

```tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getWritingBySlug } from '@/lib/db/queries'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { getCurrentUser } from '@/lib/auth'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const w = await getWritingBySlug(db, me.id, decodeURIComponent(slug))
  if (!w) return { title: '글을 찾을 수 없어요' }
  return { title: w.title }
}

export default async function WritingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/writings/${slug}`)
  }
  const { slug } = await params
  const w = await getWritingBySlug(db, me.id, decodeURIComponent(slug))
  if (!w) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-start justify-between gap-3">
          <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">
            {new Date(w.createdAt).toISOString().slice(0, 10)}
          </time>
          <Link
            href={`/writings/edit/${w.id}`}
            className="inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition"
          >
            수정
          </Link>
        </div>
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {w.title}
        </h1>
        {w.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {w.tags.map((t) => (
              <li key={t}>
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-muted)]">
                  #{t}
                </span>
              </li>
            ))}
          </ul>
        )}
      </header>
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        {w.body ? (
          <MarkdownViewer initialValue={w.body} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
```

**Steps:**
- [ ] 작성 + 커밋: `feat(ui): /writings/[slug] detail page`

---

### Task 12: /writings/new + /writings/edit/[id]

**Files:**
- Create: `src/app/writings/new/page.tsx`
- Create: `src/app/writings/edit/[id]/page.tsx`

`/writings/new`:
```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { WritingForm } from '@/components/WritingForm'

export default async function NewWritingPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings/new')
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">새 글</h1>
      <WritingForm mode="create" />
    </div>
  )
}
```

`/writings/edit/[id]`:
```tsx
import { notFound } from 'next/navigation'
import { requireOwnWritingForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { listTagsForWriting } from '@/lib/db/queries'
import { WritingForm } from '@/components/WritingForm'

export default async function EditWritingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { writing } = await requireOwnWritingForPage(numId)
  const tags = await listTagsForWriting(db, writing.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">글 수정</h1>
      <WritingForm mode="edit" initial={{ ...writing, tags }} />
    </div>
  )
}
```

> `listTagsForWriting`는 Task 4의 글 태그 attach helper를 export로 노출.

**Steps:**
- [ ] 두 파일 작성 + 커밋: `feat(ui): /writings/new and edit pages`

---

### Task 13: 헤더 메뉴 + middleware 매처

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/middleware.ts`

`layout.tsx`의 로그인 영역에 "✏️ 글방" 링크 추가 (현재 "목록" 다음):

```tsx
<Link href="/writings" className="...">✏️ 글방</Link>
```

`middleware.ts`의 matcher에 `/writings/:path*` 추가:

```ts
matcher: ['/books/:path*', '/writings/:path*', '/admin/:path*', '/settings/:path*'],
```

**Steps:**
- [ ] 둘 다 수정 + 커밋: `feat(writings): add header menu and middleware protection`

---

## Phase 5: Tests

### Task 14: Integration 테스트

**Files:**
- Create: `tests/integration/writings-scoping.test.ts`
- Modify: `tests/factories.ts`

`factories.ts`에 `createWriting` 추가 (books factory 미러).

`tests/integration/writings-scoping.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listWritings,
  getWritingBySlug,
  createWriting as queryCreateWriting,
  updateWriting,
  deleteWriting,
  suggestTags,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook, createWriting } from '../factories'

describe('writing queries — user scoping', () => {
  let db: TestDb
  beforeEach(async () => { ({ db } = await makeTestDb()) })

  it('listWritings returns only own user writings', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createWriting(db, a.id, { title: 'A1' })
    await createWriting(db, b.id, { title: 'B1' })
    const aList = await listWritings(db, a.id)
    const bList = await listWritings(db, b.id)
    expect(aList.map((x) => x.title)).toEqual(['A1'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('getWritingBySlug returns null for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createWriting(db, a.id, { slug: 'shared' })
    expect(await getWritingBySlug(db, a.id, 'shared')).not.toBeNull()
    expect(await getWritingBySlug(db, b.id, 'shared')).toBeNull()
  })

  it('two users can have same writing slug', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aw = await queryCreateWriting(db, a.id, { title: '봄밤', body: '...', tags: [] })
    const bw = await queryCreateWriting(db, b.id, { title: '봄밤', body: '...', tags: [] })
    expect(aw.slug).toBe(bw.slug)
    expect(aw.authorUserId).not.toBe(bw.authorUserId)
  })

  it('updateWriting / deleteWriting scoped to owner', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aw = await createWriting(db, a.id, { title: 'orig' })
    expect(await updateWriting(db, b.id, aw.id, { title: 'hijacked' })).toBeNull()
    expect(await deleteWriting(db, b.id, aw.id)).toBe(false)
    expect(await deleteWriting(db, a.id, aw.id)).toBe(true)
  })

  it('suggestTags merges book + writing tags within owner pool', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    // alice가 책에 #철학 + 글에 #시
    await queryCreateWriting(db, a.id, { title: 'w', body: '', tags: ['시'] })
    // (책에 태그 붙이려면 createBook 사용 — 생략 가능, 글 태그만으로 검증)
    const aSuggest = await suggestTags(db, a.id, '시')
    expect(aSuggest).toContain('시')
    // bob 풀에는 같은 태그명 없음
    const bSuggest = await suggestTags(db, b.id, '시')
    expect(bSuggest).not.toContain('시')
  })
})
```

**Steps:**
- [ ] `factories.ts` 확장 + 새 integration test 작성
- [ ] `pnpm test writings-scoping` 통과 확인
- [ ] 커밋: `test: writings scoping integration coverage`

---

## Phase 6: Migration & Deployment

### Task 15: prod 배포

(Task 2에서 prod schema 이미 push했다면 이 단계는 *코드 push만*)

**Steps:**
- [ ] 모든 변경 main에 fast-forward merge
- [ ] `git push origin main` → Vercel 자동 배포
- [ ] Smoke test:
  - sayhee 로그인 → 헤더에 "✏️ 글방" 보임 → 클릭 → 빈 글방 + "새 글 쓰기" 안내
  - 새 글 1개 작성 → /writings 에 표시 → 상세 진입 OK
  - 수정/삭제 → 정상 동작
  - hammer_turtle로 로그인 → sayhee 글 0개, 본인 글 0개
  - URL 직접 `/writings/<sayhee의 글 slug>` → 404

---

## Self-Review 체크리스트

- [ ] spec §3.3, §3.4 (writings + writingTags) → Task 1
- [ ] spec §4.4 (requireOwnWriting) → Task 5
- [ ] spec §5.3 (5개 API 라우트) → Task 6, 7
- [ ] spec §5.5 (writing schemas) → Task 3
- [ ] spec §6.1 페이지 4개 → Task 10, 11, 12
- [ ] spec §6.2 컴포넌트 → Task 8, 9
- [ ] spec R15 헤더 메뉴 분리 → Task 13
- [ ] spec R16 태그 풀 공유 (suggestTags 확장) → Task 4
- [ ] spec §8.3 E2E 시나리오 #6, #7 — *이번 plan은 integration 테스트만, E2E는 manual smoke test로 대체*
