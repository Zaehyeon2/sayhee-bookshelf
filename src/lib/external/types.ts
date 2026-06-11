export interface ExternalSearchItem<TId extends string | number> {
  externalId: TId
  title: string
  subtitle?: string
  /** Polymorphic author label: book author(s) for books, director for movies. */
  byline: string
  year?: number
  genre?: string
  coverUrl?: string
  /** Upstream rating (0-10). TMDB vote_average for movies; Naver Books does not expose. */
  externalRating?: number
}

export interface ExternalSearchResponse<TId extends string | number> {
  items: ExternalSearchItem<TId>[]
  source: 'naver' | 'tmdb' | 'rawg'
}

export type BookSearchItem = ExternalSearchItem<string>
export type MovieSearchItem = ExternalSearchItem<number>
export type GameSearchItem = ExternalSearchItem<number>

export interface BookLookupResult {
  isbn: string
  title: string
  author: string
  publisher: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
}

export interface MovieLookupResult {
  tmdbId: number
  title: string
  originalTitle: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
  externalRating: number | undefined // TMDB vote_average (0–10)
}

export interface GameLookupResult {
  rawgId: number
  title: string
  originalTitle: string | undefined
  year: number | undefined
  coverUrl: string | undefined
  description: string | undefined
  developer: string | undefined // RAWG 상세 응답의 developers[0].name
  externalRating: number | undefined // RAWG rating(0-5)을 ×2 한 0-10 스케일
}
