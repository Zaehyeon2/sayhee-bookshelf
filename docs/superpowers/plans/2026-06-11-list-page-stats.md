# 리스트 페이지 통계 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 책장(`/books`)·내 영화관(`/movies`)·글방(`/writings`) 리스트 페이지에 접이식 통계 대시보드 추가 — 펼칠 때만 fetch, chart.js 렌더.

**Architecture:** 도메인당 dashboard 집계 함수 1개(`stats.ts`) → GET API route 3개 → `'use client'` 접이식 패널이 첫 펼침에 fetch → `next/dynamic`으로 lazy load된 chart.js 차트 렌더. 전부 전 기간 누적, 연도 선택기 없음.

**Tech Stack:** Next.js 16 App Router · Drizzle/libSQL · chart.js + react-chartjs-2 · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-06-10-list-page-stats-design.md`

**중요 컨텍스트 (코드베이스 무지 가정):**
- rating은 책·영화 **둘 다 1~10 저장** (`CHECK BETWEEN 1 AND 10`). 표시는 `/2` = 0.5~5 별점 스케일 — 히스토그램 라벨도 /2.
- 모든 집계 쿼리 WHERE에 `author_user_id = userId` 필수 — 멀티테넌트 invariant. 누락 시 타 사용자 데이터 누출.
- `src/lib/db/queries.ts`는 barrel(`export * from './queries/stats'`) — stats.ts에 export 추가하면 자동 노출.
- main에 사전 lint 에러 18건 존재 — `pnpm lint` 전체 실행 결과를 믿지 말고 **변경 파일만** `pnpm exec biome check <paths>`로 검사.
- 테스트 DB는 `tests/setup-db.ts`의 `makeTestDb()` (파일 기반 임시 SQLite), factory는 `tests/factories.ts`.
- Biome 스타일: 싱글 따옴표, 세미콜론 as-needed, trailing comma all, 2-space indent.

---

## File Structure

```
Create:
  src/app/api/books/stats/route.ts
  src/app/api/movies/stats/route.ts
  src/app/api/writings/stats/route.ts
  src/components/stats/StatsPanel.tsx        접이식 셸 + lazy fetch
  src/components/stats/StatsDashboard.tsx    도메인별 위젯 배치 + chart dynamic import
  src/components/stats/SummaryCards.tsx      숫자 카드
  src/components/stats/charts.tsx            chart.js register + Bar/Doughnut 래퍼
  tests/integration/stats-dashboard.test.ts
  tests/unit/stats-routes.test.ts
  tests/e2e/stats-panel.spec.ts
Modify:
  src/lib/db/queries/stats.ts                dashboard 함수 3개 + CountItem 추가
  src/app/books/page.tsx                     StatsPanel 삽입
  src/app/movies/page.tsx                    StatsPanel 삽입
  src/app/writings/page.tsx                  StatsPanel 삽입
  package.json                               chart.js, react-chartjs-2
```

---

### Task 1: 의존성 설치

**Files:**
- Modify: `package.json` (pnpm이 자동 수정)

- [ ] **Step 1: chart.js + react-chartjs-2 설치**

```bash
pnpm add chart.js react-chartjs-2
```

Expected: `package.json` dependencies에 두 패키지 추가, exit 0.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: chart.js + react-chartjs-2 추가 (통계 대시보드)"
```

---

### Task 2: getBookDashboard (TDD)

