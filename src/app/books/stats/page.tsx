import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getBookDashboard } from '@/lib/db/queries'
import { StatsDashboard } from '@/components/stats/StatsDashboard'
import { getCurrentUser } from '@/lib/auth'
import { currentKstYear } from '@/lib/kst'

export const metadata: Metadata = { title: '책장 통계' }

export default async function BookStatsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/books/stats')

  // 전용 페이지 — API fetch 없이 서버에서 직접 집계 (연도는 KST, 홈과 동일 소스)
  const dashboard = await getBookDashboard(db, me.id, currentKstYear())

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">📊 책장 통계</h1>
        <Link
          href="/books"
          className="text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] transition"
        >
          목록으로 →
        </Link>
      </div>
      <StatsDashboard domain="books" data={dashboard} />
    </div>
  )
}
