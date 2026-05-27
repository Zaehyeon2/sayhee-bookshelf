import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getMovieBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { getCurrentUser } from '@/lib/auth'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const movie = await getMovieBySlug(db, me.id, decodeURIComponent(slug))
  if (!movie) return { title: '영화를 찾을 수 없어요' }
  const pageTitle = `${movie.title} · ${movie.director}`
  const description = `${movie.director} 감독 · ${movie.genre} — 별점 ${movie.rating / 2}/5`
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

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/movies/${slug}`)
  }
  const { slug } = await params
  const movie = await getMovieBySlug(db, me.id, decodeURIComponent(slug))
  if (!movie) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <GenreBadge genre={movie.genre} />
            <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">
              {movie.watchedDate}
            </time>
            {movie.isPublic === 1 && (
              <span
                className="inline-flex items-center text-[12px] font-semibold text-[var(--color-toss-blue)]"
                title="모두의 서재에 공개됨"
              >
                🌐 공개
              </span>
            )}
          </div>
          <Link
            href={`/movies/edit/${movie.id}`}
            className="shrink-0 inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            수정
          </Link>
        </div>
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {movie.title}
        </h1>
        <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">{movie.director}</p>
        <div className="mt-4">
          <RatingStars value={movie.rating} size="lg" />
        </div>
        {movie.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {movie.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/movies?tag=${encodeURIComponent(t)}`}
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
        {movie.oneLineReview && (
          <blockquote className="mb-6 px-5 py-4 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)] border-l-4 border-[var(--color-toss-blue)]">
            <p className="text-[16px] leading-relaxed text-[var(--color-text-strong)] font-medium">
              &ldquo;{movie.oneLineReview}&rdquo;
            </p>
          </blockquote>
        )}
        {movie.content ? (
          <MarkdownViewer initialValue={movie.content} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
