# 글방 대표 이미지(cover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 글방 글에 글당 대표 이미지 1장을 Vercel Blob에 업로드하고, 책/영화처럼 카드·상세에 썸네일로 표시한다.

**Architecture:** `writings.coverUrl` 컬럼 1개에 Blob public URL 저장. 업로드는 글 submit 시점에만 발생(`POST /api/uploads`). 고아는 cover가 DB 컬럼이라 정확히 추적 가능 — edit 교체/제거·글 삭제 시 옛 Blob `del`. cover 표시는 기존 books `coverUrl` 패턴 복제.

**Tech Stack:** Next.js 16 App Router, Vercel Blob(`@vercel/blob`), libSQL/Drizzle, zod, Vitest.

**참고 spec:** `docs/superpowers/specs/2026-06-06-writing-cover-image-design.md`

---

## 파일 구조 (생성/수정 맵)

| 파일 | 책임 |
|---|---|
| `src/lib/blob.ts` | **신규** — 업로드 검증 상수/함수, Blob put/del 래퍼, managed-host 판별 |
| `src/app/api/uploads/route.ts` | **신규** — POST: 인증 + 검증 + Blob put → `{url}` |
| `src/lib/db/schema.ts` | `writings.coverUrl` nullable 컬럼 추가 |
| `src/lib/validations.ts` | CreateWriting/UpdateWriting 스키마에 `coverUrl` (기존 `coverUrlSchema` 재사용) |
| `src/lib/db/queries/writings.ts` | create/update/delete가 coverUrl 저장 + 옛 Blob del |
| `tests/factories.ts` | `createWriting` factory에 coverUrl override 추가 |
| `src/components/WritingForm.tsx` | 대표 이미지 위젯 + submit 시 업로드 흐름 |
| `src/app/writings/edit/[id]/page.tsx` | initial에 coverUrl 전달 |
| `src/components/WritingCard.tsx` | coverUrl 썸네일 (BookCard 패턴) |
| `src/app/writings/[slug]/page.tsx` | 상세에 cover 표시 |
| `next.config.ts` | remotePatterns에 Blob host 추가 |
| `tests/unit/blob.test.ts` | **신규** — 검증/host 판별 단위 테스트 |
| `tests/integration/writings-cover.test.ts` | **신규** — query coverUrl 저장 + del + 격리 |
| `tests/unit/uploads-route.test.ts` | **신규** — route 인증 게이트 + 검증 |

---

## Task 1: `@vercel/blob` 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 의존성 설치**

Run:
```bash
pnpm add @vercel/blob
```
Expected: `package.json` dependencies에 `@vercel/blob` 추가, 설치 성공.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: @vercel/blob 의존성 추가"
```

---

## Task 2: blob 헬퍼 + 업로드 검증 (TDD)

cover Blob의 put/del/검증/host판별을 한 모듈에 모은다. 순수 함수(`validateImageUpload`, `isManagedBlobUrl`)는 단위 테스트하고, I/O 함수(`uploadImage`, `deleteBlobIfManaged`)는 상위 테스트에서 mock한다.

**Files:**
- Create: `src/lib/blob.ts`
- Test: `tests/unit/blob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/blob.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateImageUpload, isManagedBlobUrl, MAX_IMAGE_BYTES } from '@/lib/blob'

describe('validateImageUpload', () => {
  it('accepts jpeg under size limit and returns ext', () => {
    const r = validateImageUpload({ type: 'image/jpeg', size: 1024 })
    expect(r).toEqual({ ok: true, ext: 'jpg' })
  })

  it('maps png/webp/gif to extensions', () => {
    expect(validateImageUpload({ type: 'image/png', size: 1 })).toEqual({ ok: true, ext: 'png' })
    expect(validateImageUpload({ type: 'image/webp', size: 1 })).toEqual({ ok: true, ext: 'webp' })
    expect(validateImageUpload({ type: 'image/gif', size: 1 })).toEqual({ ok: true, ext: 'gif' })
  })

  it('rejects non-image mime', () => {
    const r = validateImageUpload({ type: 'application/pdf', size: 1 })
    expect(r.ok).toBe(false)
  })

  it('rejects files over 5MB', () => {
    const r = validateImageUpload({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })
    expect(r.ok).toBe(false)
  })
})

