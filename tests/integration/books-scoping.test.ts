import { describe, it, expect, beforeEach } from 'vitest'
import {
  listBooks,
  getBookBySlug,
  createBook as queryCreateBook,
  updateBook,
  deleteBook,
  searchBooks,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook } from '../factories'

describe('book queries — user scoping (data isolation)', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('listBooks returns only own user books', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { title: 'A1' })
    await createBook(db, a.id, { title: 'A2' })
    await createBook(db, b.id, { title: 'B1' })

    const aList = await listBooks(db, a.id, {})
    const bList = await listBooks(db, b.id, {})
    expect(aList.map((x) => x.title).sort()).toEqual(['A1', 'A2'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('getBookBySlug returns null for other user book', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { slug: 'shared-slug' })

    expect(await getBookBySlug(db, a.id, 'shared-slug')).not.toBeNull()
    expect(await getBookBySlug(db, b.id, 'shared-slug')).toBeNull()
  })

  it('two users can have same slug (composite UNIQUE)', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aBook = await queryCreateBook(db, a.id, {
      title: '데미안',
      author: '헤세',
      genre: '소설',
      readDate: '2025-01-01',
      rating: 5,
      content: '',
      tags: [],
    })
    const bBook = await queryCreateBook(db, b.id, {
      title: '데미안',
      author: '헤세',
      genre: '소설',
      readDate: '2025-01-01',
      rating: 5,
      content: '',
      tags: [],
    })
    expect(aBook.slug).toBe(bBook.slug)
    expect(aBook.authorUserId).not.toBe(bBook.authorUserId)
  })

  it('updateBook scoped to owner — returns null for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aBook = await createBook(db, a.id, { title: 'orig' })

    // bob attempts to update alice's book → null
    const result = await updateBook(db, b.id, aBook.id, { title: 'hijacked' })
    expect(result).toBeNull()

    // alice's book unchanged
    const after = await getBookBySlug(db, a.id, aBook.slug)
    expect(after?.title).toBe('orig')
  })

  it('deleteBook scoped to owner — returns false for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aBook = await createBook(db, a.id)

    expect(await deleteBook(db, b.id, aBook.id)).toBe(false)
    expect(await deleteBook(db, a.id, aBook.id)).toBe(true)
  })

  it('searchBooks scoped to owner', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createBook(db, a.id, { title: 'unique-keyword-A' })
    await createBook(db, b.id, { title: 'unique-keyword-B' })

    const aResults = await searchBooks(db, a.id, 'unique-keyword')
    expect(aResults.map((x) => x.title)).toEqual(['unique-keyword-A'])
  })
})
