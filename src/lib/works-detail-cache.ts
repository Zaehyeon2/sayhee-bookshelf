import { cacheLife, cacheTag } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'

// works/[isbn|tmdbId] 상세 페이지의 cross-user DB read — Vercel Runtime Cache로
// Turso round-trip 제거. 새 한줄평 작성·수정 시 endpoint에서 revalidateTag.

export const WORKS_BOOK_TAG = 'works-book-detail'
export const WORKS_MOVIE_TAG = 'works-movie-detail'

export async function getBookReviewsCached(isbn: string, limit: number, offset: number) {
  'use cache: remote'
  cacheTag(WORKS_BOOK_TAG)
  cacheLife('minutes')
  return listBookReviewsByIsbn(db, isbn, { limit, offset })
}

export async function getBookReviewsCountCached(isbn: string) {
  'use cache: remote'
  cacheTag(WORKS_BOOK_TAG)
  cacheLife('minutes')
  return countBookReviewsByIsbn(db, isbn)
}

export async function getBookDistributionCached(isbn: string) {
  'use cache: remote'
  cacheTag(WORKS_BOOK_TAG)
  cacheLife('minutes')
  return getBookRatingDistributionByIsbn(db, isbn)
}

export async function getMovieReviewsCached(tmdbId: number, limit: number, offset: number) {
  'use cache: remote'
  cacheTag(WORKS_MOVIE_TAG)
  cacheLife('minutes')
  return listMovieReviewsByTmdbId(db, tmdbId, { limit, offset })
}

export async function getMovieReviewsCountCached(tmdbId: number) {
  'use cache: remote'
  cacheTag(WORKS_MOVIE_TAG)
  cacheLife('minutes')
  return countMovieReviewsByTmdbId(db, tmdbId)
}

export async function getMovieDistributionCached(tmdbId: number) {
  'use cache: remote'
  cacheTag(WORKS_MOVIE_TAG)
  cacheLife('minutes')
  return getMovieRatingDistributionByTmdbId(db, tmdbId)
}
