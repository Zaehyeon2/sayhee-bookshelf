# 토스 스타일 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development — task 단위로 fresh subagent 디스패치, spec-compliance → code-quality 2단계 리뷰.

**Goal:** 책 독후감 사이트의 시각을 Toss 디자인 언어로 통일한다 (기능 무변경).

**Architecture:** `globals.css` 에 토큰(CSS 변수 + Tailwind v4 `@theme`)을 정의 → 컴포넌트가 토큰만 참조 → 페이지가 새 컴포넌트 조합. Pretendard 는 CDN `<link>` 로 추가, 신규 dependency 없음.

**Tech Stack:** Tailwind CSS v4 (CSS-first), Next.js 16, React 19, Pretendard (CDN).

**Spec reference:** `docs/superpowers/specs/2026-05-26-toss-style-redesign.md`

---

## File Structure

생성:
- 없음 (모두 기존 파일 수정)

수정:
- `src/app/globals.css` — 토큰 + Pretendard + .prose-toss
- `src/app/layout.tsx` — Pretendard link, 헤더 리스타일, body bg
- `src/app/page.tsx` — Hero + 통계 + 장르 그리드 + 최근 책
- `src/app/books/page.tsx` — 검색 + 장르 chip + 정렬 + 결과
- `src/app/books/[slug]/page.tsx` — 상세 헤더 + 본문 카드
- `src/app/login/page.tsx` — 중앙 정렬 카드
- `src/app/admin/new/page.tsx` — 제목 hero
- `src/app/admin/edit/[id]/page.tsx` — 제목 hero
- `src/components/BookCard.tsx`
- `src/components/GenreBadge.tsx`
- `src/components/RatingStars.tsx`
- `src/components/BookForm.tsx`
- `src/components/SearchBox.tsx`
- `src/components/Filters.tsx` → `GenreChips.tsx` 로 대체(같은 파일에서 chip UI 로 변경)
- `src/components/TagInput.tsx`
- `src/components/MarkdownEditor.tsx` — wrapper 만 변경
- `src/components/MarkdownViewer.tsx` — wrapper 만 변경
- `src/lib/db/queries.ts` (조금만): 통계 1줄 헬퍼 추가가 필요하면 — 단, 기존 함수 그대로 활용 가능하면 생략

---

## Task 1: 디자인 토큰 + Pretendard 로드

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: `globals.css` 토큰 정의**

`src/app/globals.css` 전체를 아래로 교체:

```css
@import "tailwindcss";

@theme {
  --color-toss-blue: #3182F6;
  --color-toss-blue-hover: #1B64DA;
  --color-toss-blue-light: #E8F2FF;
  --color-toss-yellow: #FFB22B;

  --color-page-bg: #F2F4F6;
  --color-surface: #FFFFFF;
  --color-surface-2: #F9FAFB;

  --color-text-strong: #191F28;
  --color-text: #333D4B;
  --color-text-muted: #4E5968;
  --color-text-weak: #8B95A1;
  --color-text-placeholder: #B0B8C1;

  --color-border: #E5E8EB;
  --color-border-subtle: #F2F4F6;
  --color-danger: #F04452;

  --radius-toss-sm: 12px;
  --radius-toss: 16px;
  --radius-toss-lg: 20px;

  --shadow-toss: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-toss-hover: 0 6px 16px rgba(17, 24, 39, 0.08);

  --font-sans:
    'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
    'system-ui', 'Segoe UI', Roboto, sans-serif;
}

html, body {
  background: var(--color-page-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.font-tabular { font-variant-numeric: tabular-nums; }

/* Toss-tone prose for MarkdownViewer */
.prose-toss {
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.75;
}
.prose-toss h1, .prose-toss h2, .prose-toss h3 {
  color: var(--color-text-strong);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.prose-toss h1 { font-size: 26px; margin: 1.5em 0 0.6em; }
.prose-toss h2 { font-size: 22px; margin: 1.4em 0 0.5em; }
.prose-toss h3 { font-size: 18px; margin: 1.3em 0 0.4em; }
.prose-toss p { margin: 0.8em 0; }
.prose-toss a { color: var(--color-toss-blue); text-decoration: underline; text-underline-offset: 3px; }
.prose-toss strong { color: var(--color-text-strong); font-weight: 700; }
.prose-toss code {
  background: var(--color-surface-2);
  border-radius: 6px;
  padding: 0.1em 0.4em;
  font-size: 0.9em;
}
.prose-toss blockquote {
  border-left: 3px solid var(--color-toss-blue);
  padding: 0.2em 0 0.2em 1em;
  color: var(--color-text-muted);
  margin: 1em 0;
}
.prose-toss ul, .prose-toss ol { padding-left: 1.4em; margin: 0.8em 0; }
.prose-toss li { margin: 0.3em 0; }
.prose-toss hr { border-color: var(--color-border); margin: 2em 0; }
```

