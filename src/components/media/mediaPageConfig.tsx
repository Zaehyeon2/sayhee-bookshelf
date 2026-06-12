import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import type { z } from 'zod'
import type { Db } from '@/lib/db/queries/shared'
import type { BookWithTags, GameWithTags, MovieWithTags } from '@/lib/db/queries'
import {
  countBooks,
  countGames,
  countMovies,
  countSearchBooks,
  countSearchGames,
  countSearchMovies,
  listBooks,
  listGames,
  listMovies,
  resolveBookTagId,
  resolveGameTagId,
  resolveMovieTagId,
  searchBooks,
  searchGames,
  searchMovies,
} from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { MovieCard } from '@/components/MovieCard'
import { GameCard } from '@/components/GameCard'
import { BOOK_GENRES, GAME_GENRES, MOVIE_GENRES } from '@/lib/genres'
import {
  ListBooksQuerySchema,
  ListGamesQuerySchema,
  ListMoviesQuerySchema,
} from '@/lib/validations'
import { formatRatingCompact } from '@/lib/rating'

/** 목록/상세 페이지가 도메인별로 달라지는 모든 값 — 원문 그대로 보존 */
export interface MediaPageConfig<Row extends { id: number; slug: string }> {
  basePath: string
  /** SearchBox placeholder — books는 default(`제목·작가·본문 검색`) */
  searchPlaceholder?: string
  genres: readonly string[]
  /** 필터 없는 전체 목록 타이틀 (예: `전체 게임`) */
  allTitle: string
  /** 개수 단위 (책=`권`, 영화/게임=`편`) */
  countUnit: string
  /** 새 기록 버튼 라벨 (예: `새 게임`) */
  newLabel: string
  /** list/stats 경로 prefix는 basePath로 파생, new 라벨만 별도 */
  emptySearch: { title: string; description: (q: string) => string }
  emptyList: { title: string; description: string; actionLabel: string }
  listQuerySchema: z.ZodType<
    {
      genre?: string
      tag?: string
      year?: number
      sort?: 'date' | 'rating'
      q?: string
      page?: number
    },
    unknown
  >
  /** 카드 렌더 — 도메인별 named-prop 카드를 정규화 props로 래핑. key는 그리드 직계 자식에 부착 */
  renderCard: (args: { key: number; item: Row; snippet?: string; query?: string }) => ReactNode
  /** 검색 스니펫 매칭용 — 제목 외 인물 필드 (author/director/developer) */
  personOf: (row: Row) => string
  /** 검색 스니펫 발췌 대상 본문 */
  contentOf: (row: Row) => string
  /** 서버 쿼리 묶음 — tagId 선조회 주입 지원 (백로그 8) */
  queries: {
    list: (
      db: Db,
      userId: number,
      filters: {
        genre?: string
        tag?: string
        year?: number
        sort?: 'date' | 'rating'
        limit?: number
        offset?: number
        tagId?: number | null
      },
    ) => Promise<Row[]>
    count: (
      db: Db,
      userId: number,
      filters: { genre?: string; tag?: string; year?: number; tagId?: number | null },
    ) => Promise<number>
    search: (
      db: Db,
      userId: number,
      q: string,
      opts: { limit?: number; offset?: number },
    ) => Promise<Row[]>
    countSearch: (db: Db, userId: number, q: string) => Promise<number>
    resolveTagId: (db: Db, tagName: string) => Promise<number | null>
  }
  /** 상세 페이지 가변값 */
  detail: {
    personOf: (row: Row) => string
    dateOf: (row: Row) => string
    /** 커버 이미지 alt 접미사 (표지/포스터/커버) */
    coverAltSuffix: string
    /** 공개 배지 title (모두의 서재에 공개됨 등) */
    publicBadgeTitle: string
  }
  /** generateMetadata 도메인 문구 — 기존 문자열 형식 원문 유지 */
  notFoundTitle: string
  metaOf: (row: Row) => { title: string; description: string }
}

