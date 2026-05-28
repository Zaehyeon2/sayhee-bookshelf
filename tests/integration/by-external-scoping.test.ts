import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestDb, type TestDb } from '../setup-db'
import { createBook, createMovie, createUser } from '../factories'
import type { User } from '@/lib/db/schema'

// db/client은 route에서 module-level singleton으로 import됨.
// 테스트마다 fresh TestDb를 swap-in 하기 위해 getter로 노출.
let testDb: TestDb | null = null

vi.mock('@/lib/db/client', () => ({
  get db() {
    if (!testDb) throw new Error('testDb not set — call makeTestDb() in beforeEach')
    return testDb
  },
}))

// auth-helpers: 실제 HttpError 클래스는 보존, requireUser만 stub.
vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return {
    ...actual,
    requireUser: vi.fn(),
  }
})

import { GET as booksByExternal } from '@/app/api/books/by-external/route'
import { GET as moviesByExternal } from '@/app/api/movies/by-external/route'
import { HttpError, requireUser } from '@/lib/auth-helpers'

function req(url: string): Request {
  return new Request(url)
}

function asTestUser(u: { id: number }): User {
  return {
    id: u.id,
    username: `user-${u.id}`,
    displayName: `User ${u.id}`,
    passwordHash: 'x',
    role: 'member',
    mustChangePassword: 0,
    tokenVersion: 1,
    createdAt: Date.now(),
  }
}

describe('GET /api/books/by-external', () => {
  beforeEach(async () => {
    ;({ db: testDb } = await makeTestDb())
    vi.mocked(requireUser).mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, { error: '로그인이 필요합니다' }),
    )
    const r = await booksByExternal(req('https://x/api/books/by-external?ids=a,b'))
    expect(r.status).toBe(401)
  })

  it('counts only own books by isbn (multi-tenant isolation)', async () => {
    const userA = await createUser(testDb!, { username: 'aaaa' })
    const userB = await createUser(testDb!, { username: 'bbbb' })

    await createBook(testDb!, userA.id, { isbn: '9781', title: 'A1' })
    await createBook(testDb!, userA.id, { isbn: '9781', title: 'A2' })
    await createBook(testDb!, userB.id, { isbn: '9781', title: 'B' })

    vi.mocked(requireUser).mockResolvedValue(asTestUser(userA))

    const r = await booksByExternal(req('https://x/api/books/by-external?ids=9781,9999'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts['9781']).toBe(2)
    expect(body.counts['9999']).toBeUndefined()
  })

  it('returns empty counts when no matches', async () => {
    const user = await createUser(testDb!, { username: 'lone' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    const r = await booksByExternal(req('https://x/api/books/by-external?ids=zzz'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts).toEqual({})
  })

  it('rejects empty ids with 400', async () => {
    const user = await createUser(testDb!, { username: 'lone' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    const r = await booksByExternal(req('https://x/api/books/by-external?ids='))
    expect(r.status).toBe(400)
  })

  it('dedupes repeated ids in counts result', async () => {
    const user = await createUser(testDb!, { username: 'dup1' })
    await createBook(testDb!, user.id, { isbn: '9781', title: 'A1' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    const r = await booksByExternal(req('https://x/api/books/by-external?ids=9781,9781,9781'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts['9781']).toBe(1)
  })
})

describe('GET /api/movies/by-external', () => {
  beforeEach(async () => {
    ;({ db: testDb } = await makeTestDb())
    vi.mocked(requireUser).mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, { error: '로그인이 필요합니다' }),
    )
    const r = await moviesByExternal(req('https://x/api/movies/by-external?ids=550'))
    expect(r.status).toBe(401)
  })

  it('counts only own movies by tmdbId (numeric, multi-tenant isolation)', async () => {
    const userA = await createUser(testDb!, { username: 'aaaa' })
    const userB = await createUser(testDb!, { username: 'bbbb' })

    await createMovie(testDb!, userA.id, { tmdbId: 550, title: 'A1' })
    await createMovie(testDb!, userA.id, { tmdbId: 550, title: 'A2' })
    await createMovie(testDb!, userB.id, { tmdbId: 550, title: 'B' })

    vi.mocked(requireUser).mockResolvedValue(asTestUser(userA))

    const r = await moviesByExternal(req('https://x/api/movies/by-external?ids=550,12345'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts['550']).toBe(2)
    expect(body.counts['12345']).toBeUndefined()
  })

  it('filters out non-numeric ids', async () => {
    const user = await createUser(testDb!, { username: 'lone' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    // ExternalIdsQuerySchema는 string[]을 허용하지만 route가 numeric만 통과.
    // 550에 매칭되는 데이터가 없으므로 counts는 빈 객체.
    const r = await moviesByExternal(req('https://x/api/movies/by-external?ids=abc,550'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts).toEqual({})
  })

  it('rejects empty ids with 400', async () => {
    const user = await createUser(testDb!, { username: 'lone' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    const r = await moviesByExternal(req('https://x/api/movies/by-external?ids='))
    expect(r.status).toBe(400)
  })

  it('returns counts only for ids the user actually has', async () => {
    const user = await createUser(testDb!, { username: 'solo' })
    await createMovie(testDb!, user.id, { tmdbId: 100, title: 'M1' })
    await createMovie(testDb!, user.id, { tmdbId: 200, title: 'M2' })
    vi.mocked(requireUser).mockResolvedValue(asTestUser(user))

    const r = await moviesByExternal(req('https://x/api/movies/by-external?ids=100,200,300'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.counts['100']).toBe(1)
    expect(body.counts['200']).toBe(1)
    expect(body.counts['300']).toBeUndefined()
  })
})