**Files:**
- Modify: `src/lib/db/queries/stats.ts`
- Test: `tests/integration/stats-dashboard.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/integration/stats-dashboard.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getBookDashboard } from '@/lib/db/queries'
import { tags, bookTags } from '@/lib/db/schema'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

async function getOrCreateTagId(db: TestDb, name: string): Promise<number> {
  const existing = await db.select().from(tags).where(eq(tags.name, name))
  if (existing.length > 0) return existing[0].id
  const [t] = await db.insert(tags).values({ name }).returning()
  return t.id
}

async function tagBook(db: TestDb, bookId: number, name: string) {
  const tagId = await getOrCreateTagId(db, name)
  await db.insert(bookTags).values({ bookId, tagId })
}

describe('getBookDashboard', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('rating/genre/year/author 집계가 정확하다', async () => {
    const u = await createUser(db, { username: 'alice' })
    const b1 = await createBook(db, u.id, {
      rating: 8,
      genre: '소설',
      readDate: '2025-03-01',
      author: '김작가',
    })
    await createBook(db, u.id, {
      rating: 8,
      genre: '소설',
      readDate: '2025-05-01',
      author: '김작가',
    })
    await createBook(db, u.id, {
      rating: 3,
      genre: '에세이',
      readDate: '2026-01-01',
      author: '박작가',
    })
    await tagBook(db, b1.id, '여름')

    const d = await getBookDashboard(db, u.id, 2026)

    expect(d.summary.total).toBe(3)
    expect(d.summary.thisYear).toBe(1)
    expect(d.summary.avgRating).toBeCloseTo(19 / 3)
    // ratingDist는 10칸 전부 채움 (빈 칸 0), 라벨은 /2 스케일 (0.5~5)
    expect(d.ratingDist).toHaveLength(10)
    expect(d.ratingDist[7]).toEqual({ label: '4', count: 2 }) // 저장값 8 → 표시 4
    expect(d.ratingDist[0]).toEqual({ label: '0.5', count: 0 })
    expect(d.genreDist).toEqual([
      { label: '소설', count: 2 },
      { label: '에세이', count: 1 },
    ])
    expect(d.yearTimeline).toEqual([
      { label: '2025', count: 2 },
      { label: '2026', count: 1 },
    ])
    expect(d.topTags).toEqual([{ label: '여름', count: 1 }])
    expect(d.topAuthors[0]).toEqual({ label: '김작가', count: 2 })
  })

  it('cross-user 격리 — 타 사용자 책이 안 섞인다', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { rating: 10, genre: '소설' })
    await createBook(db, b.id, { rating: 1, genre: 'SF' })

    const d = await getBookDashboard(db, a.id, 2026)

    expect(d.summary.total).toBe(1)
    expect(d.summary.avgRating).toBe(10)
    expect(d.genreDist).toEqual([{ label: '소설', count: 1 }])
  })

  it('빈 데이터 — 0/null/빈 배열', async () => {
    const u = await createUser(db, { username: 'alice' })

    const d = await getBookDashboard(db, u.id, 2026)

    expect(d.summary).toEqual({ total: 0, thisYear: 0, avgRating: null })
    expect(d.ratingDist).toHaveLength(10)
    expect(d.ratingDist.every((r) => r.count === 0)).toBe(true)
    expect(d.genreDist).toEqual([])
    expect(d.yearTimeline).toEqual([])
    expect(d.topTags).toEqual([])
    expect(d.topAuthors).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: FAIL — `getBookDashboard`가 `@/lib/db/queries`에 없음 (import error).

- [ ] **Step 3: 구현**

`src/lib/db/queries/stats.ts` 끝에 추가 (기존 import 줄은 그대로 — `sql`, `books`, `writings`, `movies`, `Db` 이미 import됨. `tags`, `bookTags` import 추가 필요):

파일 상단 import를 다음으로 교체:

```ts
import { sql } from 'drizzle-orm'
import { books, writings, movies, tags, bookTags, movieTags, writingTags } from '../schema'
import type { Db } from './shared'
```

파일 끝에 추가:

```ts
/** 대시보드 위젯 공용 항목 — chart.js 카테고리 축에 그대로 매핑 */
export interface CountItem {
  label: string
  count: number
}

export interface BookDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[] // 1~10 전 칸, 빈 칸 0
  genreDist: CountItem[] // count DESC
  yearTimeline: CountItem[] // 연도 ASC, 기록 있는 연도만
  topTags: CountItem[] // 최대 5
  topAuthors: CountItem[] // 최대 5
}

function toCountItems(rows: unknown): CountItem[] {
  return (rows as Array<{ label: string | number; count: number }>).map((r) => ({
    label: String(r.label),
    count: Number(r.count),
  }))
}

/**
 * rating 1~10 전 칸 채움 — 히스토그램 축 고정용.
 * 라벨은 저장값/2 = 0.5~5 — 사이트 별점 표시 관례(RatingScore)와 동일 스케일.
 */
function fillRatingDist(rows: CountItem[]): CountItem[] {
  const byLabel = new Map(rows.map((r) => [r.label, r.count]))
  return Array.from({ length: 10 }, (_, i) => {
    const raw = String(i + 1) // DB 저장값 키 (1~10)
    return { label: String((i + 1) / 2), count: byLabel.get(raw) ?? 0 }
  })
}

/**
 * 책장 대시보드 — 전부 인덱스 위 COUNT/AVG/GROUP BY, 본문 row 미조회.
 * readDate는 user-typed `YYYY-MM-DD` 텍스트 → substr/LIKE로 TZ-free 연도 버킷.
 */
