import { describe, it, expect, beforeEach } from 'vitest'
import { listRecentPublicBooks, countPublicBooks } from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

describe('public feed queries', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('returns only books with is_public=1 AND published_at IS NOT NULL', async () => {
    const a = await createUser(db, { username: 'alice', displayName: 'Alice' })
    const b = await createUser(db, { username: 'bob', displayName: 'Bob' })

    const t = Date.now()
    await createBook(db, a.id, { title: '공개 + publishedAt', isPublic: 1, publishedAt: t })
    await createBook(db, a.id, { title: '비공개', isPublic: 0, publishedAt: null })
    await createBook(db, b.id, {
      title: '공개지만 publishedAt NULL',
      isPublic: 1,
      publishedAt: null,
    })
    await createBook(db, b.id, { title: 'B의 공개', isPublic: 1, publishedAt: t - 1000 })

    const list = await listRecentPublicBooks(db, { limit: 10 })
    const titles = list.map((x) => x.title)
    expect(titles).toContain('공개 + publishedAt')
    expect(titles).toContain('B의 공개')
    expect(titles).not.toContain('비공개')
    expect(titles).not.toContain('공개지만 publishedAt NULL')
  })

  it('orders by published_at DESC', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    await createBook(db, a.id, { title: 'older', isPublic: 1, publishedAt: t - 10000 })
    await createBook(db, a.id, { title: 'middle', isPublic: 1, publishedAt: t - 5000 })
    await createBook(db, a.id, { title: 'newest', isPublic: 1, publishedAt: t })

    const list = await listRecentPublicBooks(db, { limit: 10 })
    expect(list.map((x) => x.title)).toEqual(['newest', 'middle', 'older'])
  })

  it('joins users and returns authorDisplayName', async () => {
    const a = await createUser(db, { username: 'alice', displayName: '앨리스' })
    await createBook(db, a.id, { title: 'B', isPublic: 1, publishedAt: Date.now() })

    const [item] = await listRecentPublicBooks(db, { limit: 1 })
    expect(item.authorDisplayName).toBe('앨리스')
  })

  it('does NOT include content, tags, or authorUserId in response', async () => {
    const a = await createUser(db, { username: 'alice' })
    await createBook(db, a.id, {
      title: 'B',
      content: '아주 긴 비밀 독후감',
      isPublic: 1,
      publishedAt: Date.now(),
    })

    const [item] = await listRecentPublicBooks(db, { limit: 1 })
    expect(Object.keys(item)).not.toContain('content')
    expect(Object.keys(item)).not.toContain('tags')
    expect(Object.keys(item)).not.toContain('authorUserId')
    expect(Object.keys(item)).not.toContain('passwordHash')
  })

  it('respects limit and offset', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    for (let i = 0; i < 5; i++) {
      await createBook(db, a.id, { title: `B${i}`, isPublic: 1, publishedAt: t - i * 1000 })
    }

    const page1 = await listRecentPublicBooks(db, { limit: 2 })
    const page2 = await listRecentPublicBooks(db, { limit: 2, offset: 2 })
    expect(page1.map((x) => x.title)).toEqual(['B0', 'B1'])
    expect(page2.map((x) => x.title)).toEqual(['B2', 'B3'])
  })

  it('countPublicBooks matches the same filter', async () => {
    const a = await createUser(db, { username: 'alice' })
    const t = Date.now()
    await createBook(db, a.id, { isPublic: 1, publishedAt: t })
    await createBook(db, a.id, { isPublic: 1, publishedAt: t - 1000 })
    await createBook(db, a.id, { isPublic: 0, publishedAt: null })
    await createBook(db, a.id, { isPublic: 1, publishedAt: null })

    expect(await countPublicBooks(db)).toBe(2)
  })
})

