import { describe, it, expect, beforeEach } from 'vitest'
import {
  createGame as queryCreateGame,
  updateGame,
  deleteGame,
  getGameById,
  getGameBySlug,
  listGames,
  countGames,
  countGamesByExternalIds,
  suggestTags,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createGame } from '../factories'

describe('game queries — user scoping (data isolation)', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('listGames returns only own user games', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createGame(db, a.id, { title: 'A1' })
    await createGame(db, a.id, { title: 'A2' })
    await createGame(db, b.id, { title: 'B1' })

    const aList = await listGames(db, a.id, {})
    const bList = await listGames(db, b.id, {})
    expect(aList.map((x) => x.title).sort()).toEqual(['A1', 'A2'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('countGames scoped to user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createGame(db, a.id, { title: 'A1' })
    await createGame(db, a.id, { title: 'A2' })
    await createGame(db, b.id, { title: 'B1' })

    expect(await countGames(db, a.id, {})).toBe(2)
    expect(await countGames(db, b.id, {})).toBe(1)
  })

  it('getGameById returns null for other user game', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aGame = await createGame(db, a.id, { title: 'Alice Game' })

    expect(await getGameById(db, a.id, aGame.id)).not.toBeNull()
    expect(await getGameById(db, b.id, aGame.id)).toBeNull()
  })

  it('getGameBySlug returns null for other user game', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createGame(db, a.id, { slug: 'shared-slug' })

    expect(await getGameBySlug(db, a.id, 'shared-slug')).not.toBeNull()
    expect(await getGameBySlug(db, b.id, 'shared-slug')).toBeNull()
  })

  it('updateGame scoped to owner — returns null for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aGame = await createGame(db, a.id, { title: 'orig' })

    // bob attempts to update alice's game → null
    const result = await updateGame(db, b.id, aGame.id, {
      title: 'hijacked',
      oneLineReview: null,
    })
    expect(result).toBeNull()

    // alice's game unchanged
    const after = await getGameBySlug(db, a.id, aGame.slug)
    expect(after?.title).toBe('orig')
  })

  it('deleteGame scoped to owner — returns false for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aGame = await createGame(db, a.id)

    expect(await deleteGame(db, b.id, aGame.id)).toBe(false)
    expect(await deleteGame(db, a.id, aGame.id)).toBe(true)
  })

  it('createGame slug collision retries with -2 suffix', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })

    // Both users create game with same title → same base slug, but per-user uniqueness means no collision
    const aGame = await queryCreateGame(db, a.id, {
      title: '엘든링',
      developer: '프롬소프트웨어',
      genre: 'RPG',
      playedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const bGame = await queryCreateGame(db, b.id, {
      title: '엘든링',
      developer: '프롬소프트웨어',
      genre: 'RPG',
      playedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    // Same slug is allowed for different users (composite unique)
    expect(aGame.slug).toBe(bGame.slug)
    expect(aGame.authorUserId).not.toBe(bGame.authorUserId)

    // Same user, same title → slug retry produces -2
    const aGame2 = await queryCreateGame(db, a.id, {
      title: '엘든링',
      developer: '프롬소프트웨어',
      genre: 'RPG',
      playedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    expect(aGame2.slug).toBe(`${aGame.slug}-2`)
  })

  it('createGame tag sync inserts and re-uses existing tags', async () => {
    const a = await createUser(db, { username: 'alice' })

    const g1 = await queryCreateGame(db, a.id, {
      title: '호라이즌',
      developer: '게릴라게임즈',
      genre: 'RPG',
      playedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: ['sci-fi', 'action'],
      oneLineReview: null,
      isPublic: true,
    })
    expect(g1.tags.sort()).toEqual(['action', 'sci-fi'])

    // Second game reuses same tags (no duplicate tag rows in tags table)
    const g2 = await queryCreateGame(db, a.id, {
      title: '호라이즌 포비든 웨스트',
      developer: '게릴라게임즈',
      genre: 'RPG',
      playedDate: '2026-01-02',
      rating: 8,
      content: '',
      tags: ['sci-fi'],
      oneLineReview: null,
      isPublic: true,
    })
    expect(g2.tags).toEqual(['sci-fi'])
  })

  it('getGameBySlug returns game WITH tags attached', async () => {
    const a = await createUser(db, { username: 'alice' })

    const created = await queryCreateGame(db, a.id, {
      title: '젤다의 전설',
      developer: '닌텐도',
      genre: '어드벤처',
      playedDate: '2026-02-01',
      rating: 10,
      content: '최고의 게임',
      tags: ['한국게임', '어드벤처'],
      oneLineReview: '명작',
      isPublic: true,
    })

    const fetched = await getGameBySlug(db, a.id, created.slug)
    expect(fetched).not.toBeNull()
    expect(fetched?.tags.sort()).toEqual(['어드벤처', '한국게임'])
    expect(fetched?.title).toBe('젤다의 전설')
  })

  it('suggestTags includes game-pool tags scoped to owner', async () => {
    const { db, client } = await makeTestDb()
    try {
      const alice = await createUser(db, { username: 'alice' })
      const bob = await createUser(db, { username: 'bob' })
      await queryCreateGame(db, alice.id, {
        title: 'game',
        developer: 'd',
        genre: 'RPG',
        playedDate: '2026-01-01',
        rating: 7,
        content: '',
        tags: ['액션태그'],
        oneLineReview: null,
        isPublic: true,
      })
      const aliceSuggestions = await suggestTags(db, alice.id, '액션')
      expect(aliceSuggestions).toContain('액션태그')
      const bobSuggestions = await suggestTags(db, bob.id, '액션')
      expect(bobSuggestions).not.toContain('액션태그')
    } finally {
      client.close()
    }
  })
})

describe('countGamesByExternalIds', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('counts only own games by rawgId (multi-tenant isolation)', async () => {
    const a = await createUser(db, { username: 'aaaa' })
    const b = await createUser(db, { username: 'bbbb' })
    await createGame(db, a.id, { rawgId: 550, title: 'A1' })
    await createGame(db, a.id, { rawgId: 550, title: 'A2' })
    await createGame(db, b.id, { rawgId: 550, title: 'B' })

    const result = await countGamesByExternalIds(db, a.id, [550, 12345])
    expect(result.get(550)).toBe(2) // user a has 2; user b's 1 is excluded
    expect(result.get(12345)).toBeUndefined()
  })

  it('returns empty Map when no rawgIds provided', async () => {
    const a = await createUser(db, { username: 'aaaa' })
    const result = await countGamesByExternalIds(db, a.id, [])
    expect(result.size).toBe(0)
  })

  it('does not count rows with null rawgId (regression guard for SQLite IN semantics)', async () => {
    const a = await createUser(db, { username: 'aaaa' })
    await createGame(db, a.id, { rawgId: 550, title: 'with-rawg' })
    await createGame(db, a.id, { rawgId: null, title: 'no-rawg' })

    const result = await countGamesByExternalIds(db, a.id, [550])
    expect(result.get(550)).toBe(1)
    expect(result.size).toBe(1)
  })
})
