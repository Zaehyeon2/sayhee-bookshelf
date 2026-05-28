import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  listRecentPublicBooks,
  listRecentPublicMovies,
  countPublicBooks,
  countPublicMovies,
} from '@/lib/db/queries'

// Public feed는 user-scope 없는 cross-user read — Next data cache로 wrap.
// 새 공개 글 등록·삭제 시 revalidate 60s 안에 반영. tags로 명시적 invalidate 가능.
// 호출자는 본 wrapper만 import. 직접 list/count 호출은 piecemeal cache 우회 위험.

const PUBLIC_BOOKS_TAG = 'public-books-feed'
const PUBLIC_MOVIES_TAG = 'public-movies-feed'

export const getPublicBooksFeed = unstable_cache(
  async (limit: number, offset: number) => listRecentPublicBooks(db, { limit, offset }),
  ['public-books-feed-list'],
  { revalidate: 60, tags: [PUBLIC_BOOKS_TAG] },
)

export const getPublicBooksFeedCount = unstable_cache(
  async () => countPublicBooks(db),
  ['public-books-feed-count'],
  { revalidate: 60, tags: [PUBLIC_BOOKS_TAG] },
)

export const getPublicMoviesFeed = unstable_cache(
  async (limit: number, offset: number) => listRecentPublicMovies(db, { limit, offset }),
  ['public-movies-feed-list'],
  { revalidate: 60, tags: [PUBLIC_MOVIES_TAG] },
)

export const getPublicMoviesFeedCount = unstable_cache(
  async () => countPublicMovies(db),
  ['public-movies-feed-count'],
  { revalidate: 60, tags: [PUBLIC_MOVIES_TAG] },
)

export const PUBLIC_FEED_TAGS = {
  books: PUBLIC_BOOKS_TAG,
  movies: PUBLIC_MOVIES_TAG,
}
