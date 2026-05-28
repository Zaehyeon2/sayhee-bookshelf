import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { IsbnParamSchema, PageParamSchema } from '@/lib/validations'
import { lookupBookByIsbn } from '@/lib/external/book-lookup'
import { logAdapterError } from '@/lib/external/log-error'
import { getPublicBookFallbackByIsbn } from '@/lib/db/queries'
import {
  getBookReviewsCached,
  getBookReviewsCountCached,
  getBookDistributionCached,
} from '@/lib/works-detail-cache'
import { WorksDetailHeader } from '@/components/works/WorksDetailHeader'
import { RatingDistribution } from '@/components/works/RatingDistribution'
import { ReviewListItem } from '@/components/works/ReviewListItem'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'

const PAGE_SIZE = 24

type SP = {
  params: Promise<{ isbn: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function WorksBookDetailPage({ params, searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { isbn: rawIsbn } = await params
  const parsedIsbn = IsbnParamSchema.safeParse(rawIsbn)
  if (!parsedIsbn.success) notFound()
  const isbn = parsedIsbn.data

  const sp = await searchParams
  const page = PageParamSchema.parse(sp.page ?? '1')
  const offset = (page - 1) * PAGE_SIZE

  const [meta, items, total, distribution] = await Promise.all([
    safeBookLookup(isbn),
    getBookReviewsCached(isbn, PAGE_SIZE, offset),
    getBookReviewsCountCached(isbn),
    getBookDistributionCached(isbn),
  ])
  // 외부 lookup 실패 시에만 DB fallback 조회 — 정상 케이스의 불필요한 DB hit 회피.
  const fallback = meta ? null : await getPublicBookFallbackByIsbn(db, isbn)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <WorksDetailHeader
        title={meta?.title ?? fallback?.title ?? `ISBN ${isbn}`}
        byline={meta?.author ?? fallback?.author ?? undefined}
        coverUrl={meta?.coverUrl ?? fallback?.coverUrl ?? undefined}
        description={meta?.description}
        siteAvg={distribution.avg}
        siteCnt={distribution.cnt}
      />

      {distribution.cnt > 0 ? (
        <section>
          <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">별점 분포</h2>
          <RatingDistribution distribution={distribution} />
        </section>
      ) : null}

      <section>
        <h2 className="text-[16px] font-bold text-[var(--color-text-strong)] mb-3">
          한줄평{total > 0 ? ` ${total}` : ''}
        </h2>
        {items.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="아직 평가가 없어요"
            description="이 책을 읽고 별점·한줄평을 남겨보세요"
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {items.map((it) => (
                <li key={it.id}>
                  <ReviewListItem item={it} />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={`/works/book/${isbn}`}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}

async function safeBookLookup(isbn: string) {
  try {
    return await lookupBookByIsbn(isbn)
  } catch (e) {
    logAdapterError('works/book', e)
    return null
  }
}
