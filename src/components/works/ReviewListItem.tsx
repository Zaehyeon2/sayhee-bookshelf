import { RatingStars } from '../RatingStars'

interface Props {
  item: {
    rating: number
    oneLineReview: string | null
    publishedAt: number
    authorUsername: string
    authorDisplayName: string
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function ReviewListItem({ item }: Props) {
  return (
    <article className="py-4 border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center justify-between gap-3">
        <RatingStars value={item.rating} size="sm" />
        {/* TODO: link to /u/<username> when that route exists */}
        <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
          {item.authorDisplayName}
        </span>
      </div>
      {item.oneLineReview && (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-strong)]">
          {item.oneLineReview}
        </p>
      )}
      <time className="mt-2 block text-[11px] text-[var(--color-text-weak)] font-tabular tabular-nums">
        {formatDate(item.publishedAt)}
      </time>
    </article>
  )
}
