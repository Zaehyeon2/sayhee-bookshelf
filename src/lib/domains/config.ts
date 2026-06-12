import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { books, bookTags, games, gameTags, movies, movieTags } from '@/lib/db/schema'
import { BOOK_GENRES, GAME_GENRES, MOVIE_GENRES } from '@/lib/genres'
import {
  isGameSlugUniqueViolation,
  isMovieSlugUniqueViolation,
  isSlugUniqueViolation,
} from '@/lib/db/queries/shared'

// 목록 페이지네이션 페이지 크기 단일 소스 — API 라우트·목록 페이지가 공유 (불일치 시 totalPages 어긋남)
export const MEDIA_PAGE_SIZE = 24

// 도메인 타입 단일 소스 — FeedQuerySchema·WorksSearchQuerySchema가 이 배열을 참조 (백로그 2번)
export const DOMAIN_TYPES = ['book', 'movie', 'game'] as const
export type DomainType = (typeof DOMAIN_TYPES)[number]

export type MediaTable = typeof books | typeof movies | typeof games
export type MediaJunction = typeof bookTags | typeof movieTags | typeof gameTags

/**
 * 미디어 도메인(책/영화/게임) 공통 구조의 단일 정의.
 * - cols: drizzle 조건절·정렬에 쓰는 구체 컬럼 ref — 동적 테이블 제네릭의 타입 붕괴 우회.
 * - fields: INSERT/UPDATE 객체 구성에 쓰는 컬럼 프로퍼티 이름 문자열.
 * - person/date/externalId는 도메인별 이름(author/director/developer 등)의 정규화 축.
 */
export interface MediaDomainConfig {
  key: 'books' | 'movies' | 'games'
  type: DomainType
  table: MediaTable
  junction: MediaJunction
  /** junction에서 본문 row FK (bookTags.bookId 등) */
  junctionFk: SQLiteColumn
  /** junction FK의 TS 프로퍼티 이름 — 동적 INSERT values 구성용 */
  junctionFkField: 'bookId' | 'movieId' | 'gameId'
  cols: {
    id: SQLiteColumn
    authorUserId: SQLiteColumn
    slug: SQLiteColumn
    title: SQLiteColumn
    person: SQLiteColumn
    genre: SQLiteColumn
    date: SQLiteColumn
    rating: SQLiteColumn
    content: SQLiteColumn
    oneLineReview: SQLiteColumn
    isPublic: SQLiteColumn
    publishedAt: SQLiteColumn
    coverUrl: SQLiteColumn
    externalId: SQLiteColumn
  }
  fields: {
    person: 'author' | 'director' | 'developer'
    date: 'readDate' | 'watchedDate' | 'playedDate'
    externalId: 'isbn' | 'tmdbId' | 'rawgId'
  }
  genres: readonly string[]
  isSlugViolation: (e: unknown) => boolean
}

export const BOOKS_DOMAIN: MediaDomainConfig = {
  key: 'books',
  type: 'book',
  table: books,
  junction: bookTags,
  junctionFk: bookTags.bookId,
  junctionFkField: 'bookId',
  cols: {
    id: books.id,
    authorUserId: books.authorUserId,
    slug: books.slug,
    title: books.title,
    person: books.author,
    genre: books.genre,
    date: books.readDate,
    rating: books.rating,
    content: books.content,
    oneLineReview: books.oneLineReview,
    isPublic: books.isPublic,
    publishedAt: books.publishedAt,
    coverUrl: books.coverUrl,
    externalId: books.isbn,
  },
  fields: {
    person: 'author',
    date: 'readDate',
    externalId: 'isbn',
  },
  genres: BOOK_GENRES,
  isSlugViolation: isSlugUniqueViolation,
}

export const MOVIES_DOMAIN: MediaDomainConfig = {
  key: 'movies',
  type: 'movie',
  table: movies,
  junction: movieTags,
  junctionFk: movieTags.movieId,
  junctionFkField: 'movieId',
  cols: {
    id: movies.id,
    authorUserId: movies.authorUserId,
    slug: movies.slug,
    title: movies.title,
    person: movies.director,
    genre: movies.genre,
    date: movies.watchedDate,
    rating: movies.rating,
    content: movies.content,
    oneLineReview: movies.oneLineReview,
    isPublic: movies.isPublic,
    publishedAt: movies.publishedAt,
    coverUrl: movies.coverUrl,
    externalId: movies.tmdbId,
  },
  fields: {
    person: 'director',
    date: 'watchedDate',
    externalId: 'tmdbId',
  },
  genres: MOVIE_GENRES,
  isSlugViolation: isMovieSlugUniqueViolation,
}

export const GAMES_DOMAIN: MediaDomainConfig = {
  key: 'games',
  type: 'game',
  table: games,
  junction: gameTags,
  junctionFk: gameTags.gameId,
  junctionFkField: 'gameId',
  cols: {
    id: games.id,
    authorUserId: games.authorUserId,
    slug: games.slug,
    title: games.title,
    person: games.developer,
    genre: games.genre,
    date: games.playedDate,
    rating: games.rating,
    content: games.content,
    oneLineReview: games.oneLineReview,
    isPublic: games.isPublic,
    publishedAt: games.publishedAt,
    coverUrl: games.coverUrl,
    externalId: games.rawgId,
  },
  fields: {
    person: 'developer',
    date: 'playedDate',
    externalId: 'rawgId',
  },
  genres: GAME_GENRES,
  isSlugViolation: isGameSlugUniqueViolation,
}