export async function getBookDashboard(
  db: Db,
  userId: number,
  year: number = new Date().getFullYear(),
): Promise<BookDashboard> {
  const yearPrefix = `${year}-%`

  const [summaryRows, ratingRows, genreRows, yearRows, tagRows, authorRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${books}
           WHERE ${books.authorUserId} = ${userId}
             AND ${books.readDate} LIKE ${yearPrefix}) AS this_year,
        (SELECT AVG(${books.rating}) FROM ${books}
           WHERE ${books.authorUserId} = ${userId}) AS avg_rating
    `),
    db.all(sql`
      SELECT ${books.rating} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.rating}
    `),
    db.all(sql`
      SELECT ${books.genre} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.genre}
      ORDER BY COUNT(*) DESC, label
    `),
    db.all(sql`
      SELECT substr(${books.readDate}, 1, 4) AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${bookTags}
      JOIN ${books} ON ${bookTags.bookId} = ${books.id}
      JOIN ${tags} ON ${bookTags.tagId} = ${tags.id}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT ${books.author} AS label, COUNT(*) AS count FROM ${books}
      WHERE ${books.authorUserId} = ${userId}
      GROUP BY ${books.author}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
  ])

  const s = (summaryRows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    summary: {
      total: Number(s.total ?? 0),
      thisYear: Number(s.this_year ?? 0),
      avgRating: s.avg_rating !== null && s.avg_rating !== undefined ? Number(s.avg_rating) : null,
    },
    ratingDist: fillRatingDist(toCountItems(ratingRows)),
    genreDist: toCountItems(genreRows),
    yearTimeline: toCountItems(yearRows),
    topTags: toCountItems(tagRows),
    topAuthors: toCountItems(authorRows),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/stats.ts tests/integration/stats-dashboard.test.ts
git commit -m "feat(stats): getBookDashboard — 책장 대시보드 집계"
```

---

### Task 3: getMovieDashboard (TDD)

**Files:**
- Modify: `src/lib/db/queries/stats.ts`
- Test: `tests/integration/stats-dashboard.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/integration/stats-dashboard.test.ts`에 import 수정 + describe 추가.

import 줄 수정:

```ts
import { getBookDashboard, getMovieDashboard } from '@/lib/db/queries'
import { tags, bookTags, movieTags } from '@/lib/db/schema'
import { createUser, createBook, createMovie } from '../factories'
```

tag 헬퍼 아래에 추가:

```ts
async function tagMovie(db: TestDb, movieId: number, name: string) {
  const tagId = await getOrCreateTagId(db, name)
  await db.insert(movieTags).values({ movieId, tagId })
}
```

파일 끝에 describe 추가:

```ts
describe('getMovieDashboard', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('rating/genre/year/director 집계가 정확하다', async () => {
    const u = await createUser(db, { username: 'alice' })
    const m1 = await createMovie(db, u.id, {
      rating: 9,
      genre: '드라마',
      watchedDate: '2025-02-01',
      director: '봉준호',
    })
    await createMovie(db, u.id, {
      rating: 9,
      genre: '드라마',
      watchedDate: '2026-04-01',
      director: '봉준호',
    })
    await createMovie(db, u.id, {
      rating: 4,
      genre: 'SF',
      watchedDate: '2026-05-01',
      director: '드니 빌뇌브',
    })
    await tagMovie(db, m1.id, '명작')

    const d = await getMovieDashboard(db, u.id, 2026)

    expect(d.summary.total).toBe(3)
    expect(d.summary.thisYear).toBe(2)
    expect(d.summary.avgRating).toBeCloseTo(22 / 3)
    expect(d.ratingDist).toHaveLength(10)
    expect(d.ratingDist[8]).toEqual({ label: '4.5', count: 2 }) // 저장값 9 → 표시 4.5
    expect(d.genreDist).toEqual([
      { label: '드라마', count: 2 },
      { label: 'SF', count: 1 },
    ])
    expect(d.yearTimeline).toEqual([
      { label: '2025', count: 1 },
      { label: '2026', count: 2 },
    ])
    expect(d.topTags).toEqual([{ label: '명작', count: 1 }])
    expect(d.topDirectors[0]).toEqual({ label: '봉준호', count: 2 })
  })

  it('cross-user 격리', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createMovie(db, a.id, { rating: 10 })
    await createMovie(db, b.id, { rating: 1 })

    const d = await getMovieDashboard(db, a.id, 2026)

    expect(d.summary.total).toBe(1)
    expect(d.summary.avgRating).toBe(10)
  })

  it('빈 데이터', async () => {
    const u = await createUser(db, { username: 'alice' })

    const d = await getMovieDashboard(db, u.id, 2026)

    expect(d.summary).toEqual({ total: 0, thisYear: 0, avgRating: null })
    expect(d.genreDist).toEqual([])
    expect(d.topDirectors).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: FAIL — `getMovieDashboard` export 없음.

- [ ] **Step 3: 구현**

`src/lib/db/queries/stats.ts` 끝에 추가. 구조는 `getBookDashboard`와 동형 — 테이블·컬럼만 교체 (movies / watchedDate / director / movieTags):

```ts
export interface MovieDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[]
  genreDist: CountItem[]
  yearTimeline: CountItem[]
  topTags: CountItem[]
  topDirectors: CountItem[]
}

/** 영화관 대시보드 — getBookDashboard와 동형 (watchedDate/director/movieTags) */
export async function getMovieDashboard(
  db: Db,
  userId: number,
  year: number = new Date().getFullYear(),
): Promise<MovieDashboard> {
  const yearPrefix = `${year}-%`

  const [summaryRows, ratingRows, genreRows, yearRows, tagRows, directorRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${movies} WHERE ${movies.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${movies}
           WHERE ${movies.authorUserId} = ${userId}
             AND ${movies.watchedDate} LIKE ${yearPrefix}) AS this_year,
        (SELECT AVG(${movies.rating}) FROM ${movies}
           WHERE ${movies.authorUserId} = ${userId}) AS avg_rating
    `),
    db.all(sql`
      SELECT ${movies.rating} AS label, COUNT(*) AS count FROM ${movies}
      WHERE ${movies.authorUserId} = ${userId}
      GROUP BY ${movies.rating}
    `),
    db.all(sql`
      SELECT ${movies.genre} AS label, COUNT(*) AS count FROM ${movies}
      WHERE ${movies.authorUserId} = ${userId}
      GROUP BY ${movies.genre}
      ORDER BY COUNT(*) DESC, label
    `),
    db.all(sql`
      SELECT substr(${movies.watchedDate}, 1, 4) AS label, COUNT(*) AS count FROM ${movies}
      WHERE ${movies.authorUserId} = ${userId}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${movieTags}
      JOIN ${movies} ON ${movieTags.movieId} = ${movies.id}
      JOIN ${tags} ON ${movieTags.tagId} = ${tags.id}
      WHERE ${movies.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT ${movies.director} AS label, COUNT(*) AS count FROM ${movies}
      WHERE ${movies.authorUserId} = ${userId}
      GROUP BY ${movies.director}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
  ])

  const s = (summaryRows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    summary: {
      total: Number(s.total ?? 0),
      thisYear: Number(s.this_year ?? 0),
      avgRating: s.avg_rating !== null && s.avg_rating !== undefined ? Number(s.avg_rating) : null,
    },
    ratingDist: fillRatingDist(toCountItems(ratingRows)),
    genreDist: toCountItems(genreRows),
    yearTimeline: toCountItems(yearRows),
    topTags: toCountItems(tagRows),
    topDirectors: toCountItems(directorRows),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/stats.ts tests/integration/stats-dashboard.test.ts
git commit -m "feat(stats): getMovieDashboard — 영화관 대시보드 집계"
```

---

### Task 4: getWritingDashboard (TDD)

**Files:**
- Modify: `src/lib/db/queries/stats.ts`
- Test: `tests/integration/stats-dashboard.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

import 줄 수정:

```ts
import { getBookDashboard, getMovieDashboard, getWritingDashboard } from '@/lib/db/queries'
import { tags, bookTags, movieTags, writingTags } from '@/lib/db/schema'
import { createUser, createBook, createMovie, createWriting } from '../factories'
```

tag 헬퍼 추가:

```ts
async function tagWriting(db: TestDb, writingId: number, name: string) {
  const tagId = await getOrCreateTagId(db, name)
  await db.insert(writingTags).values({ writingId, tagId })
}
```

describe 추가:

```ts
describe('getWritingDashboard', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  // now 고정 — 테스트 결정론 (2026-06-15 UTC)
  const NOW = new Date(Date.UTC(2026, 5, 15))

  it('월별 타임라인·태그·글자수 집계가 정확하다', async () => {
    const u = await createUser(db, { username: 'alice' })
    // 2026-06에 2개, 2026-01에 1개, 13개월 전(2025-05)에 1개 — 마지막 건 타임라인 밖
    const w1 = await createWriting(db, u.id, {
      body: '12345',
      createdAt: Date.UTC(2026, 5, 1),
    })
    await createWriting(db, u.id, { body: '1234567890', createdAt: Date.UTC(2026, 5, 10) })
    await createWriting(db, u.id, { body: '123', createdAt: Date.UTC(2026, 0, 5) })
    await createWriting(db, u.id, { body: '12', createdAt: Date.UTC(2025, 4, 1) })
    await tagWriting(db, w1.id, '일기')

    const d = await getWritingDashboard(db, u.id, NOW)

    expect(d.summary.total).toBe(4)
    expect(d.summary.thisYear).toBe(3) // 2026년 작성분
    // 최근 12개월: 2025-07 ~ 2026-06, 빈 달 0 채움
    expect(d.monthlyTimeline).toHaveLength(12)
    expect(d.monthlyTimeline[0]).toEqual({ label: '2025-07', count: 0 })
    expect(d.monthlyTimeline[6]).toEqual({ label: '2026-01', count: 1 })
    expect(d.monthlyTimeline[11]).toEqual({ label: '2026-06', count: 2 })
    expect(d.topTags).toEqual([{ label: '일기', count: 1 }])
    expect(d.charStats.totalChars).toBe(5 + 10 + 3 + 2)
    expect(d.charStats.avgChars).toBeCloseTo(20 / 4)
  })

  it('cross-user 격리', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createWriting(db, a.id, { body: 'aaa' })
    await createWriting(db, b.id, { body: 'bbbbbb' })

    const d = await getWritingDashboard(db, a.id, NOW)

    expect(d.summary.total).toBe(1)
    expect(d.charStats.totalChars).toBe(3)
  })

  it('빈 데이터', async () => {
    const u = await createUser(db, { username: 'alice' })

    const d = await getWritingDashboard(db, u.id, NOW)

    expect(d.summary).toEqual({ total: 0, thisYear: 0 })
    expect(d.monthlyTimeline).toHaveLength(12)
    expect(d.monthlyTimeline.every((m) => m.count === 0)).toBe(true)
    expect(d.topTags).toEqual([])
    expect(d.charStats).toEqual({ totalChars: 0, avgChars: 0 })
  })
})
```

주의: cross-user 테스트의 `createWriting`은 `createdAt` 기본값 = `Date.now()`. 테스트 실행 시점이 NOW(2026-06-15)와 다르면 monthlyTimeline 바깥일 수 있으나 이 테스트는 total/charStats만 검증 — 무관.

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: FAIL — `getWritingDashboard` export 없음.

- [ ] **Step 3: 구현**

`src/lib/db/queries/stats.ts` 끝에 추가:

```ts
export interface WritingDashboard {
  summary: { total: number; thisYear: number }
  monthlyTimeline: CountItem[] // 최근 12개월, label='YYYY-MM', 빈 달 0
  topTags: CountItem[]
  charStats: { totalChars: number; avgChars: number }
}

/**
 * 글방 대시보드. createdAt은 ms epoch — UTC 경계로 결정론적 버킷 (getUserStats와 동일 규칙).
 * 월 라벨은 strftime('%Y-%m', created_at/1000, 'unixepoch') — UTC 기준.
 * now 파라미터는 테스트 결정론용.
 */
export async function getWritingDashboard(
  db: Db,
  userId: number,
  now: Date = new Date(),
): Promise<WritingDashboard> {
  const year = now.getUTCFullYear()
  const yearStartMs = Date.UTC(year, 0, 1)
  const yearEndMs = Date.UTC(year + 1, 0, 1)
  const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)

  const [summaryRows, monthlyRows, tagRows, charRows] = await Promise.all([
    db.all(sql`
      SELECT
        (SELECT COUNT(*) FROM ${writings} WHERE ${writings.authorUserId} = ${userId}) AS total,
        (SELECT COUNT(*) FROM ${writings}
           WHERE ${writings.authorUserId} = ${userId}
             AND ${writings.createdAt} >= ${yearStartMs}
             AND ${writings.createdAt} < ${yearEndMs}) AS this_year
    `),
    db.all(sql`
      SELECT strftime('%Y-%m', ${writings.createdAt} / 1000, 'unixepoch') AS label,
             COUNT(*) AS count
      FROM ${writings}
      WHERE ${writings.authorUserId} = ${userId}
        AND ${writings.createdAt} >= ${monthStartMs}
      GROUP BY label
      ORDER BY label
    `),
    db.all(sql`
      SELECT ${tags.name} AS label, COUNT(*) AS count
      FROM ${writingTags}
      JOIN ${writings} ON ${writingTags.writingId} = ${writings.id}
      JOIN ${tags} ON ${writingTags.tagId} = ${tags.id}
      WHERE ${writings.authorUserId} = ${userId}
      GROUP BY ${tags.name}
      ORDER BY COUNT(*) DESC, label
      LIMIT 5
    `),
    db.all(sql`
      SELECT COALESCE(SUM(LENGTH(${writings.body})), 0) AS total_chars,
             COALESCE(AVG(LENGTH(${writings.body})), 0) AS avg_chars
      FROM ${writings}
      WHERE ${writings.authorUserId} = ${userId}
    `),
  ])

  // 최근 12개월 라벨 생성 + 빈 달 0 채움
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const byMonth = new Map(toCountItems(monthlyRows).map((r) => [r.label, r.count]))

  const s = (summaryRows as Array<Record<string, number | null>>)[0] ?? {}
  const c = (charRows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    summary: { total: Number(s.total ?? 0), thisYear: Number(s.this_year ?? 0) },
    monthlyTimeline: months.map((m) => ({ label: m, count: byMonth.get(m) ?? 0 })),
    topTags: toCountItems(tagRows),
    charStats: { totalChars: Number(c.total_chars ?? 0), avgChars: Number(c.avg_chars ?? 0) },
  }
}
```

주의: SQLite의 `LENGTH()`는 텍스트에 대해 **문자 수**(바이트 아님) 반환 — 한글 본문도 정확.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run tests/integration/stats-dashboard.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/stats.ts tests/integration/stats-dashboard.test.ts
git commit -m "feat(stats): getWritingDashboard — 글방 대시보드 집계"
```

