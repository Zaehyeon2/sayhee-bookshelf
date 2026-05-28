import type { BookLookupResult } from './types'

// Detail search 파라미터(`d_isbn`, `d_titl` 등)는 advanced endpoint에서만 동작.
// 일반 `/book.json`은 `query=` 자유어 검색 전용이라 `d_isbn`을 무시하고 빈 결과를 반환한다.
const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/book_adv.json'

function stripBoldTags(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<\/?b>/g, '').trim()
}

function pickIsbn13(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.trim().split(/\s+/)
  return parts.find((p) => /^\d{13}$/.test(p)) ?? ''
}

// ISBN-10 → ISBN-13 변환 (Bookland EAN). Naver 응답에 ISBN-10만 포함되거나
// 사용자가 ISBN-10으로 검색한 경우에도 13자리 canonical form으로 정규화해
// dedup invariant(src/lib/external/books.ts)와 호환.
function isbn10to13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return body + check
}

function parsePubYear(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{4})/.exec(s.trim())
  if (!m) return undefined
  const y = Number(m[1])
  return y >= 1500 && y <= 2100 ? y : undefined
}

function safeCoverUrl(raw: string | undefined): string | undefined {
  const u = raw?.trim()
  if (!u) return undefined
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

interface NaverBookItem {
  title?: string
  image?: string
  author?: string
  publisher?: string
  pubdate?: string
  isbn?: string
  description?: string
}

interface NaverSearchResponse {
  items?: NaverBookItem[]
}

export async function lookupBookByIsbn(
  isbn: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BookLookupResult | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env vars not set')
  }
  if (!/^\d{10}(\d{3})?$/.test(isbn)) return null

  const url = new URL(NAVER_ENDPOINT)
  url.searchParams.set('d_isbn', isbn)
  url.searchParams.set('display', '1')

  // ISBN은 immutable identifier — 24h cache로 detail page 진입 latency 제거.
  // 같은 ISBN을 보는 모든 사용자가 첫 요청 이후 cache hit.
  // diagnostic: 같은 ISBN 연속 진입 시 이 로그가 안 찍히면 Data Cache HIT.
  console.log('[diag] naver-book lookup fetch', isbn)
  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    cache: 'force-cache',
    next: { revalidate: 86400, tags: ['naver-book-lookup'] },
  })

  if (res.status === 429)
    throw new Error(`Naver rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`)
  if (res.status === 401 || res.status === 403) throw new Error(`Naver auth ${res.status}`)
  if (res.status >= 500) throw new Error(`Naver upstream ${res.status}`)
  if (res.status >= 400) return null

  const data = (await res.json()) as NaverSearchResponse
  const item = data.items?.[0]
  if (!item) return null

  // Canonical 13-digit ISBN only — preserves dedup invariant with src/lib/external/books.ts.
  // Naver isbn 필드는 "ISBN10 ISBN13" 또는 한쪽만 올 수 있다.
  // 우선순위: Naver 응답의 13자리 → 입력의 13자리 → Naver 응답 10자리 변환 → 입력 10자리 변환.
  const naverIsbn10 = item.isbn?.trim().split(/\s+/).find((p) => /^\d{10}$/.test(p))
  const naverIsbn13 = pickIsbn13(item.isbn)
  const inputIsbn13 = /^\d{13}$/.test(isbn) ? isbn : ''
  const normalizedIsbn =
    naverIsbn13 ||
    inputIsbn13 ||
    (naverIsbn10 ? isbn10to13(naverIsbn10) : '') ||
    (/^\d{10}$/.test(isbn) ? isbn10to13(isbn) : '')
  if (!normalizedIsbn) return null

  const title = stripBoldTags(item.title)
  const author = stripBoldTags(item.author)
  // Required fields — absence signals malformed upstream response.
  if (!title || !author) return null

  return {
    isbn: normalizedIsbn,
    title,
    author,
    publisher: item.publisher?.trim() || undefined,
    year: parsePubYear(item.pubdate),
    coverUrl: safeCoverUrl(item.image),
    description: item.description ? stripBoldTags(item.description) : undefined,
  }
}
