export interface ExternalSearchItem<TId extends string | number> {
  externalId: TId
  title: string
  subtitle?: string
  /** Polymorphic author label: book author(s) for books, director for movies. */
  byline: string
  year?: number
  genre?: string
  coverUrl?: string
}

export interface ExternalSearchResponse<TId extends string | number> {
  items: ExternalSearchItem<TId>[]
  source: 'naver' | 'tmdb'
}

export type BookSearchItem = ExternalSearchItem<string>
export type MovieSearchItem = ExternalSearchItem<number>
