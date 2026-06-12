import Link from 'next/link'
import Image from 'next/image'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'

interface Row {
  id: number
  title: string
  genre: string
  rating: number
  content: string
  oneLineReview: string | null
  coverUrl: string | null
  isPublic: number
  tags: string[]
}

export function MediaDetailArticle<R extends Row>({
  item,
  basePath,
  person,
  date,
  coverAltSuffix,
  publicBadgeTitle,
}: {
  item: R
  /** 도메인 경로 prefix — 수정 링크·태그 링크에 사용 (예: /games) */
  basePath: string
  /** 인물 라인 (author/director/developer) */
  person: string
  /** 날짜 (readDate/watchedDate/playedDate) */
  date: string
  /** 커버 alt 접미사 (표지/포스터/커버) */
  coverAltSuffix: string
  /** 공개 배지 title (모두의 서재에 공개됨 등) */
  publicBadgeTitle: string
}) {
  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <GenreBadge genre={item.genre} />
            <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">{date}</time>
            {item.isPublic === 1 && (
              <span
                className="inline-flex items-center text-[12px] font-semibold text-[var(--color-toss-blue)]"
                title={publicBadgeTitle}
              >
                🌐 공개
              </span>
            )}
          </div>
          <Link
            href={`${basePath}/edit/${item.id}`}
            className="shrink-0 inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            수정
          </Link>
        </div>
        <div className="mt-3 flex gap-5 items-start">
          {item.coverUrl && (
            <Image
              src={item.coverUrl}
              alt={`${item.title} ${coverAltSuffix}`}
              width={150}
              height={220}
              className="flex-shrink-0 rounded-[var(--radius-toss-sm)] shadow-[var(--shadow-toss)] object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
              {item.title}
            </h1>
            <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">{person}</p>
            <div className="mt-4">
              <RatingStars value={item.rating} size="lg" />
            </div>
          </div>
        </div>
        {item.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`${basePath}?tag=${encodeURIComponent(t)}`}
                  className="inline-flex items-center rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-toss-blue-light)] hover:text-[var(--color-toss-blue)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-muted)] transition"
                >
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        {item.oneLineReview && (
          <blockquote className="mb-6 px-5 py-4 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)] border-l-4 border-[var(--color-toss-blue)]">
            <p className="text-[16px] leading-relaxed text-[var(--color-text-strong)] font-medium">
              &ldquo;{item.oneLineReview}&rdquo;
            </p>
          </blockquote>
        )}
        {item.content ? (
          <MarkdownViewer initialValue={item.content} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
