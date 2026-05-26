import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { countWritings, listWritings } from '@/lib/db/queries'
import { WritingCard } from '@/components/WritingCard'
import { EmptyState } from '@/components/EmptyState'
import { Pagination } from '@/components/Pagination'
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

export default async function WritingsPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings')
  const sp = await searchParams
  const page = parsePage(sp.page)

  const [writings, total] = await Promise.all([
    listWritings(db, me.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countWritings(db, me.id),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">글방</h1>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}편</span>
          <Link
            href="/writings/new"
            className="inline-flex items-center h-10 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            새 글
          </Link>
        </div>
      </div>
      {writings.length === 0 ? (
        <EmptyState
          emoji="✍️"
          title="아직 쓴 글이 없어요"
          description="첫 글을 남겨보세요"
          action={{ href: '/writings/new', label: '새 글 쓰기' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {writings.map((w) => (
              <WritingCard key={w.id} writing={w} />
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/writings" />
        </>
      )}
    </div>
  )
}
