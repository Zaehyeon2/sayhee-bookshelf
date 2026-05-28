import { XMLParser } from 'fast-xml-parser'
import type { BookGenre } from '@/lib/genres'
import type { BookSearchItem } from './types'

const SEOJI_ENDPOINT = 'https://www.nl.go.kr/seoji/SearchApi.do'

// KDC 첫 자리 → BookGenre verbatim 매칭만 (매핑 없으면 omit).
// BookGenre union으로 컴파일 타임에 드리프트 차단 — src/lib/genres.ts 참고.
// KDC: 0 총류, 1 철학, 2 종교, 3 사회과학, 4 자연과학, 5 기술과학, 6 예술, 7 언어, 8 문학, 9 역사.
// BOOK_GENRES와 verbatim 일치하는 것만 매핑 — 나머지는 omit.
const KDC_GENRE_MAP: Readonly<Record<string, BookGenre>> = {
  '2': '종교',
  '6': '예술',
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
})

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

  const url = new URL(SEOJI_ENDPOINT)
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

  return docs.slice(0, opts.limit).map((d) => {
    const isbn = d.EA_ISBN?.trim() || d.SET_ISBN?.trim() || d.CONTROL_NO?.trim() || ''
    return {
      externalId: isbn,
      title: d.TITLE?.trim() ?? '',
      byline: d.AUTHOR?.trim() ?? '',
      year: parsePubYear(d.PUBLISH_PREDATE),
      genre: mapKdcToGenre(d.KDC),
      coverUrl: d.TITLE_URL?.trim() || undefined,
    }
  })
}
