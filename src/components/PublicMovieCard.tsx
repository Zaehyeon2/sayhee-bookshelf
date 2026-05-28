'use client'

// 'use client' 필요 이유: PublicReviewCard와 동일. Date.now() 기반 상대 시간은 클라이언트에서
// 평가해야 RSC payload 캐시로 "X분 전"이 freeze되는 문제를 피할 수 있다.
import Image from 'next/image'
import Link from 'next/link'
import { GenreBadge } from './GenreBadge'
import { RatingStars } from './RatingStars'
import type { PublicMovieCard as PublicMovieCardItem } from '@/lib/db/queries'

interface Props {
  item: PublicMovieCardItem
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}달 전`
  return `${Math.floor(months / 12)}년 전`
}

export function PublicMovieCard({ item }: Props) {
  return (
    <Link
      href={`/works?type=movie&q=${encodeURIComponent(item.title)}`}
      className="block rounded-[var(--radius-toss)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <article className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition">
        <div className="flex items-center justify-between gap-3">
          <RatingStars value={item.rating} size="sm" />
          <GenreBadge genre={item.genre} />
        </div>
        {item.oneLineReview && (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-strong)] line-clamp-3">
            {item.oneLineReview}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          {item.coverUrl && (
            <Image
              src={item.coverUrl}
              alt=""
              width={40}
              height={60}
              className="flex-shrink-0 rounded-sm object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold leading-snug text-[var(--color-text-strong)] line-clamp-2">
              {item.title}
            </h3>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)] line-clamp-1">
              {item.director}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[12px] text-[var(--color-text-weak)]">
          <span className="font-semibold text-[var(--color-text-muted)]">
            {item.authorDisplayName}
          </span>
          <time className="font-tabular tabular-nums">{formatRelative(item.publishedAt)}</time>
        </div>
      </article>
    </Link>
  )
}
