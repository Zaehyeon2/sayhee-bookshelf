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
  source: 'naver' | 'tmdb'
}

export type BookSearchItem = ExternalSearchItem<string>
export type MovieSearchItem = ExternalSearchItem<number>

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
