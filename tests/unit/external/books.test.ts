import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchBooksExternal } from '@/lib/external/books'

const realFetch = globalThis.fetch

function jsonStub(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: init.headers,
    }),
  )
}

const FIXTURE = {
  total: 2,
  items: [
    {
      title: '해리 포터와 <b>마법사의 돌</b>',
      author: '조앤 K. 롤링',
      publisher: '문학수첩',
      pubdate: '19991201',
      isbn: '8983920777 9791193790403',
      image: 'https://shopping-phinf.pstatic.net/main_5118281/cover1.jpg',
      description: '...',
    },
    {
      title: '해리 포터와 비밀의 방',
      author: '조앤 K. 롤링',
      publisher: '문학수첩',
      pubdate: '20000801',
      isbn: '9791193790663',
      image: '',
      description: '',
    },
  ],
}

describe('searchBooksExternal (Naver)', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'test-id'
    process.env.NAVER_CLIENT_SECRET = 'test-secret'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('parses JSON and normalizes book results', async () => {
    globalThis.fetch = jsonStub(FIXTURE)
    const r = await searchBooksExternal('해리포터', { limit: 10 })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({
      externalId: '9791193790403', // ISBN13 preferred over ISBN10
      title: '해리 포터와 마법사의 돌', // <b> stripped
      byline: '조앤 K. 롤링',
      year: 1999,
      coverUrl: 'https://shopping-phinf.pstatic.net/main_5118281/cover1.jpg',
    })
    expect(r[0].genre).toBeUndefined() // Naver has no genre
    expect(r[1].coverUrl).toBeUndefined() // empty image omitted
  })

  it('drops items with no isbn', async () => {
    globalThis.fetch = jsonStub({
      items: [{ title: 'no-isbn', author: 'a', isbn: '' }],
    })
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('drops items with only ISBN10 (no canonical 13-digit form)', async () => {
    globalThis.fetch = jsonStub({
      items: [{ title: 'isbn10-only', author: 'a', isbn: '8983920777' }],
    })
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('rejects javascript: scheme in image', async () => {
    globalThis.fetch = jsonStub({
      items: [
        {
          title: 't',
          author: 'a',
          isbn: '9781111111111',
          image: 'javascript:alert(1)',
        },
      ],
    })
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r[0].coverUrl).toBeUndefined()
  })

  it('returns [] for 4xx', async () => {
    globalThis.fetch = jsonStub({}, { status: 400 })
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('throws on 5xx', async () => {
    globalThis.fetch = jsonStub({}, { status: 503 })
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/Naver upstream 503/)
  })

  it('throws on 429 with retry-after', async () => {
    globalThis.fetch = jsonStub({}, { status: 429, headers: { 'retry-after': '7' } })
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/retry-after=7/)
  })

  it('throws on 401/403 auth', async () => {
    globalThis.fetch = jsonStub({}, { status: 401 })
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/Naver auth 401/)
  })

  it('throws when credentials missing', async () => {
    delete process.env.NAVER_CLIENT_ID
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/NAVER_CLIENT/)
  })

  it('returns [] on empty query (defensive, no fetch)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'))
    const r = await searchBooksExternal('  ', { limit: 1 })
    expect(r).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
