import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '@/lib/db/schema'
import { createBook, listBooks, getBookBySlug, searchBooks, suggestTags, listTagsForBook } from '@/lib/db/queries'
import migration from '../../drizzle/0000_yummy_goliath.sql?raw'

function makeDb() {
  const client = createClient({ url: ':memory:' })
  return { client, db: drizzle(client, { schema }) }
}

async function setup() {
  const { client, db } = makeDb()
  // Strip Drizzle's statement-breakpoint markers and split on semicolons
  const cleaned = migration.replace(/-->\s*statement-breakpoint/g, '')
  for (const stmt of cleaned.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    await client.execute(stmt)
  }
  return db
}

describe('queries', () => {
  let db: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => { db = await setup() })

  it('createBook + getBookBySlug', async () => {
    const created = await createBook(db, {
      title: '이방인', author: '카뮈', genre: '소설',
      readDate: '2026-05-01', rating: 5, content: '...', tags: ['t1', 't2'],
    })
    expect(created.slug).toBe('이방인')
    const fetched = await getBookBySlug(db, '이방인')
    expect(fetched?.title).toBe('이방인')
    expect(fetched?.tags.sort()).toEqual(['t1', 't2'])
  })

  it('동일 제목 두 번 → slug 충돌 해소', async () => {
    await createBook(db, { title: '같은책', author: 'a', genre: '소설', readDate: '2026-05-01', rating: 3, tags: [] })
    const b = await createBook(db, { title: '같은책', author: 'b', genre: '소설', readDate: '2026-05-02', rating: 4, tags: [] })
    expect(b.slug).toBe('같은책-2')
  })

  it('listBooks 정렬 (최근 읽은 순)', async () => {
    await createBook(db, { title: 'A', author: 'a', genre: '소설', readDate: '2026-01-01', rating: 3, tags: [] })
    await createBook(db, { title: 'B', author: 'a', genre: '소설', readDate: '2026-03-01', rating: 3, tags: [] })
    const list = await listBooks(db, {})
    expect(list.map((b) => b.title)).toEqual(['B', 'A'])
  })

  it('searchBooks 제목·작가 매치', async () => {
    await createBook(db, { title: '이방인', author: '카뮈', genre: '소설', readDate: '2026-05-01', rating: 5, tags: [] })
    await createBook(db, { title: '페스트', author: '카뮈', genre: '소설', readDate: '2026-04-01', rating: 5, tags: [] })
    const r = await searchBooks(db, '카뮈')
    expect(r.length).toBe(2)
    const r2 = await searchBooks(db, '이방')
    expect(r2.length).toBe(1)
  })

  it('suggestTags 자동완성', async () => {
    await createBook(db, { title: 'a', author: 'a', genre: '소설', readDate: '2026-05-01', rating: 3, tags: ['여름', '여행지에서', '재독'] })
    const r = await suggestTags(db, '여')
    expect(r.sort()).toEqual(['여름', '여행지에서'])
  })
})