---

### Task 5: API 라우트 3개 (TDD)

**Files:**
- Create: `src/app/api/books/stats/route.ts`
- Create: `src/app/api/movies/stats/route.ts`
- Create: `src/app/api/writings/stats/route.ts`
- Test: `tests/unit/stats-routes.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/stats-routes.test.ts` 생성 (기존 `tests/unit/uploads-route.test.ts`의 모킹 패턴 따름):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return { ...actual, requireUser: vi.fn() }
})
vi.mock('@/lib/db/queries', () => ({
  getBookDashboard: vi.fn(async () => ({ kind: 'book' })),
  getMovieDashboard: vi.fn(async () => ({ kind: 'movie' })),
  getWritingDashboard: vi.fn(async () => ({ kind: 'writing' })),
}))

import { GET as booksGET } from '@/app/api/books/stats/route'
import { GET as moviesGET } from '@/app/api/movies/stats/route'
import { GET as writingsGET } from '@/app/api/writings/stats/route'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { getBookDashboard, getMovieDashboard, getWritingDashboard } from '@/lib/db/queries'

const ROUTES = [
  { name: 'books', GET: booksGET, queryFn: getBookDashboard, expected: { kind: 'book' } },
  { name: 'movies', GET: moviesGET, queryFn: getMovieDashboard, expected: { kind: 'movie' } },
  {
    name: 'writings',
    GET: writingsGET,
    queryFn: getWritingDashboard,
    expected: { kind: 'writing' },
  },
] as const

