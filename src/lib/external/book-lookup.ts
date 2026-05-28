import type { BookLookupResult } from './types'

const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/book.json'

function stripBoldTags(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<\/?b>/g, '').trim()
}

function pickIsbn13(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.trim().split(/\s+/)
  return parts.find((p) => /^\d{13}$/.test(p)) ?? ''
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

  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
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
  // If neither Naver response nor input yields 13 digits, treat as not-found.
  const naverIsbn13 = pickIsbn13(item.isbn)
  const inputIsbn13 = /^\d{13}$/.test(isbn) ? isbn : ''
  const normalizedIsbn = naverIsbn13 || inputIsbn13
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
