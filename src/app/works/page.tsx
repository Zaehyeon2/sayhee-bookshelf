import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { WorksSearchQuerySchema } from '@/lib/validations'
import { searchBooksExternal } from '@/lib/external/books'
import { searchMoviesExternal } from '@/lib/external/movies'
import { logAdapterError } from '@/lib/external/log-error'
import {
  getBookAggregatesByIsbns,
  getMovieAggregatesByTmdbIds,
} from '@/lib/db/queries'
import { WorksSearchBar } from '@/components/works/WorksSearchBar'
import { WorksSearchCard } from '@/components/works/WorksSearchCard'
import { EmptyState } from '@/components/EmptyState'

type SP = { searchParams: Promise<{ type?: string; q?: string; page?: string }> }

export default async function WorksSearchPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/works')

  const sp = await searchParams
  // type은 q 유무와 독립적으로 결정 — 빈 q로 탭만 전환하는 경우 지원.
  // q가 있을 때만 WorksSearchQuerySchema로 검증(min 1, max 100, trim).
  const type: 'book' | 'movie' = sp.type === 'movie' ? 'movie' : 'book'
  const parsedQ = WorksSearchQuerySchema.safeParse({ type, q: sp.q ?? '', page: sp.page })
  const q = parsedQ.success ? parsedQ.data.q : ''

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          작품 검색
        </h1>
      </div>

      <div className="flex gap-2">
        <TabLink
          href={`/works?type=book${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          active={type === 'book'}
          label="📚 책"
        />
        <TabLink
          href={`/works?type=movie${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          active={type === 'movie'}
          label="🎬 영화"
        />
      </div>

      <WorksSearchBar type={type} initialQuery={q} />

      {!q ? (
        <EmptyState
          emoji="🔍"
          title="키워드로 검색해보세요"
          description={type === 'book' ? '제목이나 저자를 입력해보세요' : '영화 제목을 입력해보세요'}
        />
      ) : type === 'book' ? (
        <BookResults q={q} />
      ) : (
        <MovieResults q={q} />
      )}
    </div>
  )
}

async function BookResults({ q }: { q: string }) {
  let items
  try {
    items = await searchBooksExternal(q, { limit: 24 })
  } catch (e) {
    logAdapterError('works/search', e)
    return (
      <EmptyState
        emoji="📡"
        title="외부 검색 서비스 일시 불가"
        description="잠시 후 다시 시도해주세요"
      />
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="검색 결과가 없어요"
        description={`"${q}"에 대한 책을 찾지 못했어요`}
      />
    )
  }
  const isbns = Array.from(new Set(items.map((it) => it.externalId).filter(Boolean)))
  const agg = await getBookAggregatesByIsbns(db, isbns)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map((it) => (
        <WorksSearchCard
          key={it.externalId}
          type="book"
          externalId={it.externalId}
          title={it.title}
          byline={it.byline}
          year={it.year}
          coverUrl={it.coverUrl}
          externalRating={it.externalRating}
          siteAgg={agg.get(it.externalId) ?? { avg: 0, cnt: 0 }}
        />
      ))}
    </div>
  )
}

async function MovieResults({ q }: { q: string }) {
  let items
  try {
    items = await searchMoviesExternal(q, { limit: 24 })
  } catch (e) {
    logAdapterError('works/search', e)
    return (
      <EmptyState
        emoji="📡"
        title="외부 검색 서비스 일시 불가"
        description="잠시 후 다시 시도해주세요"
      />
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="검색 결과가 없어요"
        description={`"${q}"에 대한 영화를 찾지 못했어요`}
      />
    )
  }
  const tmdbIds = Array.from(new Set(items.map((it) => it.externalId)))
  const agg = await getMovieAggregatesByTmdbIds(db, tmdbIds)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map((it) => (
        <WorksSearchCard
          key={it.externalId}
          type="movie"
          externalId={it.externalId}
          title={it.title}
          byline={it.byline}
          year={it.year}
          coverUrl={it.coverUrl}
          externalRating={it.externalRating}
          siteAgg={agg.get(it.externalId) ?? { avg: 0, cnt: 0 }}
        />
      ))}
    </div>
  )
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        'h-9 px-4 inline-flex items-center rounded-full text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 ' +
        (active
          ? 'bg-[var(--color-toss-blue)] text-white'
          : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]')
      }
    >
      {label}
    </Link>
  )
}