describe.each(ROUTES)('GET /api/$name/stats', ({ GET, queryFn, expected }) => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(401, { error: '로그인이 필요합니다' }))
    const res = await GET()
    expect(res.status).toBe(401)
    expect(queryFn).not.toHaveBeenCalled()
  })

  it('본인 userId로 dashboard 조회 후 JSON 반환', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 7 } as Awaited<ReturnType<typeof requireUser>>)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(vi.mocked(queryFn).mock.calls[0][1]).toBe(7) // (db, userId) — 본인 스코프
    expect(await res.json()).toEqual(expected)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run tests/unit/stats-routes.test.ts
```

Expected: FAIL — route 모듈 없음 (import error).

- [ ] **Step 3: 라우트 3개 구현**

`src/app/api/books/stats/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getBookDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const dashboard = await getBookDashboard(db, user.id)
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

`src/app/api/movies/stats/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getMovieDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const dashboard = await getMovieDashboard(db, user.id)
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

`src/app/api/writings/stats/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getWritingDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const dashboard = await getWritingDashboard(db, user.id)
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
```

참고: `/api/books/[slug]` 동적 라우트가 있어도 정적 세그먼트 `stats`가 우선 매칭 — 충돌 없음.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm vitest run tests/unit/stats-routes.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/books/stats src/app/api/movies/stats src/app/api/writings/stats tests/unit/stats-routes.test.ts
git commit -m "feat(api): 도메인별 통계 대시보드 GET 라우트 3개"
```

