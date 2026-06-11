import type { GameSearchItem } from './types'
import type { GameGenre } from '@/lib/genres'

const RAWG_BASE = 'https://api.rawg.io/api'

// RAWG genre slug → GAME_GENRES verbatim 매칭만 (매핑 없으면 omit).
// GameGenre union으로 컴파일 타임에 드리프트 차단.
const RAWG_GENRE_MAP: Readonly<Record<string, GameGenre>> = {
  'role-playing-games-rpg': 'RPG',
  action: '액션',
  adventure: '어드벤처',
  shooter: '슈팅',
  simulation: '시뮬레이션',
  strategy: '전략',
  puzzle: '퍼즐',
  sports: '스포츠',
  racing: '레이싱',
  indie: '인디',
}

interface RawgSearchResponse {
  results?: Array<{
    id: number
    name: string
    released?: string | null
    background_image?: string | null
    rating?: number // 0-5
    genres?: Array<{ slug?: string }>
  }>
}

export async function searchGamesExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<GameSearchItem[]> {
  const key = process.env.RAWG_API_KEY
  if (!key) throw new Error('RAWG_API_KEY env var not set')

  const url = new URL(`${RAWG_BASE}/games`)
  url.searchParams.set('key', key)
  url.searchParams.set('search', query)
  url.searchParams.set('page_size', String(opts.limit))

  // 외부 검색 결과는 query 기반 cache — 1h revalidate (신규 등록 반영 + 외부 왕복 절감).
  const res = await fetch(url, {
    signal: opts.signal,
    headers: { accept: 'application/json' },
    cache: 'force-cache',
    next: { revalidate: 3600, tags: ['rawg-game-search'] },
  })
  // SECURITY: 에러 메시지에 url 포함 금지 — 쿼리 파라미터에 API 키가 들어있음.
  if (res.status === 429) {
    throw new Error(
      `RAWG rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`RAWG auth ${res.status}`)
  }
  if (res.status >= 500) {
    throw new Error(`RAWG upstream ${res.status}`)
  }
  if (res.status >= 400) {
    return []
  }
  const data = (await res.json()) as RawgSearchResponse
  const results = data.results ?? []
  return results.slice(0, opts.limit).map((r) => {
    const year =
      r.released && /^\d{4}-/.test(r.released) ? Number(r.released.slice(0, 4)) : undefined
    // RAWG 첫 장르 slug만 사용. 미매핑 → omit (사용자가 직접 선택).
    const primarySlug = r.genres?.[0]?.slug
    const genre = primarySlug != null ? RAWG_GENRE_MAP[primarySlug] : undefined
    // RAWG rating은 0-5 스케일 — ExternalSearchItem 계약(0-10)에 맞춰 ×2.
    const externalRating =
      typeof r.rating === 'number' && Number.isFinite(r.rating) && r.rating > 0
        ? Math.round(r.rating * 2 * 10) / 10
        : undefined
    return {
      externalId: r.id,
      title: r.name,
      // RAWG search results omit developers — populated on detail fetch (out of scope).
      // Users will fill the developer field manually.
      byline: '',
      year,
      genre,
      coverUrl: r.background_image ?? undefined,
      externalRating,
    }
  })
}