describe('isManagedBlobUrl', () => {
  it('returns true for vercel blob host', () => {
    expect(isManagedBlobUrl('https://abc123.public.blob.vercel-storage.com/writings/1/x.png')).toBe(
      true,
    )
  })

  it('returns false for external/null/garbage urls', () => {
    expect(isManagedBlobUrl('https://image.tmdb.org/t/p/w500/x.jpg')).toBe(false)
    expect(isManagedBlobUrl(null)).toBe(false)
    expect(isManagedBlobUrl('not a url')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/blob.test.ts`
Expected: FAIL — `Cannot find module '@/lib/blob'`.

- [ ] **Step 3: Write implementation**

Create `src/lib/blob.ts`:
```ts
import { put, del } from '@vercel/blob'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const ALLOWED_IMAGE_MIME = Object.keys(EXT_BY_MIME)

export type UploadValidation = { ok: true; ext: string } | { ok: false; error: string }

/** 서버가 최종 권위. MIME 화이트리스트 + byte size 검증. */
export function validateImageUpload(file: { type: string; size: number }): UploadValidation {
  const ext = EXT_BY_MIME[file.type]
  if (!ext) return { ok: false, error: '이미지 파일(jpg/png/webp/gif)만 업로드할 수 있어요' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: '이미지는 최대 5MB까지 업로드할 수 있어요' }
  }
  return { ok: true, ext }
}

const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i

/** 우리 Blob store 호스트의 URL만 true — 외부/조작 URL은 del 대상에서 제외. */
export function isManagedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return BLOB_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** 사용자별 prefix 경로에 업로드 후 public URL 반환. */
export async function uploadImage(userId: number, file: File, ext: string): Promise<string> {
  const path = `writings/${userId}/${crypto.randomUUID()}.${ext}`
  const blob = await put(path, file, { access: 'public' })
  return blob.url
}

/** managed Blob URL이면 삭제. 실패는 로그만 — 호출부(글 mutation)를 막지 않는다. */
export async function deleteBlobIfManaged(url: string | null | undefined): Promise<void> {
  if (!isManagedBlobUrl(url)) return
  try {
    await del(url as string)
  } catch (e) {
    console.error('blob del failed', url, e)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/blob.test.ts`
Expected: PASS (모든 케이스).

- [ ] **Step 5: Commit**

```bash
git add src/lib/blob.ts tests/unit/blob.test.ts
git commit -m "feat(blob): 이미지 업로드 검증 + Blob put/del 헬퍼"
```

---

## Task 3: schema에 coverUrl 컬럼 + 마이그레이션

**Files:**
- Modify: `src/lib/db/schema.ts` (writings 테이블, 현재 100-104행 컬럼 블록)

- [ ] **Step 1: 컬럼 추가**

`src/lib/db/schema.ts`의 `writings` 정의에서 `body` 다음 줄에 추가:
```ts
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    coverUrl: text('cover_url'),
    slug: text('slug').notNull(),
```
(`coverUrl`은 nullable — 기존 글은 NULL로 안전.)

- [ ] **Step 2: 마이그레이션 생성**

Run:
```bash
pnpm exec dotenv -e .env.local -- drizzle-kit generate
```
Expected: `drizzle/` 에 `writings.cover_url` ADD COLUMN 마이그레이션 SQL 생성.

- [ ] **Step 3: 로컬 DB 반영**

Run:
```bash
pnpm exec dotenv -e .env.local -- drizzle-kit push
```
Expected: 컬럼 추가 성공.

- [ ] **Step 4: 타입 회귀 확인**

Run: `pnpm vitest run tests/integration/writings-scoping.test.ts`
Expected: PASS — 기존 writing 쿼리 테스트가 새 컬럼으로 깨지지 않음.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(schema): writings.cover_url 컬럼 추가"
```

---

## Task 4: validations에 coverUrl 추가

**Files:**
- Modify: `src/lib/validations.ts` (CreateWritingSchema 205-215, UpdateWritingSchema 219-227)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/writing-cover-validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { CreateWritingSchema, UpdateWritingSchema } from '@/lib/validations'

describe('writing schema coverUrl', () => {
  it('accepts a valid https coverUrl on create', () => {
    const r = CreateWritingSchema.safeParse({
      title: 't',
      coverUrl: 'https://abc.public.blob.vercel-storage.com/writings/1/x.png',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.coverUrl).toContain('x.png')
  })

  it('accepts null coverUrl on update (제거 의도)', () => {
    const r = UpdateWritingSchema.safeParse({ coverUrl: null })
    expect(r.success).toBe(true)
  })

  it('omitting coverUrl is allowed', () => {
    expect(CreateWritingSchema.safeParse({ title: 't' }).success).toBe(true)
    expect(UpdateWritingSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a non-url coverUrl', () => {
    expect(CreateWritingSchema.safeParse({ title: 't', coverUrl: 'nope' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/writing-cover-validation.test.ts`
Expected: FAIL — `coverUrl: 'nope'` 케이스가 통과해버림(아직 .strict()가 거부) 또는 valid coverUrl이 strict로 거부됨. 즉 일부 assert 실패.

- [ ] **Step 3: 스키마에 coverUrl 추가**

`CreateWritingSchema` (205행 `.object({...})`)에 `tags` 다음, `.strict()` 앞에 추가:
```ts
    tags: tagsArraySchema
      .default([])
      .transform((arr) =>
        Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))),
      ),
    coverUrl: coverUrlSchema,
  })
  .strict()
```

`UpdateWritingSchema` (219행)에도 동일하게 `tags` 다음에 추가:
```ts
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    coverUrl: coverUrlSchema,
  })
  .strict()
```
(`coverUrlSchema`는 19행에 이미 정의됨 — nullable + optional + https url. 재사용.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/writing-cover-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations.ts tests/unit/writing-cover-validation.test.ts
git commit -m "feat(validations): writing 스키마에 coverUrl 추가"
```

---

## Task 5: factory에 coverUrl override

**Files:**
- Modify: `tests/factories.ts` (createWriting 61-79)

- [ ] **Step 1: override 패스스루 추가**

`createWriting` factory의 `.values({...})` 안 `updatedAt` 다음에 추가 (createBook 패턴과 동일):
```ts
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      ...(overrides.coverUrl !== undefined && { coverUrl: overrides.coverUrl }),
    })
```

- [ ] **Step 2: 회귀 확인**

Run: `pnpm vitest run tests/integration/writings-scoping.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/factories.ts
git commit -m "test(factory): createWriting coverUrl override 지원"
```

---

## Task 6: query에 coverUrl 저장 + 옛 Blob 정리 (TDD)

**Files:**
- Modify: `src/lib/db/queries/writings.ts` (createWriting 9-49, updateWriting 51-87, deleteWriting 89-95)
- Test: `tests/integration/writings-cover.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/writings-cover.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Blob del을 spy — 실제 네트워크 호출 없이 호출 여부만 검증.
vi.mock('@/lib/blob', () => ({
  deleteBlobIfManaged: vi.fn(async () => {}),
}))

import { createWriting, updateWriting, deleteWriting, getWritingById } from '@/lib/db/queries'
import { deleteBlobIfManaged } from '@/lib/blob'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser } from '../factories'

const BLOB = 'https://abc.public.blob.vercel-storage.com/writings'

describe('writing cover lifecycle', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
    vi.clearAllMocks()
  })

  it('createWriting persists coverUrl', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/a.png`, tags: [] })
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/a.png`)
  })

  it('updateWriting replacing cover deletes the old blob', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/old.png`, tags: [] })
    await updateWriting(db, a.id, w.id, { coverUrl: `${BLOB}/1/new.png` })
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/old.png`)
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/new.png`)
  })

  it('updateWriting removing cover (null) deletes old blob and stores null', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/old.png`, tags: [] })
    await updateWriting(db, a.id, w.id, { coverUrl: null })
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/old.png`)
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBeNull()
  })

  it('updateWriting without coverUrl key leaves cover untouched, no del', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/keep.png`, tags: [] })
    await updateWriting(db, a.id, w.id, { title: '여름' })
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/keep.png`)
  })

  it('deleteWriting removes the cover blob', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/x.png`, tags: [] })
    await deleteWriting(db, a.id, w.id)
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/x.png`)
  })

  it('cross-user updateWriting cannot touch another user cover', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const w = await createWriting(db, a.id, { title: '봄', coverUrl: `${BLOB}/1/x.png`, tags: [] })
    const res = await updateWriting(db, b.id, w.id, { coverUrl: `${BLOB}/2/hijack.png` })
    expect(res).toBeNull()
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/writings-cover.test.ts`
Expected: FAIL — createWriting이 coverUrl을 저장 안 함(`got.coverUrl` undefined), del 미호출.

- [ ] **Step 3: createWriting — coverUrl 저장**

`src/lib/db/queries/writings.ts` createWriting의 insert `.values({...})`에서 `body` 다음에 추가:
```ts
            title: input.title,
            body: input.body ?? '',
            coverUrl: input.coverUrl ?? null,
            slug: candidate,
```

- [ ] **Step 4: updateWriting — coverUrl set + 옛 blob del (트랜잭션 밖)**

`updateWriting` 전체를 아래로 교체 (옛 coverUrl을 트랜잭션 안에서 캡처해 commit 후 del):
```ts
export async function updateWriting(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateWritingInput,
): Promise<WritingWithTags | null> {
  let oldCover: string | null = null
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(writings)
      .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
      .limit(1)
    if (existing.length === 0) return null
    oldCover = existing[0].coverUrl

    const now = Date.now()
    const updated = await tx
      .update(writings)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        updatedAt: now,
      })
      .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
      .returning()

    const writing = updated[0]
    if (input.tags !== undefined) {
      await replaceWritingTagsTx(tx, id, input.tags)
    }
    const tagRows = await tx
      .select({ name: tags.name })
      .from(writingTags)
      .innerJoin(tags, eq(writingTags.tagId, tags.id))
      .where(eq(writingTags.writingId, id))
    return { ...writing, tags: tagRows.map((r) => r.name) }
  })

  // 트랜잭션 커밋 후에만 옛 Blob 정리 — 외부 I/O는 트랜잭션 밖. cover가 실제로
  // 바뀐 경우(교체/제거)에만 삭제.
  if (result && input.coverUrl !== undefined && oldCover && oldCover !== input.coverUrl) {
    await deleteBlobIfManaged(oldCover)
  }
  return result
}
```

- [ ] **Step 5: deleteWriting — cover blob del**

`deleteWriting` 전체를 아래로 교체:
```ts
export async function deleteWriting(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(writings)
    .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
    .returning({ id: writings.id, coverUrl: writings.coverUrl })
  const row = result[0]
  if (!row) return false
  await deleteBlobIfManaged(row.coverUrl)
  return true
}
```

- [ ] **Step 6: import 추가**

`src/lib/db/queries/writings.ts` 상단 import 블록에 추가:
```ts
import { deleteBlobIfManaged } from '@/lib/blob'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/writings-cover.test.ts tests/integration/writings-scoping.test.ts`
Expected: PASS (신규 cover 테스트 + 기존 격리 회귀 모두).

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/queries/writings.ts tests/integration/writings-cover.test.ts
git commit -m "feat(writings): coverUrl 저장 + 교체/삭제 시 옛 Blob 정리"
```

