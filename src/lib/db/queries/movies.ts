import type { CreateMovieInput, UpdateMovieInput } from '@/lib/validations'
import { MOVIES_DOMAIN } from '@/lib/domains/config'
import { createMediaQueries } from '@/lib/domains/queries'
import type { MediaListFilters, MediaUpdateInput } from '@/lib/domains/queries'
import type { movies } from '../schema'
import type { Db, MovieWithTags, RatingDistribution } from './shared'

type MovieRow = typeof movies.$inferSelect

const q = createMediaQueries<MovieRow, number>(MOVIES_DOMAIN)

// tagId?: API/페이지에서 선조회한 tag id 주입 시 list/count의 중복 lookup 생략 (백로그 8)
export type ListMovieFilters = MediaListFilters & { tagId?: number | null }

export type PublicMovieCard = {
  id: number
  slug: string
  title: string
  director: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  tmdbId: number | null
  publishedAt: number
  authorDisplayName: string
}

export type MovieSiteAggregate = { avg: number; cnt: number }

export type MovieReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

function toUpdateInput(input: UpdateMovieInput): MediaUpdateInput<number> {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.director !== undefined && { person: input.director }),
    ...(input.genre !== undefined && { genre: input.genre }),
    ...(input.watchedDate !== undefined && { date: input.watchedDate }),
    ...(input.rating !== undefined && { rating: input.rating }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
    ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
    ...(input.tmdbId !== undefined && { externalId: input.tmdbId }),
    ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
    ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
  }
}

export async function createMovie(
  db: Db,
  authorUserId: number,
  input: CreateMovieInput,
): Promise<MovieWithTags> {
  return q.create(db, authorUserId, {
    title: input.title,
    person: input.director,
    genre: input.genre,
    date: input.watchedDate,
    rating: input.rating,
    content: input.content ?? '',
    tags: input.tags ?? [],
    oneLineReview: input.oneLineReview ?? null,
    isPublic: input.isPublic ?? true,
    externalId: input.tmdbId ?? null,
    coverUrl: input.coverUrl ?? null,
    externalSource: input.externalSource ?? null,
  })
}

export async function updateMovie(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateMovieInput,
): Promise<MovieWithTags | null> {
  return q.update(db, authorUserId, id, toUpdateInput(input))
}

export async function deleteMovie(db: Db, authorUserId: number, id: number): Promise<boolean> {
  return q.remove(db, authorUserId, id)
}

export const getMovieBySlug = q.getBySlug

export async function getMovieById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<MovieWithTags | null> {
  return q.getById(db, authorUserId, id)
}

export async function listMovies(
  db: Db,
  authorUserId: number,
  filters: ListMovieFilters,
): Promise<MovieWithTags[]> {
  return q.list(db, authorUserId, filters)
}

export async function searchMovies(
  db: Db,
  authorUserId: number,
  qStr: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<MovieWithTags[]> {
  return q.search(db, authorUserId, qStr, opts)
}

export async function countSearchMovies(
  db: Db,
  authorUserId: number,
  qStr: string,
): Promise<number> {
  return q.countSearch(db, authorUserId, qStr)
}

export const listMovieGenresWithCounts = q.listGenresWithCounts

export async function listRecentPublicMovies(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicMovieCard[]> {
  const rows = await q.listRecentPublic(db, opts)
  return rows.map(({ person, externalId, ...r }) => ({
    ...r,
    director: person,
    tmdbId: externalId,
  }))
}

export const countPublicMovies = q.countPublic

export async function getPublicMovieFallbackByTmdbId(
  db: Db,
  tmdbId: number,
): Promise<{ title: string; director: string; coverUrl: string | null } | null> {
  const row = await q.getPublicFallbackByExternalId(db, tmdbId)
  return row === null ? null : { title: row.title, director: row.person, coverUrl: row.coverUrl }
}

export async function countMovies(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; tagId?: number | null } = {},
): Promise<number> {
  return q.countAll(db, authorUserId, filters)
}

// API/페이지에서 tag name → id 선조회용 (list/count에 tagId로 주입 — 백로그 8)
export const resolveMovieTagId = q.resolveTagId

export const countMoviesByExternalIds = q.countByExternalIds
export const getMovieAggregatesByTmdbIds = q.getAggregatesByExternalIds
export const listMovieReviewsByTmdbId = q.listReviewsByExternalId
export const countMovieReviewsByTmdbId = q.countReviewsByExternalId
export const getMovieRatingDistributionByTmdbId: (
  db: Db,
  tmdbId: number,
) => Promise<RatingDistribution> = q.getRatingDistributionByExternalId
