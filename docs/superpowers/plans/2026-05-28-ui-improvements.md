# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4가지 UI 개선 — 모바일 nav 햄버거, 카드 한줄평 인용 스타일, nav 라벨 변경, 카드 클릭 → 작품 검색 이동.

**Architecture:** 기존 SSR 위주 Next.js App Router 패턴 유지. `<details>` 디스클로저로 햄버거 구현(hydration 0 비용). `PublicReviewCard`/`PublicMovieCard`를 `<Link>`로 감싸 카드 전체 클릭 가능화. `<blockquote>` semantic + border-l 스타일로 한줄평 위계 격상.

**Tech Stack:** Next.js 16 App Router, Tailwind, Toss design tokens (`var(--color-*)`), Vitest + React Testing Library (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-05-28-ui-improvements-design.md`

---

## File Structure

**Modify:**
- `src/app/layout.tsx` — nav 라벨 + 데스크톱/모바일 분기 + 햄버거 disclosure (Task 1, Task 4)
- `src/components/PublicReviewCard.tsx` — Link 래핑 + blockquote 인용 스타일 (Task 2, Task 3)
- `src/components/PublicMovieCard.tsx` — Link 래핑 + blockquote 인용 스타일 (Task 2, Task 3)
- `tests/unit/PublicReviewCard.test.tsx` — 기존 "non-clickable" 테스트를 "clickable with /works href"로 갱신, blockquote 검증 추가

**Create:**
- `tests/unit/PublicMovieCard.test.tsx` — PublicReviewCard와 동일 패턴
- `tests/e2e/nav-mobile.spec.ts` — 모바일 viewport 햄버거 토글 + 메뉴 항목 클릭
- `tests/e2e/public-card-click.spec.ts` — 카드 클릭 → /works 이동 회귀 가드

---

## Task 1: Nav 라벨 변경 (책장 → 내 책장, 영화관 → 내 영화관)

가장 단순한 변경부터. e2e가 빠른 피드백 루프 제공.

**Files:**
- Modify: `src/app/layout.tsx:50-61`
- Test: `tests/e2e/nav-mobile.spec.ts` (단, 이 작업 시점엔 데스크톱 텍스트만 검증 — 기존 spec 파일에 추가)

### Step 1.1: 기존 e2e 회귀 가드 추가 (실패)

**Files:**
- Test: `tests/e2e/golden-path.spec.ts` 또는 신규 `tests/e2e/nav-labels.spec.ts`

신규 파일 생성 — golden-path는 다른 흐름에 집중.

- [ ] **Step 1.1.1: 실패하는 테스트 작성**

Create `tests/e2e/nav-labels.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

test('데스크톱 nav에 "내 책장", "내 영화관" 라벨 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await expect(page.getByRole('link', { name: /📚 내 책장/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /🎬 내 영화관/ })).toBeVisible()
})
```

- [ ] **Step 1.1.2: 테스트 실행하여 실패 확인**

Run: `pnpm exec playwright test tests/e2e/nav-labels.spec.ts -g "내 책장"`
Expected: FAIL — `📚 책장`이지 `📚 내 책장`이 아님

### Step 1.2: layout.tsx 라벨 변경

- [ ] **Step 1.2.1: layout.tsx 두 곳 수정**

`src/app/layout.tsx`에서:
- 54번 줄: `📚 책장` → `📚 내 책장`
- 60번 줄: `🎬 영화관` → `🎬 내 영화관`

```tsx
<Link
  href="/books"
  className="..."
>
  📚 내 책장
</Link>
<Link
  href="/movies"
  className="..."
>
  🎬 내 영화관
