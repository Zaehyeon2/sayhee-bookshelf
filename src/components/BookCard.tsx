import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { BookWithTags } from '@/lib/db/queries'

interface Props {
  book: BookWithTags
  snippet?: string
}

export function BookCard({ book, snippet }: Props) {
  return (
    <Link
      href={`/books/${book.slug}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
          {book.title}
        </h3>
        <GenreBadge genre={book.genre} />
      </div>
      <p className="mt-1 text-[14px] text-[var(--color-text-muted)] line-clamp-1">{book.author}</p>
      {snippet && (
        <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
          {snippet}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <RatingStars value={book.rating} size="sm" />
        <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">{book.readDate}</time>
      </div>
      {book.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {book.tags.slice(0, 3).map((t) => (
            <li key={t} className="text-[12px] text-[var(--color-text-weak)]">
              #{t}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
