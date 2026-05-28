import { XMLParser } from 'fast-xml-parser'
import type { BookGenre } from '@/lib/genres'
import type { BookSearchItem } from './types'

const SEOJI_ENDPOINT = 'https://www.nl.go.kr/seoji/SearchApi.do'

// KDC 첫 자리 → BookGenre 매핑.
// '2', '6', '9': BOOK_GENRES와 verbatim 일치 — 정확.
// '8': 문학 → '소설' best-effort default (한국 단행본 대부분이 KDC 8x).
//   시·에세이·판타지/SF는 사용자가 수동으로 수정. 잘못된 자동 매칭이 빈 자동 매칭보다 UX 우위.
// 나머지(0/1/3/4/5/7): verbatim 매칭 없음, omit.
const KDC_GENRE_MAP: Readonly<Record<string, BookGenre>> = {
  '2': '종교',
  '6': '예술',
  '8': '소설', // KDC 8 = 문학 — fiction default; user can change to 시/에세이/판타지·SF
  '9': '역사',
}

function mapKdcToGenre(kdc: string | undefined): BookGenre | undefined {
  if (!kdc) return undefined
  const head = kdc.trim()[0]
  return head ? KDC_GENRE_MAP[head] : undefined
}

function parsePubYear(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{4})/.exec(s)
  return m ? Number(m[1]) : undefined
}

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
  // Security hardening — explicit to survive dep upgrades:
  processEntities: false,
  allowBooleanAttributes: false,
  htmlEntities: false,
})

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

interface SeojiDoc {
  TITLE?: string
  AUTHOR?: string
  PUBLISHER?: string
  PUBLISH_PREDATE?: string
  EA_ISBN?: string
  SET_ISBN?: string
  KDC?: string
  TITLE_URL?: string
  CONTROL_NO?: string
}

interface SeojiResponse {
  metadata?: {
    docs?: { e?: SeojiDoc | SeojiDoc[] } | string
  }
}

export async function searchBooksExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<BookSearchItem[]> {
  const key = process.env.NL_KR_API_KEY
  if (!key) throw new Error('NL_KR_API_KEY env var not set')
  if (!query.trim()) return []

  const url = new URL(SEOJI_ENDPOINT)
  // NOTE: SeoJi API only supports query-string auth (no Authorization header).
  // cert_key will appear in upstream access logs / Referer chains by design.
  // Mitigation: proxy route (Task 6) MUST NOT log this URL on error.
  url.searchParams.set('cert_key', key)
  url.searchParams.set('result_style', 'xml')
  url.searchParams.set('page_no', '1')
  url.searchParams.set('page_size', String(Math.min(opts.limit, 30)))
  url.searchParams.set('title', query)

  const res = await fetch(url, { signal: opts.signal })
  if (res.status === 429) {
    throw new Error(
      `NL-KR rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`NL-KR auth ${res.status}`)
  }
  if (res.status >= 500) throw new Error(`NL-KR upstream ${res.status}`)
  if (res.status >= 400) return []

  const xml = await res.text()
  const parsed = parser.parse(xml) as SeojiResponse
  const docsRaw = parsed.metadata?.docs
  if (!docsRaw || typeof docsRaw === 'string') return []
  const eRaw = docsRaw.e
  if (!eRaw) return []
  const docs: SeojiDoc[] = Array.isArray(eRaw) ? eRaw : [eRaw]

  return docs.slice(0, opts.limit).flatMap((d) => {
    const isbn = d.EA_ISBN?.trim() || d.SET_ISBN?.trim() || d.CONTROL_NO?.trim()
    if (!isbn) return []
    return [
      {
        externalId: isbn,
        title: d.TITLE?.trim() ?? '',
        byline: d.AUTHOR?.trim() ?? '',
        year: parsePubYear(d.PUBLISH_PREDATE),
        genre: mapKdcToGenre(d.KDC),
        coverUrl: safeCoverUrl(d.TITLE_URL),
      },
    ]
  })
}
