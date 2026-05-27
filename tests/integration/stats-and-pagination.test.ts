import { describe, it, test, expect, beforeEach } from 'vitest'
import {
  listBooks,
  listWritings,
  countBooks,
  countWritings,
  getUserStats,
  getUserMovieStats,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook, createWriting, createMovie } from '../factories'

describe('pagination and stats', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('listBooks respects limit and offset', async () => {
    const u = await createUser(db, { username: 'alice' })
    // 5 books, 모두 다른 readDate (DESC 정렬 → 최신순)
    for (let i = 1; i <= 5; i++) {
      await createBook(db, u.id, {
        title: `B${i}`,
        readDate: `2025-01-0${i}`,
      })
    }
    const page1 = await listBooks(db, u.id, { sort: 'date', limit: 2, offset: 0 })
    const page2 = await listBooks(db, u.id, { sort: 'date', limit: 2, offset: 2 })
    const page3 = await listBooks(db, u.id, { sort: 'date', limit: 2, offset: 4 })

    expect(page1.map((b) => b.title)).toEqual(['B5', 'B4'])
    expect(page2.map((b) => b.title)).toEqual(['B3', 'B2'])
    expect(page3.map((b) => b.title)).toEqual(['B1'])
  })

  it('listWritings respects limit and offset', async () => {
    const u = await createUser(db, { username: 'alice' })
    for (let i = 1; i <= 5; i++) {
      await createWriting(db, u.id, { title: `W${i}`, createdAt: Date.now() + i * 1000 })
    }
    const page1 = await listWritings(db, u.id, { limit: 2, offset: 0 })
    const page2 = await listWritings(db, u.id, { limit: 2, offset: 2 })

    expect(page1.map((w) => w.title)).toEqual(['W5', 'W4'])
    expect(page2.map((w) => w.title)).toEqual(['W3', 'W2'])
  })

  it('countBooks and countWritings return totals scoped to user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, {})
    await createBook(db, a.id, {})
    await createBook(db, b.id, {})
    await createWriting(db, a.id, {})

    expect(await countBooks(db, a.id)).toBe(2)
    expect(await countBooks(db, b.id)).toBe(1)
    expect(await countWritings(db, a.id)).toBe(1)
    expect(await countWritings(db, b.id)).toBe(0)
  })

  it('getUserStats aggregates books and writings without fetching rows', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const year = 2026

    // alice: 3 books (2 in target year, ratings 5/4/3), 2 writings (1 in target year)
    await createBook(db, a.id, { readDate: '2026-03-01', rating: 5 })
    await createBook(db, a.id, { readDate: '2026-06-01', rating: 4 })
    await createBook(db, a.id, { readDate: '2024-01-01', rating: 3 })
    await createWriting(db, a.id, { createdAt: Date.UTC(2026, 1, 1) })
    await createWriting(db, a.id, { createdAt: Date.UTC(2025, 0, 1) })

    // bob: 1 book in target year, 0 writings — must be excluded from alice's stats
    await createBook(db, b.id, { readDate: '2026-01-01', rating: 1 })

    const s = await getUserStats(db, a.id, year)
    expect(s.booksTotal).toBe(3)
    expect(s.booksThisYear).toBe(2)
    expect(s.avgRating).toBeCloseTo(4) // (5+4+3)/3
    expect(s.writingsTotal).toBe(2)
    expect(s.writingsThisYear).toBe(1)
  })

  it('getUserStats handles zero books gracefully (avgRating=0)', async () => {
    const u = await createUser(db, { username: 'alice' })
    const s = await getUserStats(db, u.id, 2026)
    expect(s.booksTotal).toBe(0)
    expect(s.booksThisYear).toBe(0)
    expect(s.avgRating).toBe(0)
    expect(s.writingsTotal).toBe(0)
    expect(s.writingsThisYear).toBe(0)
  })
})

describe('getUserMovieStats', () => {
  test('counts movies in given year only (createdAt-based)', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      // 2025
      await createMovie(db, alice.id, { createdAt: new Date('2025-06-01').getTime() })
      // 2026
      await createMovie(db, alice.id, { createdAt: new Date('2026-03-01').getTime() })
      await createMovie(db, alice.id, { createdAt: new Date('2026-04-01').getTime() })

      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.moviesTotal).toBe(3)
      expect(stats.moviesThisYear).toBe(2)
    } finally {
      client.close()
    }
  })

  test('avgMovieRating computed across all user movies', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      await createMovie(db, alice.id, { rating: 6 })
      await createMovie(db, alice.id, { rating: 10 })
      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.avgMovieRating).toBe(8)
    } finally {
      client.close()
    }
  })

  test('returns 0/null when user has no movies', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      const stats = await getUserMovieStats(db, alice.id, 2026)
      expect(stats.moviesTotal).toBe(0)
      expect(stats.moviesThisYear).toBe(0)
      expect(stats.avgMovieRating).toBeNull()
    } finally {
      client.close()
    }
  })

  test('scoped to user (does not count other user movies)', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      const bob = await createUser(db, { username: 'bob' })
      await createMovie(db, alice.id, { rating: 5 })
      await createMovie(db, bob.id, { rating: 10 })
      await createMovie(db, bob.id, { rating: 10 })

      const aStats = await getUserMovieStats(db, alice.id, 2026)
      expect(aStats.moviesTotal).toBe(1)
      expect(aStats.avgMovieRating).toBe(5)

      const bStats = await getUserMovieStats(db, bob.id, 2026)
      expect(bStats.moviesTotal).toBe(2)
      expect(bStats.avgMovieRating).toBe(10)
    } finally {
      client.close()
    }
  })
})
