import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchMoviesExternal } from '@/lib/external/movies'

const realFetch = globalThis.fetch

function stub(json: unknown, init: { status?: number } = {}) {
  return Object.assign(
    vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status: init.status ?? 200 })),
  )
}

describe('searchMoviesExternal', () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('normalizes TMDB results', async () => {
    globalThis.fetch = stub({
      results: [
        {
          id: 550,
          title: '파이트 클럽',
          original_title: 'Fight Club',
          release_date: '1999-10-15',
          poster_path: '/abc.jpg',
          genre_ids: [18, 53],
        },
      ],
    })
    const r = await searchMoviesExternal('파이트', { limit: 10 })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      externalId: 550,
      title: '파이트 클럽',
      subtitle: 'Fight Club',
      year: 1999,
      coverUrl: 'https://image.tmdb.org/t/p/w185/abc.jpg',
    })
    expect(r[0].genre).toBe('드라마')
    expect(r[0].byline).toBe('')
  })

  it('omits poster when poster_path null', async () => {
    globalThis.fetch = stub({
      results: [{ id: 1, title: 't', genre_ids: [], release_date: '' }],
    })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r[0].coverUrl).toBeUndefined()
  })

  it('omits year when release_date empty/invalid', async () => {
    globalThis.fetch = stub({
      results: [{ id: 1, title: 't', genre_ids: [], release_date: '' }],
    })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r[0].year).toBeUndefined()
  })

  it('throws when TMDB returns 5xx', async () => {
    globalThis.fetch = stub({ status_message: 'err' }, { status: 500 })
    await expect(searchMoviesExternal('x', { limit: 1 })).rejects.toThrow()
  })

  it('returns [] for 4xx (empty result swallow)', async () => {
    globalThis.fetch = stub({ status_message: 'bad' }, { status: 422 })
    const r = await searchMoviesExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('throws when API key missing', async () => {
    delete process.env.TMDB_API_KEY
    await expect(searchMoviesExternal('x', { limit: 1 })).rejects.toThrow(/TMDB_API_KEY/)
  })
})
