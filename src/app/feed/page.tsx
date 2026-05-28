import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getPublicBooksFeed,
  getPublicBooksFeedCount,
  getPublicMoviesFeed,
  getPublicMoviesFeedCount,
} from '@/lib/public-feed-cache'
import { PublicReviewCard } from '@/components/PublicReviewCard'
import { PublicMovieCard } from '@/components/PublicMovieCard'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

const PAGE_SIZE = 24

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

type FeedType = 'book' | 'movie'
function parseType(v: string | undefined): FeedType {
  return v === 'movie' ? 'movie' : 'book'
}

interface SP {
  searchParams: Promise<{ page?: string; type?: string }>
}

export default async function FeedPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/feed')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const type = parseType(sp.type)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          모두의 {type === 'movie' ? '영화관' : '서재'}
        </h1>
      </div>

      <div className="flex gap-2">
        <TabLink href="/feed?type=book" active={type === 'book'} label="📚 책" />
        <TabLink href="/feed?type=movie" active={type === 'movie'} label="🎬 영화" />
      </div>

      {type === 'movie' ? (
        <MovieFeedContent page={page} offset={(page - 1) * PAGE_SIZE} />
      ) : (
        <BookFeedContent page={page} offset={(page - 1) * PAGE_SIZE} />
      )}
    </div>
  )
}

async function BookFeedContent({ page, offset }: { page: number; offset: number }) {
  const [items, total] = await Promise.all([
    getPublicBooksFeed(PAGE_SIZE, offset),
    getPublicBooksFeedCount(),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="아직 공개된 책이 없어요"
        description="내 책을 공개하면 모두의 서재에 올라와요"
        action={{ href: '/books', label: '내 책장으로 가기' }}
      />
    )
  }
  return (
    <>
      <div className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}권</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((b) => (
          <PublicReviewCard key={b.id} item={b} />
        ))}
      </div>
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/feed"
        preservedQuery={{ type: 'book' }}
      />
    </>
  )
}

async function MovieFeedContent({ page, offset }: { page: number; offset: number }) {
  const [items, total] = await Promise.all([
    getPublicMoviesFeed(PAGE_SIZE, offset),
    getPublicMoviesFeedCount(),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (items.length === 0) {
    return (
      <EmptyState
        emoji="🎬"
        title="아직 공개된 영화가 없어요"
        description="내 영화를 공개하면 모두의 영화관에 올라와요"
        action={{ href: '/movies', label: '내 영화관으로 가기' }}
      />
    )
  }
  return (
    <>
      <div className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}편</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((m) => (
          <PublicMovieCard key={m.id} item={m} />
        ))}
      </div>
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/feed"
        preservedQuery={{ type: 'movie' }}
      />
    </>
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