- [ ] **Step 2: `layout.tsx` Pretendard link + 헤더 리스타일**

`src/app/layout.tsx` 전체를 아래로:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: '독후감',
  description: '내가 읽은 책의 기록',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-[var(--color-border-subtle)]">
          <nav className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
            <Link href="/" className="text-[17px] font-bold text-[var(--color-text-strong)] tracking-tight">
              📚 독후감
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/books"
                className="px-3 h-9 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition"
              >
                목록
              </Link>
              <Link
                href="/admin/new"
                className="px-3 h-9 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition"
              >
                관리
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: 빌드 검증**

```bash
pnpm build
```
Expected: 11 routes, 0 errors. 빌드 통과만 확인 (시각은 다음 task 들 이후 점검).

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): 토스 디자인 토큰 + Pretendard + 헤더 리스타일"
```

---

## Task 2: GenreBadge 토스 pill 화

**Files:**
- Modify: `src/components/GenreBadge.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
import type { Genre } from '@/lib/genres'

interface Props {
  genre: Genre | string
  active?: boolean
}

export function GenreBadge({ genre, active = false }: Props) {
  const cls = active
    ? 'bg-[var(--color-toss-blue-light)] text-[var(--color-toss-blue)]'
    : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium ${cls}`}>
      {genre}
    </span>
  )
}
```

- [ ] **Step 2: 단위 테스트 회귀 확인**

```bash
pnpm test -- GenreBadge
```
Expected: 기존 GenreBadge 테스트가 통과해야 함 (text content 가 그대로니까 PASS 예상).

- [ ] **Step 3: 커밋**

```bash
git add src/components/GenreBadge.tsx
git commit -m "feat(design): GenreBadge → 토스 pill 스타일"
```

---

## Task 3: RatingStars 토스 컬러로 (옐로 #FFB22B)

**Files:**
- Modify: `src/components/RatingStars.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
'use client'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[16px] gap-0.5',
  md: 'text-[20px] gap-1',
  lg: 'text-[28px] gap-1',
}

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const editable = !!onChange
  return (
    <div
      className={`inline-flex font-tabular ${SIZE[size]}`}
      aria-label={`별점 ${value}/5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        const color = filled ? 'text-[var(--color-toss-yellow)]' : 'text-[var(--color-border)]'
        const star = <span data-filled={filled} className={color}>★</span>
        if (!editable) return <span key={n}>{star}</span>
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            aria-label={`${n}점`}
            className="leading-none hover:scale-110 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/30 rounded-sm"
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 단위 테스트 회귀 확인**

```bash
pnpm test -- RatingStars
```
Expected: data-filled 속성·aria-label 가 그대로니 PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/components/RatingStars.tsx
git commit -m "feat(design): RatingStars → 토스 옐로 + 토큰 컬러"
```

---

## Task 4: BookCard 흰 카드 + soft shadow

**Files:**
- Modify: `src/components/BookCard.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { BookWithTags } from '@/lib/db/queries'

export function BookCard({ book }: { book: BookWithTags }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
          {book.title}
        </h3>
        <GenreBadge genre={book.genre} />
      </div>
      <p className="mt-1 text-[14px] text-[var(--color-text-muted)] line-clamp-1">{book.author}</p>
      <div className="mt-4 flex items-center justify-between">
        <RatingStars value={book.rating} size="sm" />
        <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">{book.readDate}</time>
      </div>
      {book.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {book.tags.slice(0, 3).map((t) => (
            <li key={t} className="text-[12px] text-[var(--color-text-weak)]">
              #{t}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
```

- [ ] **Step 2: 단위 테스트 회귀 확인**

```bash
pnpm test -- BookCard
```
Expected: 텍스트 컨텐츠 동일 → PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/components/BookCard.tsx
git commit -m "feat(design): BookCard → 흰 카드 + 호버 그림자 + 블루 강조"
```

---

## Task 5: SearchBox — 큰 검색 input + 🔍

**Files:**
- Modify: `src/components/SearchBox.tsx`

- [ ] **Step 1: 코드 교체**

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
    const params = new URLSearchParams(sp.toString())
    const trimmed = q.trim()
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
  }

  return (
    <form onSubmit={submit} className="relative">
      <span
        aria-hidden
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-text-weak)] pointer-events-none"
      >
        🔍
      </span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·작가 검색"
        className="w-full h-12 pl-11 pr-24 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition"
      >
        검색
      </button>
    </form>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/SearchBox.tsx
git commit -m "feat(design): SearchBox → 큰 입력 + 검색 아이콘 + 인라인 CTA"
```

---

## Task 6: Filters → 가로 스크롤 장르 chip + 정렬

**Files:**
- Modify: `src/components/Filters.tsx`

- [ ] **Step 1: 코드 교체** (파일명은 그대로 두되 chip UI 로 변경)

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { GENRES } from '@/lib/genres'

export function Filters() {
  const router = useRouter()
  const sp = useSearchParams()
  const currentGenre = sp.get('genre') ?? ''
  const currentSort = sp.get('sort') ?? 'date'

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
  }

  function ChipButton({ label, value }: { label: string; value: string }) {
    const active = currentGenre === value || (value === '' && currentGenre === '')
    return (
      <button
        type="button"
        onClick={() => setParam('genre', value || null)}
        className={
          'shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition active:scale-[0.97] ' +
          (active
            ? 'bg-[var(--color-toss-blue)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]')
        }
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 -mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          <ChipButton label="전체" value="" />
          {GENRES.map((g) => <ChipButton key={g} label={g} value={g} />)}
        </div>
      </div>
      <select
        value={currentSort}
        onChange={(e) => setParam('sort', e.target.value === 'date' ? null : e.target.value)}
        className="shrink-0 h-9 pl-3 pr-8 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[13px] text-[var(--color-text-strong)] focus:border-[var(--color-toss-blue)] outline-none"
      >
        <option value="date">최근 순</option>
        <option value="rating">별점 순</option>
      </select>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/Filters.tsx
git commit -m "feat(design): Filters → 가로 스크롤 장르 chip + 토스 셀렉트"
```

---

## Task 7: TagInput 토스 input 스타일

**Files:**
- Modify: `src/components/TagInput.tsx`

- [ ] **Step 1: 코드 교체**

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
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/suggest?q=${encodeURIComponent(input.trim())}`)
        if (cancelled || !res.ok) return
        const data = await res.json() as { tags?: unknown }
        const raw = Array.isArray(data.tags) ? (data.tags as string[]) : []
        if (!cancelled) setSuggestions(raw.filter((t) => !value.includes(t)))
      } catch {
        // ignore
      }
    }, 200)
    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
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
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] pl-3 pr-2 py-1 text-[12px] font-medium"
            >
              #{t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`${t} 제거`}
                className="text-[var(--color-text-weak)] hover:text-[var(--color-text-strong)] w-4 h-4 inline-flex items-center justify-center"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
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
        className="w-full h-11 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      {suggestions.length > 0 && (
        <ul className="mt-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-toss-hover)] overflow-hidden">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => add(s)}
                className="block w-full px-4 py-2 text-left text-[14px] text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition"
              >
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

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/TagInput.tsx
git commit -m "feat(design): TagInput → 토스 pill 태그 + 토큰 인풋"
```

---

## Task 8: BookForm 카드 그루핑 + 토스 인풋

**Files:**
- Modify: `src/components/BookForm.tsx`

- [ ] **Step 1: 코드 교체**

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

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

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
    startTransition(async () => {
      const editor = editorRef.current
      if (!editor) {
        setError('에디터가 준비되지 않았습니다. 다시 시도해주세요.')
        return
      }
      const content = editor.getMarkdown()
      const payload = { title, author, genre, readDate, rating, content, tags }
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
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>작가</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} required className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>장르</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>읽은 날짜</label>
            <input type="date" value={readDate} onChange={(e) => setReadDate(e.target.value)} required className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>별점</label>
          <RatingStars value={rating} onChange={setRating} size="lg" />
        </div>
        <div>
          <label className={labelCls}>태그</label>
          <TagInput value={tags} onChange={setTags} />
        </div>
      </section>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)]">
        <label className={labelCls}>본문</label>
        <div className="rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] overflow-hidden">
          <MarkdownEditor ref={editorRef} initialValue={initial?.content ?? ''} />
        </div>
      </section>

      {error && (
        <p className="text-[14px] text-[var(--color-danger)] font-medium">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-12 px-5 rounded-[var(--radius-toss-sm)] text-[15px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition"
        >
          {pending ? '저장 중…' : mode === 'create' ? '등록' : '수정'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/components/BookForm.tsx
git commit -m "feat(design): BookForm → 카드 그루핑 + 토스 인풋·CTA"
```

---

## Task 9: MarkdownViewer prose-toss 클래스 적용

**Files:**
- Modify: `src/components/MarkdownViewer.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
'use client'

import dynamic from 'next/dynamic'

const Viewer = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Viewer),
  { ssr: false, loading: () => <div className="text-[var(--color-text-weak)] text-[14px]">불러오는 중…</div> }
)

export function MarkdownViewer({ initialValue }: { initialValue: string }) {
  return (
    <div className="prose-toss">
      <Viewer initialValue={initialValue} />
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/MarkdownViewer.tsx
git commit -m "feat(design): MarkdownViewer → prose-toss 톤"
```

---

## Task 10: Home — Hero + 통계 + 장르 그리드

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listGenresWithCounts } from '@/lib/db/queries'
import { GENRES } from '@/lib/genres'
import { BookCard } from '@/components/BookCard'

export default async function HomePage() {
  const [all, genreCounts] = await Promise.all([
    listBooks(db, { sort: 'date' }),
    listGenresWithCounts(db),
  ])
  const recent = all.slice(0, 6)
  const countMap = new Map(genreCounts.map((g) => [g.genre, g.count]))

  const total = all.length
  const thisYear = new Date().getFullYear()
  const yearCount = all.filter((b) => b.readDate.startsWith(String(thisYear))).length
  const avgRating =
    total > 0 ? (all.reduce((s, b) => s + b.rating, 0) / total) : 0

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
        <StatCard
          label="평균 별점"
          value={total > 0 ? avgRating.toFixed(1) : '—'}
          suffix={total > 0 ? '/5' : ''}
        />
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
                  'group rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition ' +
                  (count === 0 ? 'opacity-60' : '')
                }
              >
                <div className="text-[15px] font-semibold text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
                  {g}
                </div>
                <div className="mt-1 text-[12px] text-[var(--color-text-weak)] font-tabular">{count}권</div>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[20px] font-bold text-[var(--color-text-strong)]">최근 읽은 책</h2>
        {recent.length === 0 ? (
          <p className="text-[14px] text-[var(--color-text-weak)]">아직 등록된 책이 없습니다.</p>
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
    <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)]">
      <div className="text-[12px] font-medium text-[var(--color-text-weak)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-bold text-[var(--color-text-strong)] font-tabular leading-none">
          {value}
        </span>
        {suffix && (
          <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{suffix}</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat(design): Home → 토스 hero + 통계 카드 + 장르 그리드"
```

---

## Task 11: Books list — 검색 + chip + 결과

**Files:**
- Modify: `src/app/books/page.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
import { Suspense } from 'react'
import { db } from '@/lib/db/client'
import { listBooks, searchBooks } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

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
      year: parseYear(sp.year),
      sort: sp.sort === 'rating' ? 'rating' : 'date',
    })
  }

  const title =
    sp.q ? `"${sp.q}" 검색 결과`
    : sp.genre ? `장르 · ${sp.genre}`
    : sp.tag ? `태그 · ${sp.tag}`
    : '전체 책'

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchBox />
        <Filters />
      </Suspense>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-bold text-[var(--color-text-strong)]">{title}</h2>
        <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{books.length}권</span>
      </div>
      {books.length === 0 ? (
        <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-10 text-center shadow-[var(--shadow-toss)]">
          <p className="text-[14px] text-[var(--color-text-weak)]">결과가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {books.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/app/books/page.tsx
git commit -m "feat(design): Books list → 토스 헤더 + 빈 상태 카드"
```

---

## Task 12: Book detail — 큰 제목 + 본문 카드

**Files:**
- Modify: `src/app/books/[slug]/page.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { getBookBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = await getBookBySlug(db, decodeURIComponent(slug))
  if (!book) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-center gap-2">
          <GenreBadge genre={book.genre} />
          <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">{book.readDate}</time>
        </div>
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {book.title}
        </h1>
        <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">{book.author}</p>
        <div className="mt-4">
          <RatingStars value={book.rating} size="lg" />
        </div>
        {book.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {book.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/books?tag=${encodeURIComponent(t)}`}
                  className="inline-flex items-center rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-toss-blue-light)] hover:text-[var(--color-toss-blue)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-muted)] transition"
                >
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        {book.content ? (
          <MarkdownViewer initialValue={book.content} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/app/books/[slug]/page.tsx
git commit -m "feat(design): Book detail → hero 카드 + 본문 카드 + 토스 태그 링크"
```

---

## Task 13: Login — 중앙 카드

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: 코드 교체**

```tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
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
    const from = sp.get('from')
    const dest = from && from.startsWith('/') && !from.startsWith('//') ? from : '/admin/new'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <div className="rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-toss)]">
        <div className="text-center text-[40px] leading-none">🔒</div>
        <h1 className="mt-4 text-center text-[22px] font-bold text-[var(--color-text-strong)]">
          관리자 로그인
        </h1>
        <p className="mt-1 text-center text-[13px] text-[var(--color-text-weak)]">
          비밀번호를 입력하세요
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
          />
          {error && <p className="text-[13px] text-[var(--color-danger)] font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading || pw.length === 0}
            className="w-full h-12 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition"
          >
            {loading ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/app/login/page.tsx
git commit -m "feat(design): Login → 중앙 토스 카드 + 🔒 아이콘"
```

---

## Task 14: Admin new/edit 페이지 타이틀 hero

**Files:**
- Modify: `src/app/admin/new/page.tsx`
- Modify: `src/app/admin/edit/[id]/page.tsx`

- [ ] **Step 1: `admin/new/page.tsx` 의 제목/감싸기 토스화**

기존 페이지에서 H1 또는 wrapper 부분만 다음으로 변경:

```tsx
// ...imports 그대로
export default function AdminNewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 독후감
      </h1>
      <BookForm mode="create" />
    </div>
  )
}
```

- [ ] **Step 2: `admin/edit/[id]/page.tsx` 동일하게**

H1 텍스트만 "독후감 수정" 으로.

- [ ] **Step 3: 빌드 검증**

```bash
pnpm build
```
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/new/page.tsx src/app/admin/edit/[id]/page.tsx
git commit -m "feat(design): Admin new/edit → 토스 hero 제목"
```

---

## Task 15: 전체 회귀 + E2E + 시각 QA + 최종 정리

**Files:**
- 없음 (검증만)

- [ ] **Step 1: 단위 테스트 회귀**

```bash
pnpm test
```
Expected: 29 passing.

- [ ] **Step 2: 빌드 클린**

```bash
pnpm build
```
Expected: 11 routes, 0 errors.

- [ ] **Step 3: E2E**

```bash
pnpm e2e
```
Expected: 2 passing.

- [ ] **Step 4: 하드코드 컬러 점검**

```bash
grep -rn "#[0-9a-fA-F]\{6\}" src/app src/components | grep -v globals.css
```
Expected: 0 hits. 결과 있으면 토큰으로 교체 후 재 커밋.

- [ ] **Step 5: README "구조" 섹션의 middleware 표기 보정** (중복 수정)

`README.md` 의 `src/middleware.ts` → `src/proxy.ts` 로 (이미 마이그레이션됨).

- [ ] **Step 6: 최종 커밋** (있다면)

```bash
git add -A
git commit -m "chore(design): 토큰 일관성·README 후처리"
```

---

## 완료 기준

- 15 task 모두 커밋.
- `pnpm test`, `pnpm build`, `pnpm e2e` 모두 통과.
- 브라우저(http://localhost:3000) 에서 5개 페이지(/ /books /books/[slug] /login /admin/new) 가 토스 톤으로 보임.
- 하드코드 hex 컬러 0개 (`globals.css` 외).
