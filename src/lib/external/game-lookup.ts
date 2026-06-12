import { cacheLife, cacheTag } from 'next/cache'
import type { GameLookupResult } from './types'

const RAWG_BASE = 'https://api.rawg.io/api'

export const RAWG_GAME_LOOKUP_TAG = 'rawg-game-lookup'

interface RawgGameDetail {
  id?: number
  name?: string
  name_original?: string
  released?: string | null
  background_image?: string | null
  description_raw?: string
  rating?: number // 0-5
  developers?: Array<{ name?: string }>
}

async function fetchRawgGame(rawgId: number): Promise<RawgGameDetail | null> {
  'use cache: remote'
  cacheTag(RAWG_GAME_LOOKUP_TAG)
  cacheLife('days')

  const key = process.env.RAWG_API_KEY
  if (!key) throw new Error('RAWG_API_KEY env var not set')

  const url = new URL(`${RAWG_BASE}/games/${rawgId}`)
  url.searchParams.set('key', key)

  console.log('[diag] rawg-game lookup fetch', rawgId)
  // SECURITY: 에러 메시지에 url 포함 금지 — 쿼리 파라미터에 API 키가 들어있음.
  // 'use cache: remote' 함수라 호출자 signal을 인자로 못 받음(cache key 오염) — 내부 5s timeout.
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })

  if (res.status === 404) return null
  if (res.status === 429)
    throw new Error(`RAWG rate limited (retry-after=${res.headers.get('retry-after') ?? 'n/a'})`)
  if (res.status === 401 || res.status === 403) throw new Error(`RAWG auth ${res.status}`)
  if (res.status >= 500) throw new Error(`RAWG upstream ${res.status}`)
  if (res.status >= 400) return null

  return (await res.json()) as RawgGameDetail
}

export async function lookupGameByRawgId(
  rawgId: number,
  _opts: { signal?: AbortSignal } = {},
): Promise<GameLookupResult | null> {
  if (!Number.isInteger(rawgId) || rawgId <= 0) return null
  const data = await fetchRawgGame(rawgId)
  if (!data || !data.id || !data.name) return null

  const year =
    data.released && /^\d{4}-/.test(data.released) ? Number(data.released.slice(0, 4)) : undefined

  return {
    rawgId: data.id,
    title: data.name,
    originalTitle:
      data.name_original && data.name_original !== data.name ? data.name_original : undefined,
    year,
    coverUrl: data.background_image ?? undefined,
    description: data.description_raw?.trim() || undefined,
    developer: data.developers?.[0]?.name || undefined,
    externalRating:
      typeof data.rating === 'number' && data.rating > 0
        ? Math.round(data.rating * 2 * 10) / 10
        : undefined,
  }
}