---

## Task 7: 업로드 API route (TDD)

**Files:**
- Create: `src/app/api/uploads/route.ts`
- Test: `tests/unit/uploads-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/uploads-route.test.ts` (external-search.test.ts의 db Proxy + auth-helpers mock 패턴):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// db는 이 route에서 안 씀 — 실수로 쓰면 fail-loud.
vi.mock('@/lib/db/client', () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        throw new Error(`uploads route should not touch db.${String(prop)}`)
      },
    },
  ),
}))

// uploadImage는 mock(네트워크 차단), 검증 함수는 실제 사용.
vi.mock('@/lib/blob', async () => {
  const actual = await vi.importActual<typeof import('@/lib/blob')>('@/lib/blob')
  return {
    ...actual,
    uploadImage: vi.fn(async () => 'https://abc.public.blob.vercel-storage.com/writings/1/x.png'),
  }
})

vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return { ...actual, requireUser: vi.fn() }
})

import { POST } from '@/app/api/uploads/route'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { uploadImage } from '@/lib/blob'

function fileReq(file: File | null): Request {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new Request('http://localhost/api/uploads', { method: 'POST', body: fd })
}

describe('POST /api/uploads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(401, '로그인이 필요합니다'))
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(401)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('403 when mustChangePassword (requireUser throws)', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(403, '비밀번호 변경이 필요합니다'))
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(403)
  })

  it('400 when no file', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(null))
    expect(res.status).toBe(400)
  })

  it('400 when wrong mime', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(new File(['x'], 'a.pdf', { type: 'application/pdf' })))
    expect(res.status).toBe(400)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('201 + url for valid image', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.url).toContain('x.png')
    expect(uploadImage).toHaveBeenCalled()
  })
})
```
> 참고: `HttpError` 생성자 시그니처는 `src/lib/auth-helpers.ts`를 열어 확인하고, 위 `new HttpError(status, message)`가 실제와 다르면 맞춘다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/uploads-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/uploads/route'`.

