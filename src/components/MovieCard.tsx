import type { MovieWithTags } from '@/lib/db/queries'
import { MediaCard } from './MediaCard'

interface Props {
  movie: MovieWithTags
  snippet?: string
  query?: string
}

export function MovieCard({ movie, snippet, query }: Props) {
  return (
    <MediaCard
      item={{
        slug: movie.slug,
        title: movie.title,
        person: movie.director,
        genre: movie.genre,
        rating: movie.rating,
        date: movie.watchedDate,
        isPublic: movie.isPublic,
        coverUrl: movie.coverUrl,
        tags: movie.tags,
      }}
      basePath="/movies"
      publicBadgeTitle="모두의 영화관에 공개됨"
      snippet={snippet}
      query={query}
    />
  )
}
