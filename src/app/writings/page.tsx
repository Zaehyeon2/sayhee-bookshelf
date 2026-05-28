import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { countSearchWritings, countWritings, listWritings, searchWritings } from '@/lib/db/queries'
import { WritingCard } from '@/components/WritingCard'
import { EmptyState } from '@/components/EmptyState'
import { Pagination } from '@/components/Pagination'
import { SearchBox } from '@/components/SearchBox'
import { CardGridSkeleton } from '@/components/CardGridSkeleton'
import { Skeleton } from '@/components/Skeleton'
import { excerpt } from '@/lib/excerpt'
import { getCurrentUser } from '@/lib/auth'

const PAGE_SIZE = 24

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

interface SP {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function WritingsPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings')
  const sp = await searchParams

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchBox basePath="/writings" placeholder="제목·본문 검색" />
      </Suspense>
      <Suspense fallback={<WritingsResultsSkeleton />} key={JSON.stringify(sp)}>
        <WritingsResults sp={sp} userId={me.id} />
      </Suspense>
    </div>
  )
}

function WritingsResultsSkeleton() {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-10" />
      </div>
      <CardGridSkeleton cardHeight="h-[140px]" />
    </>
  )
}

async function WritingsResults({
  sp,
  userId,
}: {
  sp: Awaited<SP['searchParams']>
  userId: number
}) {
  const page = parsePage(sp.page)
  const q = sp.q?.trim() ?? ''
  const isSearch = q.length > 0
  const offset = (page - 1) * PAGE_SIZE

  let writings
  let total: number

  if (isSearch) {
    const [list, count] = await Promise.all([
      searchWritings(db, userId, q, { limit: PAGE_SIZE, offset }),
      countSearchWritings(db, userId, q),
    ])
    writings = list
    total = count
  } else {
    const [list, count] = await Promise.all([
      listWritings(db, userId, { limit: PAGE_SIZE, offset }),
      countWritings(db, userId),
    ])
    writings = list
    total = count
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
          {isSearch ? `"${q}" 검색 결과` : '글방'}
        </h1>
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
        isSearch ? (
          <EmptyState
            emoji="🔍"
            title="찾는 글이 없어요"
            description={`'${q}' 와 일치하는 결과가 없습니다`}
          />
        ) : (
          <EmptyState
            emoji="✍️"
            title="아직 쓴 글이 없어요"
            description="첫 글을 남겨보세요"
            action={{ href: '/writings/new', label: '새 글 쓰기' }}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {writings.map((w) => {
              const titleMatches = isSearch
                ? w.title.toLowerCase().includes(q.toLowerCase())
                : false
              const snippet =
                isSearch && !titleMatches ? (excerpt(w.body, q) ?? undefined) : undefined
              return (
                <WritingCard
                  key={w.id}
                  writing={w}
                  snippet={snippet}
                  query={isSearch ? q : undefined}
                />
              )
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/writings"
            preservedQuery={{ q: isSearch ? q : undefined }}
          />
        </>
      )}
    </>
  )
}