</Link>
```

- [ ] **Step 1.2.2: 테스트 실행하여 통과 확인**

Run: `pnpm exec playwright test tests/e2e/nav-labels.spec.ts`
Expected: PASS

- [ ] **Step 1.2.3: 영향 받는 기존 e2e 검사**

다른 spec이 `📚 책장`/`🎬 영화관` 텍스트로 매칭하고 있는지 확인:

Run: `grep -rn "📚 책장\|🎬 영화관" tests/`
Expected: 어떤 spec이 영향 받는지 출력. 매칭되는 spec이 있다면 새 라벨로 갱신.

특히 `tests/e2e/works-search.spec.ts:33`의 `getByRole('link', { name: /📚 책/ })`는 탭 링크(`/feed?type=book`)를 가리키므로 영향 없음.

- [ ] **Step 1.2.4: 전체 e2e 회귀 확인**

Run: `pnpm e2e` (시간 걸림, background로 실행 가능)
Expected: PASS

- [ ] **Step 1.2.5: 커밋**

```bash
git add src/app/layout.tsx tests/e2e/nav-labels.spec.ts
git commit -m "feat(nav): rename 책장/영화관 to 내 책장/내 영화관"
```

---

## Task 2: 카드 클릭 → /works 이동 (Link 래핑)

`PublicReviewCard`, `PublicMovieCard`의 `<article>`을 `<Link>`로 감싸 카드 전체 클릭 가능화.

**Files:**
- Modify: `src/components/PublicReviewCard.tsx`
- Modify: `src/components/PublicMovieCard.tsx`
- Modify: `tests/unit/PublicReviewCard.test.tsx`
- Create: `tests/unit/PublicMovieCard.test.tsx`

### Step 2.1: PublicReviewCard 테스트 갱신 (실패)

기존 `is non-clickable` 테스트는 의도 반전 — clickable로 변경 + 올바른 href 검증.

- [ ] **Step 2.1.1: 테스트 수정**

`tests/unit/PublicReviewCard.test.tsx`의 기존 케이스 교체:

```tsx
it('is clickable — wraps in anchor with /works book search href', () => {
  const { container } = render(<PublicReviewCard item={baseProps} />)
  const anchor = container.querySelector('a')
  expect(anchor).not.toBeNull()
  expect(anchor!.getAttribute('href')).toBe(
    `/works?type=book&q=${encodeURIComponent('데미안')}`
  )
})
```

기존 36-40번 줄(`is non-clickable`)을 위 코드로 교체.

- [ ] **Step 2.1.2: 테스트 실행하여 실패 확인**

Run: `pnpm exec vitest run tests/unit/PublicReviewCard.test.tsx`
Expected: FAIL — 현재 컴포넌트에 `<a>` 없음

### Step 2.2: PublicReviewCard Link 래핑 구현

- [ ] **Step 2.2.1: PublicReviewCard.tsx 수정**

`src/components/PublicReviewCard.tsx`에서 import + `<article>` → `<Link><article>` 래핑:

```tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { PublicBookCard } from '@/lib/db/queries'

interface Props {
  item: PublicBookCard
}

function formatRelative(ts: number): string {
  // (unchanged)
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
  const href = `/works?type=book&q=${encodeURIComponent(item.title)}`
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-toss)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
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
        <div className="mt-4 flex gap-3">
          {item.coverUrl && (
            <Image
              src={item.coverUrl}
              alt=""
              width={40}
              height={60}
              className="flex-shrink-0 rounded-sm object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
              {item.title}
            </h3>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
              {item.author}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
          <span className="font-semibold text-[var(--color-text-muted)]">
            {item.authorDisplayName}
          </span>
          <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
        </div>
      </article>
    </Link>
  )
}
```

Note: Task 3에서 blockquote 스타일로 다시 손볼 예정 — 여기선 Link 래핑만.

- [ ] **Step 2.2.2: 테스트 실행하여 통과 확인**

Run: `pnpm exec vitest run tests/unit/PublicReviewCard.test.tsx`
Expected: PASS

### Step 2.3: PublicMovieCard 테스트 신규 + 구현

- [ ] **Step 2.3.1: PublicMovieCard 테스트 작성 (실패)**

Create `tests/unit/PublicMovieCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicMovieCard } from '@/components/PublicMovieCard'

