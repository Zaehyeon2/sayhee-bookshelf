import type { BookWithTags } from '@/lib/db/queries'
import { MediaCard } from './MediaCard'

interface Props {
  book: BookWithTags
  snippet?: string
  query?: string
}

export function BookCard({ book, snippet, query }: Props) {
  return (
    <MediaCard
      item={{
        slug: book.slug,
        title: book.title,
        person: book.author,
        genre: book.genre,
        rating: book.rating,
        date: book.readDate,
        isPublic: book.isPublic,
        coverUrl: book.coverUrl,
        tags: book.tags,
      }}
      basePath="/books"
      publicBadgeTitle="모두의 서재에 공개됨"
      snippet={snippet}
      query={query}
    />
  )
}
