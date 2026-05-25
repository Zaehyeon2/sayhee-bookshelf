import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { BookWithTags } from '@/lib/db/queries'

export function BookCard({ book }: { book: BookWithTags }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      className="block rounded-lg border bg-white p-4 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-lg line-clamp-2">{book.title}</h3>
        <GenreBadge genre={book.genre} />
      </div>
      <p className="mt-1 text-sm text-neutral-600">{book.author}</p>
      <div className="mt-2 flex items-center justify-between">
        <RatingStars value={book.rating} size="sm" />
        <time className="text-xs text-neutral-500">{book.readDate}</time>
      </div>
      {book.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {book.tags.slice(0, 3).map((t) => (
            <li key={t} className="text-xs text-neutral-500">#{t}</li>
          ))}
        </ul>
      )}
    </Link>
  )
}
