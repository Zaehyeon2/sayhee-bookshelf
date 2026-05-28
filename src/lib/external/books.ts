import type { BookSearchItem } from './types'

const NAVER_ENDPOINT = 'https://openapi.naver.com/v1/search/book.json'

function stripBoldTags(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<\/?b>/g, '').trim()
}

function pickIsbn13(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.trim().split(/\s+/)
  // Strict: only canonical 13-digit ISBN. ISBN10-only or non-numeric tokens
  // are rejected so the dedup invariant (countBooksByExternalIds) holds.
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
  link?: string
  image?: string
  author?: string
  discount?: string
  publisher?: string
  pubdate?: string
  isbn?: string
  description?: string
}

interface NaverSearchResponse {
  lastBuildDate?: string
  total?: number
  start?: number
  display?: number
  items?: NaverBookItem[]
}

export async function searchBooksExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<BookSearchItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env vars not set')
  }
  if (!query.trim()) return []

  const url = new URL(NAVER_ENDPOINT)
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(Math.min(opts.limit, 30)))

  // 외부 검색 결과는 query 기반 cache — 1h revalidate (신간 반영 + 외부 왕복 절감).
  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['naver-book-search'] },
  })

  if (res.status === 429) {
    throw new Error(
      `Naver rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Naver auth ${res.status}`)
  }
  if (res.status >= 500) throw new Error(`Naver upstream ${res.status}`)
  if (res.status >= 400) return []

  const data = (await res.json()) as NaverSearchResponse
  const items = data.items ?? []

  return items.slice(0, opts.limit).flatMap((it) => {
    const isbn = pickIsbn13(it.isbn)
    if (!isbn) return []
    return [
      {
        externalId: isbn,
        title: stripBoldTags(it.title),
        byline: stripBoldTags(it.author),
        year: parsePubYear(it.pubdate),
        // Naver는 장르 정보 미제공 — undefined.
        genre: undefined,
        coverUrl: safeCoverUrl(it.image),
      },
    ]
  })
}