const baseProps = {
  id: 1,
  slug: 's',
  title: '인터스텔라',
  director: '크리스토퍼 놀란',
  genre: 'SF',
  rating: 5,
  oneLineReview: '시간이 흐른다',
  coverUrl: null,
  publishedAt: Date.now(),
  authorDisplayName: '앨리스',
}

describe('PublicMovieCard', () => {
  it('renders title, director, displayName, rating', () => {
    render(<PublicMovieCard item={baseProps} />)
    expect(screen.getByText('인터스텔라')).toBeInTheDocument()
    expect(screen.getByText('크리스토퍼 놀란')).toBeInTheDocument()
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })

  it('renders oneLineReview when present', () => {
    render(<PublicMovieCard item={baseProps} />)
    expect(screen.getByText('시간이 흐른다')).toBeInTheDocument()
  })

  it('omits oneLineReview block when null', () => {
    render(<PublicMovieCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(screen.queryByText('시간이 흐른다')).not.toBeInTheDocument()
  })

  it('is clickable — wraps in anchor with /works movie search href', () => {
    const { container } = render(<PublicMovieCard item={baseProps} />)
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe(
      `/works?type=movie&q=${encodeURIComponent('인터스텔라')}`
    )
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(<PublicMovieCard item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }} />)
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })
})
```

- [ ] **Step 2.3.2: 테스트 실행하여 실패 확인**

Run: `pnpm exec vitest run tests/unit/PublicMovieCard.test.tsx`
Expected: FAIL — `is clickable` 케이스가 fail (anchor 없음)

- [ ] **Step 2.3.3: PublicMovieCard.tsx 수정**

`src/components/PublicMovieCard.tsx`에 `import Link from 'next/link'` 추가하고 `<article>` 래핑을 `PublicReviewCard`와 동일 패턴으로:

```tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { PublicMovieCard as PublicMovieCardItem } from '@/lib/db/queries'

interface Props {
  item: PublicMovieCardItem
}

function formatRelative(ts: number): string {
  // (unchanged — copy from existing file)
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

export function PublicMovieCard({ item }: Props) {
  const href = `/works?type=movie&q=${encodeURIComponent(item.title)}`
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-toss)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
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
        <div className="mt-4 flex gap-3">
          {item.coverUrl && (
            <Image
              src={item.coverUrl}
              alt=""
              width={40}
              height={60}
              className="flex-shrink-0 rounded-sm object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
              {item.title}
            </h3>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
              {item.director}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
          <span className="font-semibold text-[var(--color-text-muted)]">
            {item.authorDisplayName}
          </span>
          <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
        </div>
      </article>
    </Link>
  )
}
```

- [ ] **Step 2.3.4: 테스트 실행하여 통과 확인**

Run: `pnpm exec vitest run tests/unit/PublicMovieCard.test.tsx`
Expected: PASS

### Step 2.4: e2e 회귀 가드 추가

- [ ] **Step 2.4.1: e2e 테스트 작성**

Create `tests/e2e/public-card-click.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page, next = '/feed') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(new RegExp(next.replace(/[/]/g, '\\/')), { timeout: 10_000 })
}

test('모두의 서재 카드 클릭 → /works?type=book&q=<title> 이동', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page, '/feed?type=book')
  await expect(page.getByRole('heading', { name: '모두의 서재' })).toBeVisible({ timeout: 10_000 })

  // 첫 카드 클릭 — 카드 전체가 a로 래핑됐으므로 a[href^="/works?type=book"] 매칭
  const firstCard = page.locator('a[href^="/works?type=book"]').first()
  await firstCard.click()
  await expect(page).toHaveURL(/\/works\?type=book&q=/)
})

