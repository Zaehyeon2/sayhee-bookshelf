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
