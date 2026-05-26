import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listWritings, getUserStats } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { WritingCard } from '@/components/WritingCard'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const me = await getCurrentUser()

  if (!me) {
    return (
      <div className="mx-auto max-w-xl text-center space-y-6 py-16">
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-strong)]">
          누구의 서재
        </h1>
        <p className="text-[15px] text-[var(--color-text-muted)]">
          나만의 독서 기록과 글쓰기를 시작해보세요.
        </p>
        <Link
          href="/login"
          className="inline-block px-6 h-11 leading-[44px] rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium"
        >
          로그인
        </Link>
      </div>
    )
  }

  const thisYear = new Date().getFullYear()
  const [stats, recentBooks, recentWritings] = await Promise.all([
    getUserStats(db, me.id, thisYear),
    listBooks(db, me.id, { sort: 'date', limit: 6 }),
    listWritings(db, me.id, { limit: 6 }),
  ])

  const totalBooks = stats.booksTotal
  const totalWritings = stats.writingsTotal
  const avgRating = stats.avgRating

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-strong)] leading-tight">
          {me.displayName}님의 서재
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">
          책과 글을 한 곳에서.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EntryCard
          href="/books"
          emoji="📚"
          label="책장"
          count={totalBooks}
          unit="권"
          metrics={[
            `${thisYear}년 ${stats.booksThisYear}권`,
            totalBooks > 0 ? `평균 ★${avgRating.toFixed(1)}` : null,
          ]}
          subAction={{ href: '/books/new', label: '새 책' }}
        />
        <EntryCard
          href="/writings"
          emoji="✏️"
          label="글방"
          count={totalWritings}
          unit="편"
          metrics={[`${thisYear}년 ${stats.writingsThisYear}편`]}
          subAction={{ href: '/writings/new', label: '새 글' }}
        />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold text-[var(--color-text-strong)]">최근 읽은 책</h2>
          {recentBooks.length > 0 && (
            <Link
              href="/books"
              className="text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-toss-blue)] transition"
            >
              전체 보기 →
            </Link>
          )}
        </div>
        {recentBooks.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="아직 등록된 책이 없어요"
            description="첫 독후감을 남겨보세요"
            action={{ href: '/books/new', label: '새 독후감' }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recentBooks.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold text-[var(--color-text-strong)]">최근 쓴 글</h2>
          {recentWritings.length > 0 && (
            <Link
              href="/writings"
              className="text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-toss-blue)] transition"
            >
              전체 보기 →
            </Link>
          )}
        </div>
        {recentWritings.length === 0 ? (
          <EmptyState
            emoji="✍️"
            title="아직 쓴 글이 없어요"
            description="첫 글을 남겨보세요"
            action={{ href: '/writings/new', label: '새 글 쓰기' }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recentWritings.map((w) => <WritingCard key={w.id} writing={w} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function EntryCard({
  href,
  emoji,
  label,
  count,
  unit,
  metrics,
  subAction,
}: {
  href: string
  emoji: string
  label: string
  count: number
  unit: string
  metrics: (string | null)[]
  subAction: { href: string; label: string }
}) {
  const visibleMetrics = metrics.filter((m): m is string => !!m)
  return (
    <div className="group relative rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition">
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 rounded-[var(--radius-toss-sm)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[32px] leading-none" aria-hidden>{emoji}</span>
            <span className="text-[18px] font-bold text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
              {label}
            </span>
          </div>
          <span className="flex items-baseline gap-1">
            <span className="text-[24px] sm:text-[28px] font-bold text-[var(--color-text-strong)] font-tabular leading-none">
              {count}
            </span>
            <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{unit}</span>
          </span>
        </div>
        {visibleMetrics.length > 0 && (
          <div className="mt-3 text-[13px] text-[var(--color-text-muted)] font-tabular">
            {visibleMetrics.join(' · ')}
          </div>
        )}
      </Link>
      <Link
        href={subAction.href}
        className="mt-4 inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        + {subAction.label}
      </Link>
    </div>
  )
}
