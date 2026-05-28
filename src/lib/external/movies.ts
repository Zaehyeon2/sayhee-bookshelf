import type { MovieSearchItem } from './types'
import type { MovieGenre } from '@/lib/genres'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const POSTER_PREFIX = 'https://image.tmdb.org/t/p/w185'

// TMDB genre id → MOVIE_GENRES verbatim 매칭만 (매핑 없으면 omit).
// MovieGenre union으로 컴파일 타임에 드리프트 차단.
const TMDB_GENRE_MAP: Readonly<Record<number, MovieGenre>> = {
  28: '액션',
  16: '애니메이션',
  35: '코미디',
  99: '다큐멘터리',
  18: '드라마',
  27: '공포',
  10749: '로맨스',
  878: 'SF',
  53: '스릴러',
}

interface TmdbSearchResponse {
  results?: Array<{
    id: number
    title: string
    original_title?: string
    release_date?: string
    poster_path?: string | null
    genre_ids?: number[]
  }>
}

export async function searchMoviesExternal(
  query: string,
  opts: { limit: number; signal?: AbortSignal } = { limit: 10 },
): Promise<MovieSearchItem[]> {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB_API_KEY env var not set')

  const url = new URL(`${TMDB_BASE}/search/movie`)
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'ko-KR')
  url.searchParams.set('include_adult', 'false')

  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  })
  if (res.status === 429) {
    throw new Error(
      `TMDB rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`,
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`TMDB auth ${res.status}`)
  }
  if (res.status >= 500) {
    throw new Error(`TMDB upstream ${res.status}`)
  }
  if (res.status >= 400) {
    return []
  }
  const data = (await res.json()) as TmdbSearchResponse
  const results = data.results ?? []
  return results.slice(0, opts.limit).map((r) => {
    const year =
      r.release_date && /^\d{4}-/.test(r.release_date)
        ? Number(r.release_date.slice(0, 4))
        : undefined
    // Take TMDB's primary genre (first id). If unmapped → omit genre (user picks).
    const primaryGenreId = r.genre_ids?.[0]
    const genre = primaryGenreId != null ? TMDB_GENRE_MAP[primaryGenreId] : undefined
    const subtitle =
      r.original_title && r.original_title !== r.title ? r.original_title : undefined
    return {
      externalId: r.id,
      title: r.title,
      subtitle,
      // TMDB search results omit director — populated on detail fetch (out of scope).
      // Users will fill the director field manually.
      byline: '',
      year,
      genre,
      coverUrl: r.poster_path ? `${POSTER_PREFIX}${r.poster_path}` : undefined,
    }
  })
}
