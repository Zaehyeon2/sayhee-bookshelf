import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { listWritings } from '@/lib/db/queries'
import { WritingCard } from '@/components/WritingCard'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'

export default async function WritingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings')
  const writings = await listWritings(db, me.id)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">글방</h1>
        <Link
          href="/writings/new"
          className="inline-flex items-center h-10 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          새 글
        </Link>
      </div>
      {writings.length === 0 ? (
        <EmptyState
          emoji="✍️"
          title="아직 쓴 글이 없어요"
          description="첫 글을 남겨보세요"
          action={{ href: '/writings/new', label: '새 글 쓰기' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {writings.map((w) => (
            <WritingCard key={w.id} writing={w} />
          ))}
        </div>
      )}
    </div>
  )
}
