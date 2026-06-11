import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getGameBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { getCurrentUser } from '@/lib/auth'
import { formatRatingCompact } from '@/lib/rating'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const game = await getGameBySlug(db, me.id, decodeURIComponent(slug))
  if (!game) return { title: '게임을 찾을 수 없어요' }
  const pageTitle = `${game.title} · ${game.developer}`
  const description = `${game.developer} 개발 · ${game.genre} — 별점 ${formatRatingCompact(game.rating)}/5`
  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      type: 'article',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary',
      title: pageTitle,
      description,
    },
  }
}

export default async function GameDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/games/${slug}`)
  }
  const { slug } = await params
  const game = await getGameBySlug(db, me.id, decodeURIComponent(slug))
  if (!game) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <GenreBadge genre={game.genre} />
            <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">
              {game.playedDate}
            </time>
            {game.isPublic === 1 && (
              <span
                className="inline-flex items-center text-[12px] font-semibold text-[var(--color-toss-blue)]"
                title="모두의 게임관에 공개됨"
              >
                🌐 공개
              </span>
            )}
          </div>
          <Link
            href={`/games/edit/${game.id}`}
            className="shrink-0 inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            수정
          </Link>
        </div>
        <div className="mt-3 flex gap-5 items-start">
          {game.coverUrl && (
            <Image
              src={game.coverUrl}
              alt={`${game.title} 커버`}
              width={150}
              height={220}
              className="flex-shrink-0 rounded-[var(--radius-toss-sm)] shadow-[var(--shadow-toss)] object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
              {game.title}
            </h1>
            <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">{game.developer}</p>
            <div className="mt-4">
              <RatingStars value={game.rating} size="lg" />
            </div>
          </div>
        </div>
        {game.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {game.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/games?tag=${encodeURIComponent(t)}`}
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
        {game.oneLineReview && (
          <blockquote className="mb-6 px-5 py-4 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)] border-l-4 border-[var(--color-toss-blue)]">
            <p className="text-[16px] leading-relaxed text-[var(--color-text-strong)] font-medium">
              &ldquo;{game.oneLineReview}&rdquo;
            </p>
          </blockquote>
        )}
        {game.content ? (
          <MarkdownViewer initialValue={game.content} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