test('모두의 영화관 카드 클릭 → /works?type=movie&q=<title> 이동', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page, '/feed?type=movie')
  await expect(page.getByRole('heading', { name: '모두의 영화관' })).toBeVisible({
    timeout: 10_000,
  })

  const firstCard = page.locator('a[href^="/works?type=movie"]').first()
  await firstCard.click()
  await expect(page).toHaveURL(/\/works\?type=movie&q=/)
})
```

- [ ] **Step 2.4.2: 테스트 실행하여 통과 확인**

Run: `pnpm exec playwright test tests/e2e/public-card-click.spec.ts`
Expected: PASS

- [ ] **Step 2.4.3: 커밋**

```bash
git add src/components/PublicReviewCard.tsx src/components/PublicMovieCard.tsx \
  tests/unit/PublicReviewCard.test.tsx tests/unit/PublicMovieCard.test.tsx \
  tests/e2e/public-card-click.spec.ts
git commit -m "feat(feed): public card click navigates to /works search"
```

---

## Task 3: 카드 한줄평 blockquote 인용 스타일

`PublicReviewCard`, `PublicMovieCard` 내부 레이아웃 재배치 + `<p>` → `<blockquote>` 변환.

**Files:**
- Modify: `src/components/PublicReviewCard.tsx`
- Modify: `src/components/PublicMovieCard.tsx`
- Modify: `tests/unit/PublicReviewCard.test.tsx`
- Modify: `tests/unit/PublicMovieCard.test.tsx`

### Step 3.1: blockquote 검증 테스트 추가 (실패)

- [ ] **Step 3.1.1: PublicReviewCard 테스트에 blockquote 케이스 추가**

`tests/unit/PublicReviewCard.test.tsx`에 추가:

```tsx
it('renders oneLineReview inside a <blockquote> when present', () => {
  const { container } = render(<PublicReviewCard item={baseProps} />)
  const bq = container.querySelector('blockquote')
  expect(bq).not.toBeNull()
  expect(bq!.textContent).toContain('인생 책')
})

it('omits <blockquote> when oneLineReview is null', () => {
  const { container } = render(<PublicReviewCard item={{ ...baseProps, oneLineReview: null }} />)
  expect(container.querySelector('blockquote')).toBeNull()
})
```

- [ ] **Step 3.1.2: PublicMovieCard 테스트에 동일 케이스 추가**

`tests/unit/PublicMovieCard.test.tsx`에 추가:

```tsx
it('renders oneLineReview inside a <blockquote> when present', () => {
  const { container } = render(<PublicMovieCard item={baseProps} />)
  const bq = container.querySelector('blockquote')
  expect(bq).not.toBeNull()
  expect(bq!.textContent).toContain('시간이 흐른다')
})

it('omits <blockquote> when oneLineReview is null', () => {
  const { container } = render(<PublicMovieCard item={{ ...baseProps, oneLineReview: null }} />)
  expect(container.querySelector('blockquote')).toBeNull()
})
```

- [ ] **Step 3.1.3: 테스트 실행하여 실패 확인**

Run: `pnpm exec vitest run tests/unit/PublicReviewCard.test.tsx tests/unit/PublicMovieCard.test.tsx`
Expected: FAIL — 양쪽 blockquote 케이스 fail (아직 `<p>` 사용 중)

### Step 3.2: PublicReviewCard 레이아웃 재배치

`<article>` 내부 순서: 표지+제목/저자 → blockquote → 별점+장르 → footer.

- [ ] **Step 3.2.1: PublicReviewCard.tsx 갱신**

`src/components/PublicReviewCard.tsx`의 `<article>` 내부를 다음으로 교체:

```tsx
<article className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition">
  <div className="flex gap-3">
    {item.coverUrl && (
      <Image
        src={item.coverUrl}
        alt=""
        width={40}
        height={60}
        className="flex-shrink-0 rounded-sm object-cover"
      />
    )}
    <div className="min-w-0 flex-1">
      <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
        {item.title}
      </h3>
      <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
        {item.author}
      </p>
    </div>
  </div>
  {item.oneLineReview && (
    <blockquote className="mt-4 border-l-4 border-[var(--color-toss-blue)] pl-3 py-1 flex gap-1">
      <span aria-hidden className="text-[24px] text-[var(--color-text-weak)] leading-none select-none">
        &ldquo;
      </span>
      <p className="text-[15px] leading-relaxed font-medium text-[var(--color-text-strong)] line-clamp-3">
        {item.oneLineReview}
      </p>
    </blockquote>
  )}
  <div className="mt-4 flex items-center justify-between gap-3">
    <RatingStars value={item.rating} size="sm" />
    <GenreBadge genre={item.genre} />
  </div>
  <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
    <span className="font-semibold text-[var(--color-text-muted)]">
      {item.authorDisplayName}
    </span>
    <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
  </div>
