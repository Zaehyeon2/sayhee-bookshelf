import Link from 'next/link'
import Image from 'next/image'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import { highlightMatch } from '@/lib/highlight'
import type { MovieWithTags } from '@/lib/db/queries'

interface Props {
  movie: MovieWithTags
  snippet?: string
  query?: string
}

export function MovieCard({ movie, snippet, query }: Props) {
  return (
    <Link
      href={`/movies/${movie.slug}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <div className="flex gap-3">
        {movie.coverUrl && (
          <Image
            src={movie.coverUrl}
            alt=""
            width={80}
            height={120}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
              {movie.title}
            </h3>
            <GenreBadge genre={movie.genre} />
          </div>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)] line-clamp-1">
            {movie.director}
          </p>
          {snippet && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
              {query ? highlightMatch(snippet, query) : snippet}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-2">
            <RatingStars value={movie.rating} size="sm" />
            <div className="flex items-center gap-2">
              {movie.isPublic === 1 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-toss-blue)]"
                  title="모두의 영화관에 공개됨"
                >
                  🌐 공개
                </span>
              )}
              <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">
                {movie.watchedDate}
              </time>
            </div>
          </div>
          {movie.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {movie.tags.slice(0, 3).map((t) => (
                <li key={t} className="text-[12px] text-[var(--color-text-weak)]">
                  #{t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Link>
  )
}
