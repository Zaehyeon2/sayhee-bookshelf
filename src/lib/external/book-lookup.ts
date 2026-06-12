import { cacheLife, cacheTag } from 'next/cache'
import type { BookLookupResult } from './types'
import { EXTERNAL_FETCH_TIMEOUT_MS } from './timeout'
import { isbn10to13 } from '@/lib/isbn'

export const NAVER_BOOK_LOOKUP_TAG = 'naver-book-lookup'

/**
 * Naver가 해당 ISBN을 찾지 못한 경우(4xx 또는 빈 결과)를 나타내는 sentinel.
 * 'use cache' 함수 안에서 throw하면 결과가 캐시되지 않으므로, 일시적 빈 응답이
 * cacheLife('days') 동안 not-found로 굳는 것을 방지한다. 실제 발견된 항목만 캐시된다.
 */
class NaverBookNotFound extends Error {}

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

// 'use cache: remote' inner — isbn만 인자, signal/opts는 cache key에 안 포함.
// Vercel Runtime Cache로 첫 hit 이후 모든 region에서 공유.
async function fetchNaverBookItem(isbn: string): Promise<NaverBookItem> {
  'use cache: remote'
  cacheTag(NAVER_BOOK_LOOKUP_TAG)
  cacheLife('days')

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET env vars not set')
  }
  const url = new URL(NAVER_ENDPOINT)
  url.searchParams.set('d_isbn', isbn)
  url.searchParams.set('display', '1')

  // 호출자 signal은 cache key 문제로 못 받음(위 주석) — 함수 내부에서 자체 5s timeout 생성.
  // 없으면 upstream hang 시 캐시 미스 요청이 무한 대기.
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
  })

  if (res.status === 429)
    throw new Error(`Naver rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`)
  if (res.status === 401 || res.status === 403) throw new Error(`Naver auth ${res.status}`)
  if (res.status >= 500) throw new Error(`Naver upstream ${res.status}`)
  // 4xx / 빈 결과는 throw → 캐시되지 않음(일시적 빈 응답이 days 동안 굳는 것 방지).
  if (res.status >= 400) throw new NaverBookNotFound()

  const data = (await res.json()) as NaverSearchResponse
  const item = data.items?.[0]
  if (!item) throw new NaverBookNotFound()
  return item
}

export async function lookupBookByIsbn(isbn: string): Promise<BookLookupResult | null> {
  if (!/^\d{10}(\d{3})?$/.test(isbn)) return null
  let item: NaverBookItem
  try {
    item = await fetchNaverBookItem(isbn)
  } catch (e) {
    // not-found는 정상 null 반환(상위 safeBookLookup이 에러 로깅하지 않게).
    if (e instanceof NaverBookNotFound) return null
    throw e
  }

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