---

### Task 6: UI 컴포넌트

**Files:**
- Create: `src/components/stats/charts.tsx`
- Create: `src/components/stats/SummaryCards.tsx`
- Create: `src/components/stats/StatsDashboard.tsx`
- Create: `src/components/stats/StatsPanel.tsx`

chart.js는 canvas 기반 — jsdom 렌더 테스트 불가. 이 Task는 테스트 없이 구현, 검증은 Task 8 e2e + Task 9 build.

- [ ] **Step 1: charts.tsx 작성**

chart.js 등록 + 제네릭 차트 2종. 별점·타임라인·TopN은 전부 `CountBarChart`, 장르는 `CountDoughnutChart` — 도메인별 차트 컴포넌트 불필요 (DRY).

```tsx
'use client'

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import type { CountItem } from '@/lib/db/queries/stats'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const PALETTE = [
  '#3182f6',
  '#f04452',
  '#ffb331',
  '#1fc7c1',
  '#9061f9',
  '#fd6f22',
  '#51cf66',
  '#f783ac',
  '#748ffc',
  '#a9e34b',
]

export function CountBarChart({
  items,
  horizontal = false,
  color = PALETTE[0],
}: {
  items: CountItem[]
  horizontal?: boolean
  color?: string
}) {
  return (
    <Bar
      data={{
        labels: items.map((i) => i.label),
        datasets: [
          { data: items.map((i) => i.count), backgroundColor: color, borderRadius: 4 },
        ],
      }}
      options={{
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: { [horizontal ? 'x' : 'y']: { beginAtZero: true, ticks: { precision: 0 } } },
        maintainAspectRatio: false,
      }}
    />
  )
}

export function CountDoughnutChart({ items }: { items: CountItem[] }) {
  return (
    <Doughnut
      data={{
        labels: items.map((i) => i.label),
        datasets: [{ data: items.map((i) => i.count), backgroundColor: PALETTE }],
      }}
      options={{
        plugins: { legend: { position: 'bottom' } },
        maintainAspectRatio: false,
      }}
    />
  )
}
```

`import type`은 컴파일 시 소거 — drizzle이 client 번들에 안 들어감.

- [ ] **Step 2: SummaryCards.tsx 작성**

```tsx
export function SummaryCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-gray-200 bg-white p-4 text-center"
        >
          <div className="text-xs text-gray-500">{it.label}</div>
          <div className="mt-1 text-xl font-bold">{it.value}</div>
        </div>
      ))}
    </div>
  )
}
```

작성 전 `src/components/BookCard.tsx`를 열어 카드 컨테이너 클래스(border·rounded·bg 계열)를 확인하고, 위 클래스가 사이트 톤과 다르면 BookCard와 같은 클래스로 교체할 것.