</article>
```

- [ ] **Step 3.2.2: PublicReviewCard 테스트 실행하여 통과 확인**

Run: `pnpm exec vitest run tests/unit/PublicReviewCard.test.tsx`
Expected: PASS — 신규 blockquote 케이스 + 기존 `renders oneLineReview when present`, `omits oneLineReview block when null` 모두 통과.

기존 케이스 (`'is clickable'`, `'escapes HTML'` 등)도 영향 없는지 확인.

### Step 3.3: PublicMovieCard 동일 패턴 적용

- [ ] **Step 3.3.1: PublicMovieCard.tsx 갱신**

`src/components/PublicMovieCard.tsx`의 `<article>` 내부를 `PublicReviewCard`와 동일 패턴으로 교체. `item.author` 대신 `item.director` 사용:

```tsx
<article className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition">
  <div className="flex gap-3">
    {item.coverUrl && (
      <Image
        src={item.coverUrl}
        alt=""
        width={40}
        height={60}
        className="flex-shrink-0 rounded-sm object-cover"
      />
    )}
    <div className="min-w-0 flex-1">
      <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
        {item.title}
      </h3>
      <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
        {item.director}
      </p>
    </div>
  </div>
  {item.oneLineReview && (
    <blockquote className="mt-4 border-l-4 border-[var(--color-toss-blue)] pl-3 py-1 flex gap-1">
      <span aria-hidden className="text-[24px] text-[var(--color-text-weak)] leading-none select-none">
        &ldquo;
      </span>
      <p className="text-[15px] leading-relaxed font-medium text-[var(--color-text-strong)] line-clamp-3">
        {item.oneLineReview}
      </p>
    </blockquote>
  )}
  <div className="mt-4 flex items-center justify-between gap-3">
    <RatingStars value={item.rating} size="sm" />
    <GenreBadge genre={item.genre} />
  </div>
  <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
    <span className="font-semibold text-[var(--color-text-muted)]">
      {item.authorDisplayName}
    </span>
    <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
  </div>
</article>
```

- [ ] **Step 3.3.2: PublicMovieCard 테스트 통과 확인**

Run: `pnpm exec vitest run tests/unit/PublicMovieCard.test.tsx`
Expected: PASS

- [ ] **Step 3.3.3: 시각 검증 (dev server)**

Run: `pnpm dev` (background)

브라우저에서 `http://localhost:3000/` 로그인 후 홈 진입 → `모두의 서재` / `모두의 영화관` 섹션에 인용 블록이 메인 콘텐츠로 노출되는지 확인. `/feed`, `/feed?type=movie`도 확인.

Dev server stop: 작업 끝나면 background process kill.

- [ ] **Step 3.3.4: 커밋**

```bash
git add src/components/PublicReviewCard.tsx src/components/PublicMovieCard.tsx \
  tests/unit/PublicReviewCard.test.tsx tests/unit/PublicMovieCard.test.tsx
git commit -m "feat(feed): blockquote treatment for oneLineReview"
```

---

## Task 4: 모바일 햄버거 메뉴