- [ ] **Step 3: Write implementation**

Create `src/app/api/uploads/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { validateImageUpload, uploadImage } from '@/lib/blob'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다' }, { status: 400 })
    }
    const v = validateImageUpload(file)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const url = await uploadImage(user.id, file, v.ext)
    return NextResponse.json({ url }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('image upload failed', e)
    return NextResponse.json({ error: '업로드에 실패했습니다' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/uploads-route.test.ts`
Expected: PASS (5 케이스).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/uploads/route.ts tests/unit/uploads-route.test.ts
git commit -m "feat(api): POST /api/uploads — 인증+검증+Blob 업로드"
```

---

## Task 8: next.config에 Blob host 등록

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: remotePatterns에 추가**

`next.config.ts`의 `images.remotePatterns` 배열에 추가:
```ts
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'shopping-phinf.pstatic.net' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // RFC 6761 reserved TLD — never resolves on the public internet, used
      // by e2e fixtures so SSR validation passes without hitting a real CDN.
      { protocol: 'https', hostname: 'images.example.test' },
    ],
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공 (config 파싱 오류 없음). 시간이 오래 걸리면 `run_in_background` 사용.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(config): next/image에 Vercel Blob host 허용"
```

---

## Task 9: WritingForm 대표 이미지 위젯 + submit 업로드

**Files:**
- Modify: `src/components/WritingForm.tsx`
- Modify: `src/app/writings/edit/[id]/page.tsx`

- [ ] **Step 1: WritingFormValues에 coverUrl 추가**

`WritingForm.tsx` 상단 인터페이스:
```ts
export interface WritingFormValues {
  title: string
  body: string
  tags: string[]
  coverUrl: string | null
}
```

- [ ] **Step 2: cover state + 위젯 추가**

`WritingForm` 함수 본문, 기존 state 선언부(`const [tags, ...]` 부근)에 추가:
```ts
  const existingCover = initial?.coverUrl ?? null
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(existingCover)
  const coverInputRef = useRef<HTMLInputElement>(null)

  function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 첨부할 수 있어요')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('이미지는 최대 5MB까지 첨부할 수 있어요')
      return
    }
    setCoverFile(file)
    setCoverRemoved(false)
    setCoverPreview(URL.createObjectURL(file))
  }

  function onRemoveCover() {
    setCoverFile(null)
    setCoverRemoved(true)
    setCoverPreview(null)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }
