import type { CreateGameInput, UpdateGameInput } from '@/lib/validations'
import { GAMES_DOMAIN } from '@/lib/domains/config'
import { createMediaQueries } from '@/lib/domains/queries'
import type { MediaListFilters, MediaUpdateInput } from '@/lib/domains/queries'
import type { games } from '../schema'
import type { Db, GameWithTags, RatingDistribution } from './shared'

type GameRow = typeof games.$inferSelect

const q = createMediaQueries<GameRow, number>(GAMES_DOMAIN)

// tagId?: API/페이지에서 선조회한 tag id 주입 시 list/count의 중복 lookup 생략 (백로그 8)
export type ListGameFilters = MediaListFilters & { tagId?: number | null }

export type PublicGameCard = {
  id: number
  slug: string
  title: string
  developer: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  rawgId: number | null
  publishedAt: number
  authorDisplayName: string
}

export type GameSiteAggregate = { avg: number; cnt: number }

export type GameReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

function toUpdateInput(input: UpdateGameInput): MediaUpdateInput<number> {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.developer !== undefined && { person: input.developer }),
    ...(input.genre !== undefined && { genre: input.genre }),
    ...(input.playedDate !== undefined && { date: input.playedDate }),
    ...(input.rating !== undefined && { rating: input.rating }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
    ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
    ...(input.rawgId !== undefined && { externalId: input.rawgId }),
    ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
    ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
  }
}

export async function createGame(
  db: Db,
  authorUserId: number,
  input: CreateGameInput,
): Promise<GameWithTags> {
  return q.create(db, authorUserId, {
    title: input.title,
    person: input.developer,
    genre: input.genre,
    date: input.playedDate,
    rating: input.rating,
    content: input.content ?? '',
    tags: input.tags ?? [],
    oneLineReview: input.oneLineReview ?? null,
    isPublic: input.isPublic ?? true,
    externalId: input.rawgId ?? null,
    coverUrl: input.coverUrl ?? null,
    externalSource: input.externalSource ?? null,
  })
}

export async function updateGame(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateGameInput,
): Promise<GameWithTags | null> {
  return q.update(db, authorUserId, id, toUpdateInput(input))
}

export async function deleteGame(db: Db, authorUserId: number, id: number): Promise<boolean> {
  return q.remove(db, authorUserId, id)
}

export const getGameBySlug = q.getBySlug

export async function getGameById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<GameWithTags | null> {
  return q.getById(db, authorUserId, id)
}

export async function listGames(
  db: Db,
  authorUserId: number,
  filters: ListGameFilters,
): Promise<GameWithTags[]> {
  return q.list(db, authorUserId, filters)
}

export async function searchGames(
  db: Db,
  authorUserId: number,
  qStr: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<GameWithTags[]> {
  return q.search(db, authorUserId, qStr, opts)
}

export async function countSearchGames(
  db: Db,
  authorUserId: number,
  qStr: string,
): Promise<number> {
  return q.countSearch(db, authorUserId, qStr)
}

export const listGameGenresWithCounts = q.listGenresWithCounts

export async function listRecentPublicGames(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicGameCard[]> {
  const rows = await q.listRecentPublic(db, opts)
  return rows.map(({ person, externalId, ...r }) => ({
    ...r,
    developer: person,
    rawgId: externalId,
  }))
}

export const countPublicGames = q.countPublic

export async function getPublicGameFallbackByRawgId(
  db: Db,
  rawgId: number,
): Promise<{ title: string; developer: string; coverUrl: string | null } | null> {
  const row = await q.getPublicFallbackByExternalId(db, rawgId)
  return row === null ? null : { title: row.title, developer: row.person, coverUrl: row.coverUrl }
}

export async function countGames(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; tagId?: number | null } = {},
): Promise<number> {
  return q.countAll(db, authorUserId, filters)
}

// API/페이지에서 tag name → id 선조회용 (list/count에 tagId로 주입 — 백로그 8)
export const resolveGameTagId = q.resolveTagId

// GET 핸들러가 requireOwn row에 태그만 붙일 때 사용 (getById 재조회 회피)
export const listGameTags = q.tagsOf

export const countGamesByExternalIds = q.countByExternalIds
export const getGameAggregatesByRawgIds = q.getAggregatesByExternalIds
export const listGameReviewsByRawgId = q.listReviewsByExternalId
export const countGameReviewsByRawgId = q.countReviewsByExternalId
export const getGameRatingDistributionByRawgId: (
  db: Db,
  rawgId: number,
) => Promise<RatingDistribution> = q.getRatingDistributionByExternalId
