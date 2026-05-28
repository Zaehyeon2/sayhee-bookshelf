import { cacheLife, cacheTag } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  listRecentPublicBooks,
  listRecentPublicMovies,
  countPublicBooks,
  countPublicMovies,
} from '@/lib/db/queries'

// Public feed는 user-scope 없는 cross-user read — Next 16 'use cache: remote' directive로
// Vercel Runtime Cache에 저장. revalidateTag로 invalidate.

const PUBLIC_BOOKS_TAG = 'public-books-feed'
const PUBLIC_MOVIES_TAG = 'public-movies-feed'

export async function getPublicBooksFeed(limit: number, offset: number) {
  'use cache: remote'
  cacheTag(PUBLIC_BOOKS_TAG)
  cacheLife('minutes')
  return listRecentPublicBooks(db, { limit, offset })
}

export async function getPublicBooksFeedCount() {
  'use cache: remote'
  cacheTag(PUBLIC_BOOKS_TAG)
  cacheLife('minutes')
  return countPublicBooks(db)
}

export async function getPublicMoviesFeed(limit: number, offset: number) {
  'use cache: remote'
  cacheTag(PUBLIC_MOVIES_TAG)
  cacheLife('minutes')
  return listRecentPublicMovies(db, { limit, offset })
}

export async function getPublicMoviesFeedCount() {
  'use cache: remote'
  cacheTag(PUBLIC_MOVIES_TAG)
  cacheLife('minutes')
  return countPublicMovies(db)
}

export const PUBLIC_FEED_TAGS = {
  books: PUBLIC_BOOKS_TAG,
  movies: PUBLIC_MOVIES_TAG,
}
