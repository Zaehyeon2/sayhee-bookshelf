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
