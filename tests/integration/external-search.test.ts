import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetRateLimitForTest, EXTERNAL_SEARCH_RATE_LIMIT } from '@/lib/external/rate-limit'

// Mock db/client to avoid TURSO_URL env requirement during module load.
// auth-helpers imports db/client transitively (via getCurrentUser → schema → client).
// Fail-loud Proxy — surface any accidental db usage in routes that should be db-free.
vi.mock('@/lib/db/client', () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        throw new Error(
          `Test attempted to use db.${String(prop)} but db is mocked. ` +
            `If this route now needs db access, mock the specific query instead.`,
        )
      },
    },
  ),
}))

// Mock auth-helpers — control requireUser per test.
vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return {
    ...actual,
    requireUser: vi.fn(),
  }
})

import { HttpError } from '@/lib/auth-helpers'
import type { User } from '@/lib/db/schema'

// Mock external adapters — proxy routes never hit real APIs.
vi.mock('@/lib/external/books', () => ({
  searchBooksExternal: vi.fn(),
}))
vi.mock('@/lib/external/movies', () => ({
  searchMoviesExternal: vi.fn(),
}))
vi.mock('@/lib/external/games', () => ({
  searchGamesExternal: vi.fn(),
}))

import { GET as booksSearch } from '@/app/api/external/books/search/route'
import { GET as moviesSearch } from '@/app/api/external/movies/search/route'
import { GET as gamesSearch } from '@/app/api/external/games/search/route'
import { requireUser } from '@/lib/auth-helpers'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'
import { searchGamesExternal } from '@/lib/external/games'

const TEST_USER: User = {
  id: 42,
  username: 'test',
  displayName: 'Test',
  passwordHash: 'x',
  role: 'member',
  mustChangePassword: 0,
  tokenVersion: 1,
  createdAt: Date.now(),
}

function req(url: string): Request {
  return new Request(url)
}

describe('GET /api/external/books/search', () => {
  beforeEach(() => {
    _resetRateLimitForTest()
    vi.mocked(requireUser).mockReset()
    vi.mocked(searchBooksExternal).mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, { error: '로그인이 필요합니다' }),
    )
    const r = await booksSearch(req('https://x/api/external/books/search?q=hello'))
    expect(r.status).toBe(401)
    const body = await r.json()
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when q is shorter than 2 chars', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    const r = await booksSearch(req('https://x/api/external/books/search?q=a'))
    expect(r.status).toBe(400)
  })

  it('returns 400 when q is missing entirely', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    const r = await booksSearch(req('https://x/api/external/books/search'))
    expect(r.status).toBe(400)
  })

  it('returns normalized items + source on success', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchBooksExternal).mockResolvedValue([
      { externalId: '9781', title: '책', byline: '저자' },
    ])
    const r = await booksSearch(req('https://x/api/external/books/search?q=책방'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('naver')
    expect(body.items).toHaveLength(1)
    expect(body.items[0].externalId).toBe('9781')
    expect(r.headers.get('cache-control')).toContain('private')
    expect(r.headers.get('cache-control')).toContain('max-age=300')
  })

  it('returns 503 when adapter throws', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchBooksExternal).mockRejectedValue(new Error('upstream 500'))
    const r = await booksSearch(req('https://x/api/external/books/search?q=hi'))
    expect(r.status).toBe(503)
  })

  it('rate-limits after configured limit, with Retry-After header', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchBooksExternal).mockResolvedValue([])
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) {
      const r = await booksSearch(req('https://x/api/external/books/search?q=hi'))
      expect(r.status).toBe(200)
    }
    const r = await booksSearch(req('https://x/api/external/books/search?q=hi'))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBeTruthy()
  })
})

describe('GET /api/external/movies/search', () => {
  beforeEach(() => {
    _resetRateLimitForTest()
    vi.mocked(requireUser).mockReset()
    vi.mocked(searchMoviesExternal).mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, { error: '로그인이 필요합니다' }),
    )
    const r = await moviesSearch(req('https://x/api/external/movies/search?q=hello'))
    expect(r.status).toBe(401)
  })

  it('returns normalized items with source=tmdb', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchMoviesExternal).mockResolvedValue([
      { externalId: 42, title: '영화', byline: '' },
    ])
    const r = await moviesSearch(req('https://x/api/external/movies/search?q=영화관'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('tmdb')
    expect(body.items[0].externalId).toBe(42)
  })

  it('returns 503 when adapter throws', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchMoviesExternal).mockRejectedValue(new Error('upstream 500'))
    const r = await moviesSearch(req('https://x/api/external/movies/search?q=hi'))
    expect(r.status).toBe(503)
  })

  it('shares rate-limit bucket per user', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchMoviesExternal).mockResolvedValue([])
    for (let i = 0; i < EXTERNAL_SEARCH_RATE_LIMIT; i++) {
      const r = await moviesSearch(req('https://x/api/external/movies/search?q=hi'))
      expect(r.status).toBe(200)
    }
    const r = await moviesSearch(req('https://x/api/external/movies/search?q=hi'))
    expect(r.status).toBe(429)
  })
})

describe('GET /api/external/games/search', () => {
  beforeEach(() => {
    _resetRateLimitForTest()
    vi.mocked(requireUser).mockReset()
    vi.mocked(searchGamesExternal).mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, { error: '로그인이 필요합니다' }),
    )
    const r = await gamesSearch(req('https://x/api/external/games/search?q=zelda'))
    expect(r.status).toBe(401)
  })

  it('returns normalized items with source=rawg on success', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchGamesExternal).mockResolvedValue([
      {
        externalId: 3498,
        title: 'The Witcher 3: Wild Hunt',
        byline: '',
        year: 2015,
        genre: 'RPG',
        coverUrl: 'https://media.rawg.io/cover.jpg',
        externalRating: 9.4,
      },
    ])
    const r = await gamesSearch(req('https://x/api/external/games/search?q=witcher'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('rawg')
    expect(body.items).toHaveLength(1)
    expect(body.items[0].externalId).toBe(3498)
    expect(body.items[0].title).toBe('The Witcher 3: Wild Hunt')
    expect(body.items[0].year).toBe(2015)
    expect(body.items[0].genre).toBe('RPG')
    expect(body.items[0].externalRating).toBe(9.4)
    expect(r.headers.get('cache-control')).toContain('private')
    expect(r.headers.get('cache-control')).toContain('max-age=300')
  })

  it('returns empty items array when adapter returns empty (4xx from RAWG)', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchGamesExternal).mockResolvedValue([])
    const r = await gamesSearch(req('https://x/api/external/games/search?q=notfound'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.source).toBe('rawg')
    expect(body.items).toHaveLength(0)
  })

  it('maps RAWG rating ×2 correctly (0-5 → 0-10)', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    // rating 4.7 × 2 = 9.4
    vi.mocked(searchGamesExternal).mockResolvedValue([
      { externalId: 1, title: 'Game', byline: '', externalRating: 9.4 },
    ])
    const r = await gamesSearch(req('https://x/api/external/games/search?q=game'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.items[0].externalRating).toBe(9.4)
  })

  it('returns 400 when q is too short', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    const r = await gamesSearch(req('https://x/api/external/games/search?q=a'))
    expect(r.status).toBe(400)
  })

  it('returns 503 when adapter throws', async () => {
    vi.mocked(requireUser).mockResolvedValue(TEST_USER)
    vi.mocked(searchGamesExternal).mockRejectedValue(new Error('RAWG upstream 500'))
    const r = await gamesSearch(req('https://x/api/external/games/search?q=game'))
    expect(r.status).toBe(503)
  })
})
