import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getBookDashboard, getMovieDashboard } from '@/lib/db/queries'
import { tags, bookTags, movieTags } from '@/lib/db/schema'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook, createMovie } from '../factories'

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

async function tagMovie(db: TestDb, movieId: number, name: string) {
  const tagId = await getOrCreateTagId(db, name)
  await db.insert(movieTags).values({ movieId, tagId })
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

  it('동률 count는 label 사전순 tie-break (회귀 가드)', async () => {
    const u = await createUser(db, { username: 'alice' })
    // 감독 2명 각 1편 — count 동률 → ORDER BY COUNT(*) DESC, label 의 2차 정렬 검증.
    // 사전순 역순으로 insert해 rowid 순서가 우연히 통과시키는 false-pass 차단.
    await createMovie(db, u.id, { director: '라마바', rating: 5 })
    await createMovie(db, u.id, { director: '가나다', rating: 5 })

    const d = await getMovieDashboard(db, u.id, 2026)

    expect(d.topDirectors).toEqual([
      { label: '가나다', count: 1 },
      { label: '라마바', count: 1 },
    ])
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
