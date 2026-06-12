import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'
import { BOOKS_DOMAIN } from '@/lib/domains/config'
import { createMediaQueries } from '@/lib/domains/queries'
import type { MediaListFilters, MediaUpdateInput } from '@/lib/domains/queries'
import type { books } from '../schema'
import type { BookWithTags, Db, RatingDistribution } from './shared'

type BookRow = typeof books.$inferSelect

const q = createMediaQueries<BookRow, string>(BOOKS_DOMAIN)

// tagId?: API/페이지에서 선조회한 tag id 주입 시 list/count의 중복 lookup 생략 (백로그 8)
export type ListBookFilters = MediaListFilters & { tagId?: number | null }

export type PublicBookCard = {
  id: number
  slug: string
  title: string
  author: string
  genre: string
  rating: number
  oneLineReview: string | null
  coverUrl: string | null
  isbn: string | null
  publishedAt: number
  authorDisplayName: string
}

export type BookSiteAggregate = { avg: number; cnt: number }

export type BookReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}

function toUpdateInput(input: UpdateBookInput): MediaUpdateInput<string> {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.author !== undefined && { person: input.author }),
    ...(input.genre !== undefined && { genre: input.genre }),
    ...(input.readDate !== undefined && { date: input.readDate }),
    ...(input.rating !== undefined && { rating: input.rating }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
    ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
    ...(input.isbn !== undefined && { externalId: input.isbn }),
    ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
    ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
  }
}

export async function createBook(
  db: Db,
  authorUserId: number,
  input: CreateBookInput,
): Promise<BookWithTags> {
  return q.create(db, authorUserId, {
    title: input.title,
    person: input.author,
    genre: input.genre,
    date: input.readDate,
    rating: input.rating,
    content: input.content ?? '',
    tags: input.tags ?? [],
    oneLineReview: input.oneLineReview ?? null,
    isPublic: input.isPublic ?? true,
    externalId: input.isbn ?? null,
    coverUrl: input.coverUrl ?? null,
    externalSource: input.externalSource ?? null,
  })
}

export async function updateBook(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateBookInput,
): Promise<BookWithTags | null> {
  return q.update(db, authorUserId, id, toUpdateInput(input))
}

export async function deleteBook(db: Db, authorUserId: number, id: number): Promise<boolean> {
  return q.remove(db, authorUserId, id)
}

export const getBookBySlug = q.getBySlug

export async function getBookById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<BookWithTags | null> {
  return q.getById(db, authorUserId, id)
}

export async function listBooks(
  db: Db,
  authorUserId: number,
  filters: ListBookFilters,
): Promise<BookWithTags[]> {
  return q.list(db, authorUserId, filters)
}

export async function searchBooks(
  db: Db,
  authorUserId: number,
  qStr: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<BookWithTags[]> {
  return q.search(db, authorUserId, qStr, opts)
}

export async function countSearchBooks(
  db: Db,
  authorUserId: number,
  qStr: string,
): Promise<number> {
  return q.countSearch(db, authorUserId, qStr)
}

export const listGenresWithCounts = q.listGenresWithCounts

export async function listRecentPublicBooks(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicBookCard[]> {
  const rows = await q.listRecentPublic(db, opts)
  return rows.map(({ person, externalId, ...r }) => ({ ...r, author: person, isbn: externalId }))
}

export const countPublicBooks = q.countPublic

export async function getPublicBookFallbackByIsbn(
  db: Db,
  isbn: string,
): Promise<{ title: string; author: string; coverUrl: string | null } | null> {
  const row = await q.getPublicFallbackByExternalId(db, isbn)
  return row === null ? null : { title: row.title, author: row.person, coverUrl: row.coverUrl }
}

export async function countBooks(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; tagId?: number | null } = {},
): Promise<number> {
  return q.countAll(db, authorUserId, filters)
}

// API/페이지에서 tag name → id 선조회용 (list/count에 tagId로 주입 — 백로그 8)
export const resolveBookTagId = q.resolveTagId

// GET 핸들러가 requireOwn row에 태그만 붙일 때 사용 (getById 재조회 회피)
export const listBookTags = q.tagsOf

export const countBooksByExternalIds = q.countByExternalIds
export const getBookAggregatesByIsbns = q.getAggregatesByExternalIds
export const listBookReviewsByIsbn = q.listReviewsByExternalId
export const countBookReviewsByIsbn = q.countReviewsByExternalId
export const getBookRatingDistributionByIsbn: (
  db: Db,
  isbn: string,
) => Promise<RatingDistribution> = q.getRatingDistributionByExternalId
