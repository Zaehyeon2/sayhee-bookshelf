import { describe, it, expect, beforeEach } from 'vitest'
import {
  listWritings,
  getWritingBySlug,
  createWriting as queryCreateWriting,
  updateWriting,
  deleteWriting,
  suggestTags,
  searchWritings,
  countSearchWritings,
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

  it('searchWritings matches title and body, scoped to owner', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await queryCreateWriting(db, a.id, { title: '봄의 기록', body: '벚꽃이 피던 날에', tags: [] })
    await queryCreateWriting(db, a.id, { title: '겨울 단상', body: '봄을 기다리며', tags: [] })
    await queryCreateWriting(db, a.id, { title: '여름밤', body: '매미 소리만 가득', tags: [] })
    await queryCreateWriting(db, b.id, { title: '봄날', body: '', tags: [] })

    const aResults = await searchWritings(db, a.id, '봄')
    // title-매칭이 body-매칭보다 우선
    expect(aResults.map((w) => w.title)).toEqual(['봄의 기록', '겨울 단상'])
    // 다른 사용자의 글은 절대 노출되지 않음
    expect(aResults.every((w) => w.authorUserId === a.id)).toBe(true)

    const bResults = await searchWritings(db, b.id, '봄')
    expect(bResults.map((w) => w.title)).toEqual(['봄날'])
  })

  it('searchWritings respects limit/offset', async () => {
    const u = await createUser(db, { username: 'alice' })
    for (let i = 1; i <= 5; i++) {
      await queryCreateWriting(db, u.id, { title: `봄 ${i}`, body: '', tags: [] })
    }
    const page1 = await searchWritings(db, u.id, '봄', { limit: 2, offset: 0 })
    const page2 = await searchWritings(db, u.id, '봄', { limit: 2, offset: 2 })

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)
    expect(page1[0].id).not.toBe(page2[0].id)
  })

  it('countSearchWritings returns total scoped to owner', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await queryCreateWriting(db, a.id, { title: '봄1', body: '', tags: [] })
    await queryCreateWriting(db, a.id, { title: '겨울', body: '봄날에', tags: [] })
    await queryCreateWriting(db, b.id, { title: '봄2', body: '', tags: [] })

    expect(await countSearchWritings(db, a.id, '봄')).toBe(2)
    expect(await countSearchWritings(db, b.id, '봄')).toBe(1)
    expect(await countSearchWritings(db, a.id, '없는키워드')).toBe(0)
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
