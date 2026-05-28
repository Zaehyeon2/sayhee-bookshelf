import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchBooksExternal } from '@/lib/external/books'

const realFetch = globalThis.fetch

function xmlStub(xml: string, status = 200) {
  return vi.fn().mockResolvedValue(new Response(xml, { status }))
}

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <TOTAL_COUNT>2</TOTAL_COUNT>
  <docs>
    <e>
      <TITLE>해리 포터와 마법사의 돌</TITLE>
      <AUTHOR>조앤 K. 롤링</AUTHOR>
      <PUBLISHER>문학수첩</PUBLISHER>
      <PUBLISH_PREDATE>19991201</PUBLISH_PREDATE>
      <EA_ISBN>9788983920775</EA_ISBN>
      <KDC>843</KDC>
      <TITLE_URL>https://image.nl.go.kr/cover1.jpg</TITLE_URL>
    </e>
    <e>
      <TITLE>해리 포터와 비밀의 방</TITLE>
      <AUTHOR>조앤 K. 롤링</AUTHOR>
      <PUBLISH_PREDATE>20000801</PUBLISH_PREDATE>
      <EA_ISBN>9788983920782</EA_ISBN>
      <KDC>843</KDC>
    </e>
  </docs>
</metadata>`

describe('searchBooksExternal', () => {
  beforeEach(() => {
    process.env.NL_KR_API_KEY = 'test-key'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('parses XML and normalizes book results', async () => {
    globalThis.fetch = xmlStub(FIXTURE_XML)
    const r = await searchBooksExternal('해리포터', { limit: 10 })
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({
      externalId: '9788983920775',
      title: '해리 포터와 마법사의 돌',
      byline: '조앤 K. 롤링',
      year: 1999,
      coverUrl: 'https://image.nl.go.kr/cover1.jpg',
    })
    expect(r[0].genre).toBe('소설') // KDC 843 = 영미문학 → 8 → 소설 (default fiction)
    expect(r[1].coverUrl).toBeUndefined() // TITLE_URL omitted
  })

  it('maps KDC 2xx → 종교 (verbatim)', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>1</TOTAL_COUNT><docs><e><TITLE>t</TITLE><AUTHOR>a</AUTHOR><EA_ISBN>1</EA_ISBN><KDC>234</KDC></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r[0].genre).toBe('종교')
  })

  it('maps KDC 6xx → 예술 and 9xx → 역사 (verbatim)', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>2</TOTAL_COUNT><docs><e><TITLE>a</TITLE><AUTHOR>a</AUTHOR><EA_ISBN>6</EA_ISBN><KDC>650</KDC></e><e><TITLE>b</TITLE><AUTHOR>b</AUTHOR><EA_ISBN>9</EA_ISBN><KDC>911</KDC></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 2 })
    expect(r[0].genre).toBe('예술')
    expect(r[1].genre).toBe('역사')
  })

  it('returns [] for 4xx', async () => {
    globalThis.fetch = xmlStub('', 400)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('throws on 5xx', async () => {
    globalThis.fetch = xmlStub('', 503)
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow()
  })

  it('throws on 429 with retry-after info', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '12' } }))
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/retry-after=12/)
  })

  it('throws on 401/403 (auth error)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/auth 401/)
  })

  it('throws when API key missing', async () => {
    delete process.env.NL_KR_API_KEY
    await expect(searchBooksExternal('x', { limit: 1 })).rejects.toThrow(/NL_KR_API_KEY/)
  })

  it('handles empty result set', async () => {
    globalThis.fetch = xmlStub(
      '<?xml version="1.0"?><metadata><TOTAL_COUNT>0</TOTAL_COUNT><docs></docs></metadata>',
    )
    const r = await searchBooksExternal('zzz', { limit: 1 })
    expect(r).toEqual([])
  })

  it('handles single result wrapped (XML parser returns object, not array)', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>1</TOTAL_COUNT><docs><e><TITLE>solo</TITLE><AUTHOR>a</AUTHOR><EA_ISBN>978111</EA_ISBN><KDC>650</KDC></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 5 })
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('solo')
  })

  it('falls back to SET_ISBN when EA_ISBN missing', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>1</TOTAL_COUNT><docs><e><TITLE>t</TITLE><AUTHOR>a</AUTHOR><SET_ISBN>978222</SET_ISBN></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r[0].externalId).toBe('978222')
  })

  it('returns [] when <docs> is empty (fast-xml-parser stringifies)', async () => {
    const xml = `<?xml version="1.0"?><metadata><docs></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('drops docs with no identifier (empty EA_ISBN/SET_ISBN/CONTROL_NO)', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>1</TOTAL_COUNT><docs><e><TITLE>익명 책</TITLE><AUTHOR>저자</AUTHOR></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r).toEqual([])
  })

  it('rejects javascript: scheme in TITLE_URL', async () => {
    const xml = `<?xml version="1.0"?><metadata><TOTAL_COUNT>1</TOTAL_COUNT><docs><e><TITLE>t</TITLE><AUTHOR>a</AUTHOR><EA_ISBN>9781</EA_ISBN><TITLE_URL>javascript:alert(1)</TITLE_URL></e></docs></metadata>`
    globalThis.fetch = xmlStub(xml)
    const r = await searchBooksExternal('x', { limit: 1 })
    expect(r[0].coverUrl).toBeUndefined()
  })

  it('returns [] on empty query (defensive)', async () => {
    // No fetch stub — function should short-circuit before reaching fetch.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called'))
    const r = await searchBooksExternal('   ', { limit: 1 })
    expect(r).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
