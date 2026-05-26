import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getWritingBySlug } from '@/lib/db/queries'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { getCurrentUser } from '@/lib/auth'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const w = await getWritingBySlug(db, me.id, decodeURIComponent(slug))
  if (!w) return { title: '글을 찾을 수 없어요' }
  return { title: w.title }
}

export default async function WritingDetailPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const me = await getCurrentUser()
  const { slug } = await params
  if (!me) redirect(`/login?next=/writings/${slug}`)
  const w = await getWritingBySlug(db, me.id, decodeURIComponent(slug))
  if (!w) notFound()

  return (
    <article className="space-y-6">
      <header className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        <div className="flex items-start justify-between gap-3">
          <time className="text-[13px] text-[var(--color-text-weak)] font-tabular">
            {new Date(w.createdAt).toISOString().slice(0, 10)}
          </time>
          <Link
            href={`/writings/edit/${w.id}`}
            className="inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            수정
          </Link>
        </div>
        <h1 className="mt-3 text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight text-[var(--color-text-strong)]">
          {w.title}
        </h1>
        {w.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {w.tags.map((t) => (
              <li key={t}>
                <span className="inline-flex items-center rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-muted)]">
                  #{t}
                </span>
              </li>
            ))}
          </ul>
        )}
      </header>
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-toss)]">
        {w.body ? (
          <MarkdownViewer initialValue={w.body} />
        ) : (
          <p className="text-[14px] text-[var(--color-text-weak)]">본문이 없습니다.</p>
        )}
      </section>
    </article>
  )
}