- [ ] **Step 3: StatsDashboard.tsx 작성**

```tsx
'use client'

import dynamic from 'next/dynamic'
import type {
  BookDashboard,
  MovieDashboard,
  WritingDashboard,
} from '@/lib/db/queries/stats'
import { SummaryCards } from './SummaryCards'

// chart.js는 펼칠 때만 로드 — 리스트 LCP 영향 0 (SSR 비호환이라 ssr: false)
const CountBarChart = dynamic(() => import('./charts').then((m) => m.CountBarChart), {
  ssr: false,
})
const CountDoughnutChart = dynamic(() => import('./charts').then((m) => m.CountDoughnutChart), {
  ssr: false,
})

export type StatsData =
  | { domain: 'books'; data: BookDashboard }
  | { domain: 'movies'; data: MovieDashboard }
  | { domain: 'writings'; data: WritingDashboard }

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-500">{title}</h3>
      <div className="h-52">{children}</div>
    </div>
  )
}

// 평균도 /2 — 히스토그램 라벨과 동일한 0.5~5 별점 스케일
const fmtAvg = (v: number | null) => (v === null ? '-' : (v / 2).toFixed(1))

export function StatsDashboard(props: StatsData) {
  if (props.domain === 'writings') {
    const d = props.data
    return (
      <div className="space-y-4">
        <SummaryCards
          items={[
            { label: '전체 글', value: String(d.summary.total) },
            { label: '올해', value: String(d.summary.thisYear) },
            { label: '총 글자수', value: d.charStats.totalChars.toLocaleString() },
            { label: '평균 길이', value: `${Math.round(d.charStats.avgChars).toLocaleString()}자` },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Widget title="월별 작성 (최근 12개월)">
            <CountBarChart items={d.monthlyTimeline} />
          </Widget>
          <Widget title="태그 Top 5">
            <CountBarChart items={d.topTags} horizontal color="#1fc7c1" />
          </Widget>
        </div>
      </div>
    )
  }

  const d = props.data
  const personTitle = props.domain === 'books' ? '저자 Top 5' : '감독 Top 5'
  const personItems = props.domain === 'books' ? d.topAuthors : d.topDirectors
  const timelineTitle = props.domain === 'books' ? '연도별 읽은 수' : '연도별 본 수'

  return (
    <div className="space-y-4">
      <SummaryCards
        items={[
          { label: '전체 기록', value: String(d.summary.total) },
          { label: '올해', value: String(d.summary.thisYear) },
          { label: '평균 별점', value: fmtAvg(d.summary.avgRating) },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Widget title="별점 분포 (0.5~5)">
          <CountBarChart items={d.ratingDist} />
        </Widget>
        <Widget title="장르 분포">
          <CountDoughnutChart items={d.genreDist} />
        </Widget>
        <Widget title={timelineTitle}>
          <CountBarChart items={d.yearTimeline} color="#9061f9" />
        </Widget>
        <Widget title="태그 Top 5">
          <CountBarChart items={d.topTags} horizontal color="#1fc7c1" />
        </Widget>
        <Widget title={personTitle}>
          <CountBarChart items={personItems} horizontal color="#ffb331" />
        </Widget>
      </div>
    </div>
  )
}
```

주의: TypeScript discriminated union — `props.domain === 'books'` 분기에서 `d.topAuthors` 접근하려면 union이 제대로 좁혀져야 함. 위처럼 `props.domain === 'books' ? d.topAuthors : d.topDirectors`에서 `d`가 `BookDashboard | MovieDashboard`로 남아 에러 나면, 분기를 `if (props.domain === 'books') { ... } if (props.domain === 'movies') { ... }` 두 블록으로 풀어서 각각 렌더할 것 (내용 동일, 타이틀만 다름).

- [ ] **Step 4: StatsPanel.tsx 작성**

```tsx
'use client'

import { useState } from 'react'
import { StatsDashboard, type StatsData } from './StatsDashboard'

const ENDPOINT: Record<StatsData['domain'], string> = {
  books: '/api/books/stats',
  movies: '/api/movies/stats',
  writings: '/api/writings/stats',
}

export function StatsPanel({ domain }: { domain: StatsData['domain'] }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<StatsData['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function fetchStats() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(ENDPOINT[domain])
      if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`)
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && data === null && !loading) void fetchStats()
  }

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span> 통계
      </button>
      {open && (
        <div className="mt-3">
          {loading && <div className="h-32 animate-pulse rounded-xl bg-gray-100" />}
          {error && (
            <div className="text-sm text-gray-500">
              통계를 불러오지 못했어요.{' '}
              <button type="button" onClick={fetchStats} className="underline">
                다시 시도
              </button>
            </div>
          )}
          {data && (
            <StatsDashboard
              {...({ domain, data } as StatsData)}
            />
          )}
        </div>
      )}
    </section>
  )
}
```

데이터는 첫 펼침에 1회만 fetch — 재접기/재펼침에 refetch 없음 (`data === null` 가드).

- [ ] **Step 5: 타입 체크 + 변경 파일 lint**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check src/components/stats/
```