export const BOOKS_PAGE_CONFIG: MediaPageConfig<BookWithTags> = {
  basePath: '/books',
  // books는 SearchBox default placeholder 사용 (`제목·작가·본문 검색`) — undefined로 둠
  searchPlaceholder: undefined,
  genres: BOOK_GENRES,
  allTitle: '전체 책',
  countUnit: '권',
  newLabel: '새 책',
  emptySearch: {
    title: '찾는 책이 없어요',
    description: (q) => `'${q}' 와 일치하는 결과가 없습니다`,
  },
  emptyList: {
    title: '아직 책이 없어요',
    description: '첫 독후감을 남겨보세요',
    actionLabel: '새 독후감',
  },
  listQuerySchema: ListBooksQuerySchema,
  renderCard: ({ key, item, snippet, query }) => (
    <BookCard key={key} book={item} snippet={snippet} query={query} />
  ),
  personOf: (b) => b.author,
  contentOf: (b) => b.content,
  queries: {
    list: listBooks,
    count: countBooks,
    search: searchBooks,
    countSearch: countSearchBooks,
    resolveTagId: resolveBookTagId,
  },
  detail: {
    personOf: (b) => b.author,
    dateOf: (b) => b.readDate,
    coverAltSuffix: '표지',
    publicBadgeTitle: '모두의 서재에 공개됨',
  },
  notFoundTitle: '책을 찾을 수 없어요',
  metaOf: (b) => ({
    title: `${b.title} · ${b.author}`,
    description: `${b.author}의 ${b.genre} — 별점 ${formatRatingCompact(b.rating)}/5`,
  }),
}

export const MOVIES_PAGE_CONFIG: MediaPageConfig<MovieWithTags> = {
  basePath: '/movies',
  searchPlaceholder: '제목·감독·본문 검색',
  genres: MOVIE_GENRES,
  allTitle: '전체 영화',
  countUnit: '편',
  newLabel: '새 영화',
  emptySearch: {
    title: '찾는 영화가 없어요',
    description: (q) => `'${q}' 와 일치하는 결과가 없습니다`,
  },
  emptyList: {
    title: '아직 영화가 없어요',
    description: '첫 감상을 남겨보세요',
    actionLabel: '새 감상',
  },
  listQuerySchema: ListMoviesQuerySchema,
  renderCard: ({ key, item, snippet, query }) => (
    <MovieCard key={key} movie={item} snippet={snippet} query={query} />
  ),
  personOf: (m) => m.director,
  contentOf: (m) => m.content,
  queries: {
    list: listMovies,
    count: countMovies,
    search: searchMovies,
    countSearch: countSearchMovies,
    resolveTagId: resolveMovieTagId,
  },
  detail: {
    personOf: (m) => m.director,
    dateOf: (m) => m.watchedDate,
    coverAltSuffix: '포스터',
    publicBadgeTitle: '모두의 영화관에 공개됨',
  },
  notFoundTitle: '영화를 찾을 수 없어요',
  metaOf: (m) => ({
    title: `${m.title} · ${m.director}`,
    description: `${m.director} 감독 · ${m.genre} — 별점 ${formatRatingCompact(m.rating)}/5`,
  }),
}

export const GAMES_PAGE_CONFIG: MediaPageConfig<GameWithTags> = {
  basePath: '/games',
  searchPlaceholder: '제목·개발사·본문 검색',
  genres: GAME_GENRES,
  allTitle: '전체 게임',
  countUnit: '편',
  newLabel: '새 게임',
  emptySearch: {
    title: '찾는 게임이 없어요',
    description: (q) => `'${q}' 와 일치하는 결과가 없습니다`,
  },
  emptyList: {
    title: '아직 게임이 없어요',
    description: '첫 플레이 기록을 남겨보세요',
    actionLabel: '새 기록',
  },
  listQuerySchema: ListGamesQuerySchema,
  renderCard: ({ key, item, snippet, query }) => (
    <GameCard key={key} game={item} snippet={snippet} query={query} />
  ),
  personOf: (g) => g.developer,
  contentOf: (g) => g.content,
  queries: {
    list: listGames,
    count: countGames,
    search: searchGames,
    countSearch: countSearchGames,
    resolveTagId: resolveGameTagId,
  },
  detail: {
    personOf: (g) => g.developer,
    dateOf: (g) => g.playedDate,
    coverAltSuffix: '커버',
    publicBadgeTitle: '모두의 게임관에 공개됨',
  },
  notFoundTitle: '게임을 찾을 수 없어요',
  metaOf: (g) => ({
    title: `${g.title} · ${g.developer}`,
    description: `${g.developer} 개발 · ${g.genre} — 별점 ${formatRatingCompact(g.rating)}/5`,
  }),
}

/** generateMetadata 공유 헬퍼 — openGraph/twitter shape는 도메인 무관 동형 */
export function buildMediaMetadata(meta: { title: string; description: string }): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: 'article',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary',
      title: meta.title,
      description: meta.description,
    },
  }
}
