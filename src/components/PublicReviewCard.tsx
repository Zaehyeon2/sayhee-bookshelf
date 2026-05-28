import Image from 'next/image'
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { PublicBookCard } from '@/lib/db/queries'
import { MAX_SEARCH_Q } from '@/lib/validations'

interface Props {
  item: PublicBookCard
}

export function PublicReviewCard({ item }: Props) {
  return (
    <Link
      href={
        item.isbn
          ? `/works/book/${item.isbn}`
          : `/works?type=book&q=${encodeURIComponent(item.title.slice(0, MAX_SEARCH_Q))}`
      }
      className="block rounded-[var(--radius-toss)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <article className="h-full flex flex-col bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] rounded-[var(--radius-toss)] transition">
        <div className="flex gap-3">
          {item.coverUrl && (
            <Image
              src={item.coverUrl}
              alt=""
              width={80}
              height={120}
              className="flex-shrink-0 rounded-sm object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
                {item.title}
              </h3>
              <GenreBadge genre={item.genre} />
            </div>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
              {item.author}
            </p>
          </div>
        </div>
        {item.oneLineReview && (
          <blockquote className="mt-4 border-l-4 border-[var(--color-toss-blue)] pl-3 py-1">
            <span className="sr-only">{item.authorDisplayName}의 한줄평: </span>
            <p className="text-[15px] leading-relaxed font-medium text-[var(--color-text-strong)] line-clamp-3">
              {item.oneLineReview}
            </p>
          </blockquote>
        )}
        <div className="mt-auto pt-4">
          <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3 text-[12px] text-[var(--color-text-weak)]">
            <span className="font-semibold text-[var(--color-text-muted)] truncate">
              {item.authorDisplayName}
            </span>
            <RatingStars value={item.rating} size="sm" />
          </div>
        </div>
      </article>
    </Link>
  )
}