`layout.tsx` 헤더에 `md` breakpoint 분기 + `<details>` 햄버거.

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `tests/e2e/nav-mobile.spec.ts`

### Step 4.1: e2e 모바일 테스트 작성 (실패)

- [ ] **Step 4.1.1: 테스트 파일 생성**

Create `tests/e2e/nav-mobile.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'
const MOBILE_VIEWPORT = { width: 375, height: 667 } as const

async function login(page: Page) {
  await page.goto('/login?next=/')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

test('모바일 viewport에서 햄버거 버튼 표시, 데스크톱 nav 링크 숨김', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT)
  await login(page)
  await expect(page.getByLabel('메뉴 열기')).toBeVisible()
  // 데스크톱 전용 컨테이너는 숨김 — 그 안의 "내 책장" 링크가 보이지 않아야 함
  await expect(page.getByRole('link', { name: /📚 내 책장/ })).toBeHidden()
})

test('햄버거 클릭 → 패널 열림 → 내 책장 클릭 → /books 이동', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT)
  await login(page)
  await page.getByLabel('메뉴 열기').click()
  const panelLink = page.getByRole('link', { name: /📚 내 책장/ })
  await expect(panelLink).toBeVisible()
  await panelLink.click()
  await expect(page).toHaveURL('/books', { timeout: 10_000 })
})

test('데스크톱 viewport에서는 햄버거 숨김, nav 링크 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await expect(page.getByLabel('메뉴 열기')).toBeHidden()
  await expect(page.getByRole('link', { name: /📚 내 책장/ })).toBeVisible()
})
```

- [ ] **Step 4.1.2: 테스트 실행하여 실패 확인**

Run: `pnpm exec playwright test tests/e2e/nav-mobile.spec.ts`
Expected: FAIL — `메뉴 열기` 라벨 가진 버튼 없음

### Step 4.2: layout.tsx 햄버거 구현

- [ ] **Step 4.2.1: 데스크톱 nav를 `hidden md:flex` 래퍼로 감싸기**

`src/app/layout.tsx`에서 현재 `<div className="flex items-center gap-1">` 를 두 부분으로 분기:

```tsx
{/* Desktop nav — md 이상 */}
<div className="hidden md:flex items-center gap-1">
  {me ? (
    <>
      <Link href="/books" className="...">📚 내 책장</Link>
      <Link href="/movies" className="...">🎬 내 영화관</Link>
      <Link href="/works" className="...">🔍 작품 검색</Link>
      <Link href="/writings" className="...">✏️ 글방</Link>
      <UserMenu displayName={me.displayName} role={me.role as 'admin' | 'member'} />
    </>
  ) : (
    <Link href="/login" className="...">로그인</Link>
  )}
  <ThemeToggle />
</div>

{/* Mobile nav — md 미만 */}
<div className="flex md:hidden items-center gap-1">
  <ThemeToggle />
  {me ? (
    <MobileMenu displayName={me.displayName} role={me.role as 'admin' | 'member'} />
  ) : (
    <Link href="/login" className="...">로그인</Link>
  )}
</div>
```

각 `className="..."` 부분은 기존 스타일 유지.

- [ ] **Step 4.2.2: MobileMenu 함수 추가**

`src/app/layout.tsx` 하단에 `UserMenu` 옆에 추가:

