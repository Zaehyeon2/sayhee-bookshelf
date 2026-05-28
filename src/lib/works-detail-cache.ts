import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'

// works/[isbn|tmdbId] 상세 페이지는 cross-user read — DB query 결과 cache로
// Turso round-trip 제거. 새 한줄평 작성·수정 시 endpoint에서 revalidateTag로 무효화.

export const WORKS_BOOK_TAG = 'works-book-detail'
export const WORKS_MOVIE_TAG = 'works-movie-detail'

const REVALIDATE = 30

export const getBookReviewsCached = unstable_cache(
  async (isbn: string, limit: number, offset: number) =>
    listBookReviewsByIsbn(db, isbn, { limit, offset }),
  ['works-book-reviews'],
  { revalidate: REVALIDATE, tags: [WORKS_BOOK_TAG] },
)

export const getBookReviewsCountCached = unstable_cache(
  async (isbn: string) => countBookReviewsByIsbn(db, isbn),
  ['works-book-reviews-count'],
  { revalidate: REVALIDATE, tags: [WORKS_BOOK_TAG] },
)

export const getBookDistributionCached = unstable_cache(
  async (isbn: string) => getBookRatingDistributionByIsbn(db, isbn),
  ['works-book-distribution'],
  { revalidate: REVALIDATE, tags: [WORKS_BOOK_TAG] },
)

export const getMovieReviewsCached = unstable_cache(
  async (tmdbId: number, limit: number, offset: number) =>
    listMovieReviewsByTmdbId(db, tmdbId, { limit, offset }),
  ['works-movie-reviews'],
  { revalidate: REVALIDATE, tags: [WORKS_MOVIE_TAG] },
)

export const getMovieReviewsCountCached = unstable_cache(
  async (tmdbId: number) => countMovieReviewsByTmdbId(db, tmdbId),
  ['works-movie-reviews-count'],
  { revalidate: REVALIDATE, tags: [WORKS_MOVIE_TAG] },
)

export const getMovieDistributionCached = unstable_cache(
  async (tmdbId: number) => getMovieRatingDistributionByTmdbId(db, tmdbId),
  ['works-movie-distribution'],
  { revalidate: REVALIDATE, tags: [WORKS_MOVIE_TAG] },
)