describe('createBook publishedAt logic', () => {
  let db2: TestDb
  beforeEach(async () => {
    ;({ db: db2 } = await makeTestDb())
  })

  it('sets publishedAt on insert when isPublic=true (default)', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })

    const before = Date.now()
    const book = await queryCreateBook(db2, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const after = Date.now()

    expect(book.isPublic).toBe(1)
    expect(book.publishedAt).not.toBeNull()
    expect(book.publishedAt).toBeGreaterThanOrEqual(before)
    expect(book.publishedAt).toBeLessThanOrEqual(after)
  })

  it('leaves publishedAt NULL when isPublic=false', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })

    const book = await queryCreateBook(db2, a.id, {
      title: 'T2',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: false,
    })
    expect(book.isPublic).toBe(0)
    expect(book.publishedAt).toBeNull()
  })

  it('stores oneLineReview', async () => {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db2, { username: 'alice' })
    const book = await queryCreateBook(db2, a.id, {
      title: 'T3',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: '좋은 책',
      isPublic: true,
    })
    expect(book.oneLineReview).toBe('좋은 책')
  })
})

describe('updateBook publishedAt transitions', () => {
  let db3: TestDb
  beforeEach(async () => {
    ;({ db: db3 } = await makeTestDb())
  })

  async function setup() {
    const { createBook: queryCreateBook } = await import('@/lib/db/queries')
    const a = await createUser(db3, { username: 'alice' })
    return { a, queryCreateBook }
  }

  it('transitions 0→1: sets publishedAt to now()', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: false,
    })
    expect(book.publishedAt).toBeNull()

    const before = Date.now()
    const updated = await updateBook(db3, a.id, book.id, { isPublic: true })
    const after = Date.now()
    expect(updated?.isPublic).toBe(1)
    expect(updated?.publishedAt).not.toBeNull()
    expect(updated?.publishedAt).toBeGreaterThanOrEqual(before)
    expect(updated?.publishedAt).toBeLessThanOrEqual(after)
  })

  it('transitions 1→0: preserves publishedAt', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const originalPublishedAt = book.publishedAt!
    expect(originalPublishedAt).not.toBeNull()

    const updated = await updateBook(db3, a.id, book.id, { isPublic: false })
    expect(updated?.isPublic).toBe(0)
    expect(updated?.publishedAt).toBe(originalPublishedAt)
  })

  it('non-transition 1→1: publishedAt unchanged', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const originalPublishedAt = book.publishedAt!

    await new Promise((r) => setTimeout(r, 5)) // ensure clock advances
    const updated = await updateBook(db3, a.id, book.id, { title: 'New Title' })
    expect(updated?.title).toBe('New Title')
    expect(updated?.publishedAt).toBe(originalPublishedAt)
  })

  it('0→1→0→1 sequence: publishedAt updates on each 0→1', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: false,
    })

    await new Promise((r) => setTimeout(r, 5))
    const r1 = await updateBook(db3, a.id, book.id, { isPublic: true })
    const t1 = r1!.publishedAt!

    await new Promise((r) => setTimeout(r, 5))
    await updateBook(db3, a.id, book.id, { isPublic: false })

    await new Promise((r) => setTimeout(r, 5))
    const r3 = await updateBook(db3, a.id, book.id, { isPublic: true })
    const t3 = r3!.publishedAt!

    expect(t3).toBeGreaterThan(t1)
  })

  it('updates oneLineReview without changing isPublic/publishedAt', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: '처음',
      isPublic: true,
    })
    const t0 = book.publishedAt!

    const updated = await updateBook(db3, a.id, book.id, { oneLineReview: '바뀐 한줄평' })
    expect(updated?.oneLineReview).toBe('바뀐 한줄평')
    expect(updated?.publishedAt).toBe(t0)
  })

  it('cross-user: B cannot update isPublic on A book', async () => {
    const { updateBook, createBook: queryCreateBook } = await import('@/lib/db/queries')
    const { a } = await setup()
    const b = await createUser(db3, { username: 'bob' })
    const book = await queryCreateBook(db3, a.id, {
      title: 'T',
      author: 'A',
      genre: '소설',
      readDate: '2026-01-01',
      rating: 4,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: false,
    })

    const attempt = await updateBook(db3, b.id, book.id, { isPublic: true })
    expect(attempt).toBeNull()

    // A의 책은 그대로 비공개
    const { getBookById } = await import('@/lib/db/queries')
    const after = await getBookById(db3, a.id, book.id)
    expect(after?.isPublic).toBe(0)
    expect(after?.publishedAt).toBeNull()
  })
})
