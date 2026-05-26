import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listGenresWithCounts } from '@/lib/db/queries'
import { GENRES } from '@/lib/genres'
import { BookCard } from '@/components/BookCard'
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
          나만의 독서 기록을 시작해보세요.
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

  const [all, genreCounts] = await Promise.all([
    listBooks(db, me.id, { sort: 'date' }),
    listGenresWithCounts(db, me.id),
  ])
  const recent = all.slice(0, 6)
  const countMap = new Map(genreCounts.map((g) => [g.genre, g.count]))

  const total = all.length
  const thisYear = new Date().getFullYear()
  const yearCount = all.filter((b) => b.readDate.startsWith(String(thisYear))).length
  const avgRating =
    total > 0 ? (all.reduce((s, b) => s + b.rating, 0) / total) : 0

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-text-strong)] leading-tight">
          내가 읽은 책
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">
          장르별로 모아둔 독서 기록
        </p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="총 권수" value={`${total}`} suffix="권" />
        <StatCard label={`${thisYear}년`} value={`${yearCount}`} suffix="권" />
        <StatCard
          label="평균 별점"
          value={total > 0 ? avgRating.toFixed(1) : '—'}
          suffix={total > 0 ? '/5' : ''}
        />
      </section>

      <section>
        <h2 className="mb-4 text-[20px] font-bold text-[var(--color-text-strong)]">장르</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {GENRES.map((g) => {
            const count = countMap.get(g) ?? 0
            return (
              <Link
                key={g}
                href={`/books?genre=${encodeURIComponent(g)}`}
                className={
                  'group rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 ' +
                  (count === 0 ? 'opacity-60' : '')
                }
              >
                <div className="text-[15px] font-semibold text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
                  {g}
                </div>
                <div className="mt-1 text-[12px] text-[var(--color-text-weak)] font-tabular">{count}권</div>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[20px] font-bold text-[var(--color-text-strong)]">최근 읽은 책</h2>
        {recent.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="아직 등록된 책이 없어요"
            description="첫 독후감을 남겨보세요"
            action={{ href: '/books/new', label: '새 독후감' }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recent.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-[var(--shadow-toss)]">
      <div className="text-[12px] font-medium text-[var(--color-text-weak)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[20px] sm:text-[28px] font-bold text-[var(--color-text-strong)] font-tabular leading-none">
          {value}
        </span>
        {suffix && (
          <span className="text-[13px] font-medium text-[var(--color-text-muted)]">{suffix}</span>
        )}
      </div>
    </div>
  )
}