```
> `URL.createObjectURL`은 메모리 누수 방지를 위해 컴포넌트 unmount 시 revoke가 이상적이나, 폼은 submit 후 navigate로 사라지므로 이번 범위에선 생략.

- [ ] **Step 3: submit에 업로드 흐름 추가**

`submit` 함수에서 `const payload = ...` 줄을 아래로 교체 (body null 가드 다음, fetch 전):
```ts
      // cover 결정: 새 파일 → 업로드 후 URL / 제거 버튼 → null / 변경 없음 → 키 생략
      let coverUrl: string | null | undefined
      if (coverFile) {
        const fd = new FormData()
        fd.append('file', coverFile)
        const up = await fetch('/api/uploads', { method: 'POST', body: fd })
        if (!up.ok) {
          const d = await up.json().catch(() => ({}))
          toast.error(d.error || '이미지 업로드 실패')
          return
        }
        coverUrl = (await up.json()).url as string
      } else if (coverRemoved) {
        coverUrl = null
      }

      const payload = {
        title: title.trim(),
        body,
        tags,
        ...(coverUrl !== undefined && { coverUrl }),
      }
```
(나머지 fetch/`url`/method 로직은 그대로 둔다.)

- [ ] **Step 4: 위젯 마크업 추가**

제목/태그가 든 첫 `<section>`(제목 input 아래) 안, 태그 `<div>` 다음에 추가:
```tsx
        <div>
          <label className={labelCls}>대표 이미지 (선택)</label>
          {coverPreview ? (
            <div className="flex items-start gap-3">
              {/* 미리보기는 외부/objectURL 혼재라 next/image 대신 <img> */}
              {/* biome-ignore lint/performance/noImgElement: 미리보기는 blob/objectURL이라 next/image 부적합 */}
              <img
                src={coverPreview}
                alt="대표 이미지 미리보기"
                className="h-32 w-auto rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] object-cover"
              />
              <button
                type="button"
                onClick={onRemoveCover}
                className="h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition"
              >
                이미지 제거
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="h-12 px-5 rounded-[var(--radius-toss-sm)] border border-dashed border-[var(--color-border)] text-[14px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-toss-blue)] hover:text-[var(--color-toss-blue)] transition"
            >
              + 이미지 첨부
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onPickCover}
            className="hidden"
          />
        </div>
```

- [ ] **Step 5: edit page에서 coverUrl 전달**

`src/app/writings/edit/[id]/page.tsx`의 `initial` prop:
```tsx
        initial={{
          id: writing.id,
          title: writing.title,
          body: writing.body,
          tags,
          coverUrl: writing.coverUrl,
        }}
```

- [ ] **Step 6: 빌드/타입 확인**

Run: `pnpm build`
Expected: 타입 오류 없이 성공. (background 권장)

- [ ] **Step 7: Commit**

```bash
git add src/components/WritingForm.tsx src/app/writings/edit/\[id\]/page.tsx
git commit -m "feat(writings): WritingForm 대표 이미지 첨부 위젯 (submit 시 업로드)"
```

---

## Task 10: WritingCard 썸네일 (TDD)

**Files:**
- Modify: `src/components/WritingCard.tsx`
- Test: `tests/unit/components.test.tsx` (기존 파일에 케이스 추가)

- [ ] **Step 1: Write the failing test**

`tests/unit/components.test.tsx`에 WritingCard 케이스 추가 (기존 import/render 패턴을 따른다. WritingCard import 추가):
```tsx
import { WritingCard } from '@/components/WritingCard'

describe('WritingCard cover', () => {
  const base = {
    id: 1,
    authorUserId: 1,
    title: '봄밤',
    body: '본문',
    slug: 'spring',
    coverUrl: null as string | null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [] as string[],
  }

  it('renders an image when coverUrl is present', () => {
    const { container } = render(
      <WritingCard
        writing={{ ...base, coverUrl: 'https://abc.public.blob.vercel-storage.com/w/1/x.png' }}
      />,
    )
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('renders no image when coverUrl is null', () => {
    const { container } = render(<WritingCard writing={base} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
```
> `WritingWithTags` 타입에 이미 coverUrl이 포함됨(schema $inferSelect). base 객체가 타입과 안 맞으면 필드를 맞춘다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/components.test.tsx`
Expected: FAIL — coverUrl 있어도 `<img>` 없음.

- [ ] **Step 3: WritingCard에 썸네일 추가 (BookCard 패턴)**

`WritingCard.tsx`를 가로 레이아웃으로 재구성. import에 `next/image` 추가하고, `<Link>` 내부를 cover + 본문 flex 구조로:
```tsx
import Link from 'next/link'
import Image from 'next/image'
import { highlightMatch } from '@/lib/highlight'
import { LocalDate } from './LocalDate'
import type { WritingWithTags } from '@/lib/db/queries'
```
`<Link ...>` 직속 자식 전체를 아래로 감싼다 (기존 h3/p/footer를 우측 컬럼으로 이동):
```tsx
      <div className="flex gap-3">
        {writing.coverUrl && (
          <Image
            src={writing.coverUrl}
            alt=""
            width={80}
            height={120}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
            {query ? highlightMatch(writing.title, query) : writing.title}
          </h3>
          <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
            {previewText
              ? query
                ? highlightMatch(previewText, query)
                : previewText
              : '본문이 없습니다.'}
          </p>
          <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--color-text-weak)] font-tabular">
            <time>
              <LocalDate ts={writing.createdAt} />
            </time>
            {writing.tags.length > 0 && (
              <span className="truncate max-w-[60%] text-right">
                #{writing.tags.slice(0, 3).join(' #')}
              </span>
            )}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WritingCard.tsx tests/unit/components.test.tsx
git commit -m "feat(writings): WritingCard 대표 이미지 썸네일 (BookCard 패턴)"
```

---

## Task 11: 글 상세 페이지에 cover 표시

**Files:**
- Modify: `src/app/writings/[slug]/page.tsx`

- [ ] **Step 1: Image import 추가**

상단 import에 추가:
```ts
import Image from 'next/image'
```

- [ ] **Step 2: header에 cover 렌더 (books 상세 패턴)**

`<h1>` 다음(또는 제목 위)에 cover 블록 추가. books 상세는 제목 옆 가로 배치지만, 글은 제목 위 배너형이 자연스럽다:
```tsx
        {w.coverUrl && (
          <Image
            src={w.coverUrl}
            alt={`${w.title} 대표 이미지`}
            width={800}
            height={400}
            className="mt-3 w-full max-h-[360px] rounded-[var(--radius-toss-sm)] object-cover shadow-[var(--shadow-toss)]"
          />
        )}
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {w.title}
        </h1>
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build`
Expected: 성공. (background 권장)

- [ ] **Step 4: Commit**

```bash
git add src/app/writings/\[slug\]/page.tsx
git commit -m "feat(writings): 글 상세에 대표 이미지 표시"
```

---

## Task 12: 전체 검증 + 환경변수 문서화

**Files:**
- Modify: `CLAUDE.md` (Gotchas 섹션) — Blob 토큰 안내

- [ ] **Step 1: 전체 테스트**

Run: `pnpm test`
Expected: 전체 PASS.

- [ ] **Step 2: lint (변경 파일)**

Run: `pnpm lint`
Expected: 신규/변경 파일에 새 에러 없음. (기존 baseline 에러는 무시 — `lint_baseline_dirty` 메모 참고)

- [ ] **Step 3: CLAUDE.md Gotchas에 Blob 토큰 노트 추가**

Gotchas 섹션에 한 줄 추가:
```markdown
- **Vercel Blob 토큰**: 글방 대표 이미지 업로드는 `BLOB_READ_WRITE_TOKEN` 필요. Vercel은 Blob store 연결 시 자동 주입, 로컬은 `.env.local`에 수동 추가. 없으면 `/api/uploads`만 비동작(나머지 영향 없음).
```

- [ ] **Step 4: Vercel 대시보드 작업 (사용자 수동)**

다음은 코드가 아닌 운영 작업 — 사용자에게 안내:
1. Vercel 프로젝트 → Storage → Blob store 생성 → 프로젝트 연결 (`BLOB_READ_WRITE_TOKEN` 자동 주입)
2. 로컬 개발 시 `.env.local`에 동일 토큰 추가

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Vercel Blob 토큰 설정 안내 추가"
```

---

## Self-Review 결과

- **Spec coverage:** 스토리지(Task 1,2,7) · 모델/마이그레이션(Task 3) · 검증(Task 2,4) · submit 시 업로드(Task 9) · 고아 정리 edit/삭제(Task 6) · 카드(Task 10) · 상세(Task 11) · next.config(Task 8) · 멀티테넌트 게이트(Task 6,7) · 테스트(Task 2,4,6,7,10) — 모두 매핑됨.
- **남은 비범위(spec과 일치):** 본문 inline 다중 이미지 ❌, 서버 리사이즈 ❌, 책/영화 직접 업로드 ❌, 업로드 후 DB 실패 보상삭제 ❌.
- **타입 일관성:** `validateImageUpload`/`isManagedBlobUrl`/`uploadImage`/`deleteBlobIfManaged` 시그니처가 Task 2 정의와 Task 6·7 사용처에서 일치. `coverUrl` 컬럼/스키마/타입 흐름(schema → $inferSelect → CreateWritingInput → createWriting) 일관.
- **확인 필요 항목 (구현 중):** `HttpError` 생성자 시그니처(Task 7 주석), `tests/unit/components.test.tsx`의 기존 render import 패턴.
```