```tsx
function MobileMenu({
  displayName,
  role,
}: {
  displayName: string
  role: 'admin' | 'member'
}) {
  return (
    <details className="relative">
      <summary
        aria-label="메뉴 열기"
        className="list-none cursor-pointer h-11 w-11 inline-flex items-center justify-center rounded-[var(--radius-toss-sm)] text-[20px] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        <span aria-hidden>☰</span>
      </summary>
      <div className="absolute right-0 mt-1 w-56 rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
        <Link href="/books" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          📚 내 책장
        </Link>
        <Link href="/movies" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          🎬 내 영화관
        </Link>
        <Link href="/works" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          🔍 작품 검색
        </Link>
        <Link href="/writings" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          ✏️ 글방
        </Link>
        <div className="border-t border-[var(--color-border-subtle)] my-1" />
        <div className="px-4 py-2 text-[12px] text-[var(--color-text-muted)]">{displayName}</div>
        <Link href="/settings/profile" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          프로필 변경
        </Link>
        <Link href="/settings/password" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
          비밀번호 변경
        </Link>
        {role === 'admin' && (
          <Link href="/admin/users" className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]">
            사용자 관리
          </Link>
        )}
        <form
          action="/api/logout"
          method="POST"
          className="border-t border-[var(--color-border-subtle)] mt-1 pt-1"
        >
          <button
            type="submit"
            className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            로그아웃
          </button>
        </form>
      </div>
    </details>
  )
}
```

- [ ] **Step 4.2.3: e2e 테스트 실행하여 통과 확인**

Run: `pnpm exec playwright test tests/e2e/nav-mobile.spec.ts`
Expected: PASS — 모든 케이스 통과

- [ ] **Step 4.2.4: 시각 검증 (dev server)**

Run: `pnpm dev` (background)

브라우저 DevTools 모바일 viewport(375x667)에서:
- 햄버거 보이는지, 클릭 시 패널 열리는지
- 패널 내 모든 링크가 동작하는지
- 1280px 이상에서 햄버거 숨겨지고 기존 nav가 보이는지

Stop background process when done.

- [ ] **Step 4.2.5: 커밋**

```bash
git add src/app/layout.tsx tests/e2e/nav-mobile.spec.ts
git commit -m "feat(nav): mobile hamburger menu with disclosure pattern"
```

---

## Task 5: 전체 회귀 검증 + 빌드

- [ ] **Step 5.1: lint 통과**

Run: `pnpm lint`
Expected: 0 errors

위반 발견 시 `pnpm format` 적용 후 재실행.

- [ ] **Step 5.2: 단위 + 통합 테스트 전체 통과**

Run: `pnpm test`
Expected: 모든 테스트 통과

- [ ] **Step 5.3: e2e 전체 통과**

Run: `pnpm e2e` (시간 걸림 — background로 실행 가능)
Expected: 모든 spec PASS

- [ ] **Step 5.4: 프로덕션 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공, type 에러 없음

- [ ] **Step 5.5: 빈 커밋 없이 최종 확인**

Run: `git status`
Expected: working tree clean

---

## Verification Checklist (수동 QA)

브라우저에서 다음을 확인:

- [ ] 데스크톱(1280px): nav에 `📚 내 책장`, `🎬 내 영화관` 표시
- [ ] 모바일(375px): 햄버거 ☰ 표시, 클릭 시 패널 펼침
- [ ] 모바일 패널: 4개 nav 링크 + 사용자 메뉴 항목 노출, 로그아웃 form 동작
- [ ] `/` 홈 진입 → `모두의 서재` 카드에 큰 따옴표 인용 블록 + 좌측 파란 border 표시
- [ ] 카드 hover 시 그림자 강화, 카드 전체 클릭 가능
- [ ] 책 카드 클릭 → `/works?type=book&q=<제목>` 진입
- [ ] 영화 카드 클릭 → `/works?type=movie&q=<제목>` 진입
- [ ] `/feed`, `/feed?type=movie`에서도 동일 카드 동작
- [ ] 키보드 Tab으로 카드 포커스 가능, focus ring 표시

---

## Rollback Plan

각 task가 독립 커밋이므로 문제 발생 시 해당 커밋만 `git revert`. 권장 순서:

1. 시각 회귀가 보이면 → Task 3 (blockquote) revert
2. 카드 라우팅 이슈 → Task 2 (Link 래핑) revert
3. 모바일 메뉴 이슈 → Task 4 (햄버거) revert
4. nav 라벨만 별도 → Task 1 revert
