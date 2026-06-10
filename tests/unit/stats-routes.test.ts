// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return { ...actual, requireUser: vi.fn() }
})
vi.mock('@/lib/db/queries', () => ({
  getBookDashboard: vi.fn(async () => ({ kind: 'book' })),
  getMovieDashboard: vi.fn(async () => ({ kind: 'movie' })),
  getWritingDashboard: vi.fn(async () => ({ kind: 'writing' })),
}))

import { GET as booksGET } from '@/app/api/books/stats/route'
import { GET as moviesGET } from '@/app/api/movies/stats/route'
import { GET as writingsGET } from '@/app/api/writings/stats/route'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { getBookDashboard, getMovieDashboard, getWritingDashboard } from '@/lib/db/queries'

const ROUTES = [
  { name: 'books', GET: booksGET, queryFn: getBookDashboard, expected: { kind: 'book' } },
  { name: 'movies', GET: moviesGET, queryFn: getMovieDashboard, expected: { kind: 'movie' } },
  {
    name: 'writings',
    GET: writingsGET,
    queryFn: getWritingDashboard,
    expected: { kind: 'writing' },
  },
] as const

describe.each(ROUTES)('GET /api/$name/stats', ({ GET, queryFn, expected }) => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(401, { error: '로그인이 필요합니다' }))
    const res = await GET()
    expect(res.status).toBe(401)
    expect(queryFn).not.toHaveBeenCalled()
  })

  it('본인 userId로 dashboard 조회 후 JSON 반환', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 7 } as Awaited<ReturnType<typeof requireUser>>)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(vi.mocked(queryFn).mock.calls[0][1]).toBe(7) // (db, userId) — 본인 스코프
    expect(await res.json()).toEqual(expected)
  })
})
