import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { getBookBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = await getBookBySlug(db, decodeURIComponent(slug))
  if (!book) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-center gap-2">
          <GenreBadge genre={book.genre} />
          <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">{book.readDate}</time>
        </div>
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {book.title}
        </h1>
        <p className="mt-1 text-[16px] text-[var(--color-text-muted)]">{book.author}</p>
        <div className="mt-4">
          <RatingStars value={book.rating} size="lg" />
        </div>
        {book.tags.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-1.5">
            {book.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/books?tag=${encodeURIComponent(t)}`}
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
        {book.content ? (
          <MarkdownViewer initialValue={book.content} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
