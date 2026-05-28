import { cacheLife, cacheTag } from 'next/cache'
import type { MovieLookupResult } from './types'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const POSTER_PREFIX = 'https://image.tmdb.org/t/p/w342'

export const TMDB_MOVIE_LOOKUP_TAG = 'tmdb-movie-lookup'

interface TmdbMovieDetail {
  id?: number
  title?: string
  original_title?: string
  release_date?: string
  poster_path?: string | null
  overview?: string
  vote_average?: number
}

async function fetchTmdbMovie(tmdbId: number): Promise<TmdbMovieDetail | null> {
  'use cache: remote'
  cacheTag(TMDB_MOVIE_LOOKUP_TAG)
  cacheLife('days')

  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB_API_KEY env var not set')

  const url = new URL(`${TMDB_BASE}/movie/${tmdbId}`)
  url.searchParams.set('language', 'ko-KR')

  console.log('[diag] tmdb-movie lookup fetch', tmdbId)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  })

  if (res.status === 404) return null
  if (res.status === 429)
    throw new Error(`TMDB rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`)
  if (res.status === 401 || res.status === 403) throw new Error(`TMDB auth ${res.status}`)
  if (res.status >= 500) throw new Error(`TMDB upstream ${res.status}`)
  if (res.status >= 400) return null

  return (await res.json()) as TmdbMovieDetail
}

export async function lookupMovieByTmdbId(
  tmdbId: number,
  _opts: { signal?: AbortSignal } = {},
): Promise<MovieLookupResult | null> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
  const data = await fetchTmdbMovie(tmdbId)
  if (!data || !data.id || !data.title) return null

  const year =
    data.release_date && /^\d{4}-/.test(data.release_date)
      ? Number(data.release_date.slice(0, 4))
      : undefined

  return {
    tmdbId: data.id,
    title: data.title,
    originalTitle:
      data.original_title && data.original_title !== data.title ? data.original_title : undefined,
    year,
    coverUrl: data.poster_path ? `${POSTER_PREFIX}${data.poster_path}` : undefined,
    description: data.overview?.trim() || undefined,
    externalRating:
      typeof data.vote_average === 'number' && data.vote_average > 0
        ? Math.round(data.vote_average * 10) / 10
        : undefined,
  }
}
