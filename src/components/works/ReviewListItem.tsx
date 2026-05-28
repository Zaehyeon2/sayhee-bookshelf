import { RatingScore } from '../RatingScore'

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
    <article className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition h-full flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <RatingScore value={item.rating} />
        {/* TODO: link to /u/<username> when that route exists */}
        <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
          {item.authorDisplayName}
        </span>
      </div>
      {item.oneLineReview && (
        <blockquote className="mt-3 border-l-4 border-[var(--color-toss-blue)] pl-3 py-1 flex-1">
          <span className="sr-only">{item.authorDisplayName}의 한줄평: </span>
          <p className="text-[14px] leading-relaxed text-[var(--color-text-strong)]">
            {item.oneLineReview}
          </p>
        </blockquote>
      )}
      <time
        dateTime={new Date(item.publishedAt).toISOString()}
        className="mt-3 block text-[11px] text-[var(--color-text-weak)] font-tabular tabular-nums"
      >
        {formatDate(item.publishedAt)}
      </time>
    </article>
  )
}