Expected: 에러 0. (main의 기존 lint 에러 18건과 무관하게 stats/ 디렉토리는 clean해야 함.)

- [ ] **Step 6: Commit**

```bash
git add src/components/stats
git commit -m "feat(stats): 접이식 통계 패널 + chart.js 대시보드 컴포넌트"
```

---

### Task 7: 리스트 페이지 3곳에 패널 삽입

**Files:**
- Modify: `src/app/books/page.tsx`
- Modify: `src/app/movies/page.tsx`
- Modify: `src/app/writings/page.tsx`

- [ ] **Step 1: books/page.tsx에 삽입**

import 추가:

```tsx
import { StatsPanel } from '@/components/stats/StatsPanel'
```

`BooksPage` 컴포넌트의 return에서 `<SearchBox />` 바로 위에 삽입 (Suspense 바깥 — StatsPanel은 client component라 서버 데이터 불필요):

```tsx
  return (
    <div className="space-y-6">
      <StatsPanel domain="books" />
      <Suspense fallback={null}>
        <SearchBox />
        <Filters basePath="/books" genres={BOOK_GENRES} />
      </Suspense>
```

- [ ] **Step 2: movies/page.tsx에 동일 패턴 삽입**

import 추가 후 return 최상단에 `<StatsPanel domain="movies" />` — books와 동일 위치 (`<SearchBox />`를 감싸는 Suspense 위).

- [ ] **Step 3: writings/page.tsx에 동일 패턴 삽입**

import 추가 후 return 최상단에 `<StatsPanel domain="writings" />`. writings/page.tsx의 JSX 구조가 books와 다를 수 있음 — 파일을 열어 최상위 컨테이너 div 직후, 검색/리스트 요소 앞에 넣을 것.

- [ ] **Step 4: dev 서버로 수동 확인**

```bash
pnpm dev
```

브라우저(또는 curl)로:
- `/books` 접속 → `▸ 통계` 버튼 보임, 클릭 → 위젯 렌더
- `/movies`, `/writings` 동일
- 접힌 상태에서 Network 탭에 `/api/*/stats` 요청 **없음** (lazy 확인)

WSL2에서 dev 서버가 60초 내 안 뜨면 README 트러블슈팅 참고 (destructive 명령은 사용자 승인 필요).

- [ ] **Step 5: Commit**

```bash
git add src/app/books/page.tsx src/app/movies/page.tsx src/app/writings/page.tsx
git commit -m "feat(stats): 책장/영화관/글방 리스트에 통계 패널 삽입"
```

---

### Task 8: e2e 테스트

**Files:**
- Test: `tests/e2e/stats-panel.spec.ts` (신규)

- [ ] **Step 1: e2e 작성**

기존 `tests/e2e/golden-path.spec.ts`의 로그인 패턴 그대로:

```ts
import { test, expect } from '@playwright/test'

test('책장 통계 패널 펼침 → 요약 카드 표시', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[autocomplete="username"]', process.env.E2E_USERNAME ?? 'sayhee')
  await page.fill('input[type="password"]', 'changeme')
  await Promise.all([page.waitForURL('**/books/**'), page.click('button[type="submit"]')])

  await page.goto('/books')
  // 접힌 상태 — 대시보드 없음
  await expect(page.getByText('전체 기록')).not.toBeVisible()

  await page.click('button:has-text("통계")')
  await expect(page.getByText('전체 기록')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('평균 별점')).toBeVisible()
})
```

- [ ] **Step 2: 실행**

```bash
pnpm e2e tests/e2e/stats-panel.spec.ts
```

Expected: PASS. (dev 서버 기동은 playwright config의 webServer 설정 따름 — 별도 기동 불필요하면 그대로, 필요하면 `pnpm dev` 백그라운드 후 실행.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/stats-panel.spec.ts
git commit -m "test(e2e): 통계 패널 펼침 시나리오"
```

---

### Task 9: 최종 검증

- [ ] **Step 1: 전체 unit + integration**

```bash
pnpm test
```

Expected: 전부 PASS, 기존 테스트 회귀 없음.

- [ ] **Step 2: 변경 파일 lint**

```bash
git diff main --name-only -- 'src/**' 'tests/**' | xargs pnpm exec biome check
```

Expected: 에러 0. (main 기존 18건은 범위 밖 — 이 명령엔 안 걸림.)

- [ ] **Step 3: 프로덕션 빌드**

```bash
pnpm build
```

Expected: 빌드 성공. `/api/*/stats` 라우트 3개가 출력 라우트 목록에 보임.

- [ ] **Step 4: 잔여 작업 확인 후 마무리**

`git status`로 미커밋 파일 없는지 확인. 있으면 해당 Task 커밋에 누락된 것 — 적절한 커밋으로 추가.
