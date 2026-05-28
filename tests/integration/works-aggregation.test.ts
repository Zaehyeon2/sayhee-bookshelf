import { describe, it, expect, beforeEach } from 'vitest'
import {
  getBookAggregatesByIsbns,
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

describe('books works aggregation', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('aggregates published items by isbn — counts + average rating', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const c = await createUser(db, { username: 'carol' })
    const t = Date.now()
    await createBook(db, a.id, { title: 'X', isbn: '9788937462788', rating: 10, isPublic: 1, publishedAt: t })
    await createBook(db, b.id, { title: 'X', isbn: '9788937462788', rating: 8, isPublic: 1, publishedAt: t - 1000 })
    await createBook(db, c.id, { title: 'X', isbn: '9788937462788', rating: 6, isPublic: 1, publishedAt: t - 2000 })

    const map = await getBookAggregatesByIsbns(db, ['9788937462788'])
    const agg = map.get('9788937462788')
    expect(agg?.cnt).toBe(3)
    expect(agg?.avg).toBe(8)
  })

  it('excludes non-public and unpublished', async () => {
    const a = await createUser(db, { username: 'alice' })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 9, isPublic: 1, publishedAt: Date.now() })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 5, isPublic: 0, publishedAt: null })
    await createBook(db, a.id, { isbn: '9780000000001', rating: 7, isPublic: 1, publishedAt: null })

    const map = await getBookAggregatesByIsbns(db, ['9780000000001'])
    expect(map.get('9780000000001')?.cnt).toBe(1)
    expect(map.get('9780000000001')?.avg).toBe(9)
  })

  it('INCLUDES published items even when oneLineReview is null/empty', async () => {
    // 회귀 가드: 메모리 invariant works-review-aggregation-includes-no-text
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { isbn: '9780000000002', rating: 8, oneLineReview: null, isPublic: 1, publishedAt: Date.now() })
    await createBook(db, b.id, { isbn: '9780000000002', rating: 10, oneLineReview: '좋아요', isPublic: 1, publishedAt: Date.now() })

    const map = await getBookAggregatesByIsbns(db, ['9780000000002'])
    expect(map.get('9780000000002')?.cnt).toBe(2)
    expect(map.get('9780000000002')?.avg).toBe(9)
  })

  it('returns empty Map when isbn list is empty', async () => {
    const map = await getBookAggregatesByIsbns(db, [])
    expect(map.size).toBe(0)
  })

  it('listBookReviewsByIsbn returns rows ordered publishedAt DESC with displayName', async () => {
    const a = await createUser(db, { username: 'alice', displayName: '앨리스' })
    const b = await createUser(db, { username: 'bob', displayName: '밥' })
    const t = Date.now()
    await createBook(db, a.id, { isbn: '9780000000003', rating: 9, oneLineReview: '좋음', isPublic: 1, publishedAt: t })
    await createBook(db, b.id, { isbn: '9780000000003', rating: 7, oneLineReview: null, isPublic: 1, publishedAt: t - 1000 })

    const rows = await listBookReviewsByIsbn(db, '9780000000003', { limit: 10 })
    expect(rows.length).toBe(2)
    expect(rows[0].authorDisplayName).toBe('앨리스')
    expect(rows[0].oneLineReview).toBe('좋음')
    expect(rows[1].authorDisplayName).toBe('밥')
    expect(rows[1].oneLineReview).toBeNull()
  })

  it('countBookReviewsByIsbn matches list size', async () => {
    const a = await createUser(db, { username: 'alice' })
    for (let i = 0; i < 5; i++) {
      await createBook(db, a.id, { isbn: '9780000000004', rating: 8, isPublic: 1, publishedAt: Date.now() - i * 1000 })
    }
    expect(await countBookReviewsByIsbn(db, '9780000000004')).toBe(5)
  })

  it('getBookRatingDistributionByIsbn builds 1..10 buckets', async () => {
    const a = await createUser(db, { username: 'alice' })
    for (const r of [10, 10, 8, 8, 8, 5, 1]) {
      await createBook(db, a.id, { isbn: '9780000000005', rating: r, isPublic: 1, publishedAt: Date.now() })
    }
    const d = await getBookRatingDistributionByIsbn(db, '9780000000005')
    expect(d.cnt).toBe(7)
    expect(d.buckets[10]).toBe(2)
    expect(d.buckets[8]).toBe(3)
    expect(d.buckets[5]).toBe(1)
    expect(d.buckets[1]).toBe(1)
    expect(d.buckets[2]).toBe(0)
    expect(d.avg).toBeCloseTo(7.14, 1)
  })
})
