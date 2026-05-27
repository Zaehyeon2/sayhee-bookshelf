import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { listRecentPublicBooks, countPublicBooks } from '@/lib/db/queries'
import { PublicReviewCard } from '@/components/PublicReviewCard'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

const PAGE_SIZE = 24

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

interface SP {
  searchParams: Promise<{ page?: string }>
}

export default async function FeedPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/feed')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const offset = (page - 1) * PAGE_SIZE

  const [items, total] = await Promise.all([
    listRecentPublicBooks(db, { limit: PAGE_SIZE, offset }),
    countPublicBooks(db),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          모두의 서재
        </h1>
        <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}권</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          emoji="📭"
          title="아직 공개된 책이 없어요"
          description="내 책을 공개하면 모두의 서재에 올라와요"
          action={{ href: '/books', label: '내 책장으로 가기' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {items.map((b) => (
              <PublicReviewCard key={b.id} item={b} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/feed" />
        </>
      )}
    </div>
  )
}
