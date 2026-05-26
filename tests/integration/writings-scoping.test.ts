import { describe, it, expect, beforeEach } from 'vitest'
import {
  listWritings,
  getWritingBySlug,
  createWriting as queryCreateWriting,
  updateWriting,
  deleteWriting,
  suggestTags,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createBook, createWriting } from '../factories'

describe('writing queries — user scoping', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('listWritings returns only own user writings', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createWriting(db, a.id, { title: 'A1' })
    await createWriting(db, b.id, { title: 'B1' })
    const aList = await listWritings(db, a.id)
    const bList = await listWritings(db, b.id)
    expect(aList.map((x) => x.title)).toEqual(['A1'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('getWritingBySlug returns null for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createWriting(db, a.id, { slug: 'shared' })
    expect(await getWritingBySlug(db, a.id, 'shared')).not.toBeNull()
    expect(await getWritingBySlug(db, b.id, 'shared')).toBeNull()
  })

  it('two users can have the same writing slug', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aw = await queryCreateWriting(db, a.id, { title: '봄밤', body: '', tags: [] })
    const bw = await queryCreateWriting(db, b.id, { title: '봄밤', body: '', tags: [] })
    expect(aw.slug).toBe(bw.slug)
    expect(aw.authorUserId).not.toBe(bw.authorUserId)
  })

  it('updateWriting and deleteWriting are scoped to owner', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aw = await createWriting(db, a.id, { title: 'orig' })
    expect(await updateWriting(db, b.id, aw.id, { title: 'hijacked' })).toBeNull()
    expect(await deleteWriting(db, b.id, aw.id)).toBe(false)
    expect(await deleteWriting(db, a.id, aw.id)).toBe(true)
  })

  it('suggestTags merges book + writing tags within owner pool only', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })

    // alice가 글에 #시 태그 — createWriting 쿼리를 통해 태그까지 attach
    await queryCreateWriting(db, a.id, { title: 'w', body: '', tags: ['시'] })
    // bob도 다른 자기 콘텐츠에 다른 태그를 두지만, '시' 태그는 없음 (alice 풀에만 존재)
    await createBook(db, b.id, {})

    const aSuggest = await suggestTags(db, a.id, '시')
    expect(aSuggest).toContain('시')

    const bSuggest = await suggestTags(db, b.id, '시')
    expect(bSuggest).not.toContain('시')
  })
})
