import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { RawgIdParamSchema, PageParamSchema } from '@/lib/validations'
import { lookupGameByRawgId } from '@/lib/external/game-lookup'
import { logAdapterError } from '@/lib/external/log-error'
import { getPublicGameFallbackByRawgId } from '@/lib/db/queries'
import {
  getGameReviewsCached,
  getGameReviewsCountCached,
  getGameDistributionCached,
} from '@/lib/works-detail-cache'
import { WorksDetailHeader } from '@/components/works/WorksDetailHeader'
import { RatingDistribution } from '@/components/works/RatingDistribution'
import { ReviewListItem } from '@/components/works/ReviewListItem'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'

const PAGE_SIZE = 24

type SP = {
  params: Promise<{ rawgId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function WorksGameDetailPage({ params, searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { rawgId: rawRawgId } = await params
  const parsedRawg = RawgIdParamSchema.safeParse(rawRawgId)
  if (!parsedRawg.success) notFound()
  const rawgId = parsedRawg.data

  const sp = await searchParams
  const page = PageParamSchema.parse(sp.page ?? '1')
  const offset = (page - 1) * PAGE_SIZE

  const [meta, items, total, distribution] = await Promise.all([
    safeGameLookup(rawgId),
    getGameReviewsCached(rawgId, PAGE_SIZE, offset),
    getGameReviewsCountCached(rawgId),
    getGameDistributionCached(rawgId),
  ])
  // 외부 lookup 실패 시에만 DB fallback 조회 — 정상 케이스의 불필요한 DB hit 회피.
  const fallback = meta ? null : await getPublicGameFallbackByRawgId(db, rawgId)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <WorksDetailHeader
        title={meta?.title ?? fallback?.title ?? `RAWG ${rawgId}`}
        subtitle={meta?.originalTitle}
        byline={
          (meta?.developer ?? fallback?.developer)
            ? `개발사 ${meta?.developer ?? fallback?.developer}`
            : undefined
        }
        coverUrl={meta?.coverUrl ?? fallback?.coverUrl ?? undefined}
        description={meta?.description}
        externalRating={meta?.externalRating}
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
            description="이 게임을 하고 별점·한줄평을 남겨보세요"
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
                basePath={`/works/game/${rawgId}`}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}

async function safeGameLookup(rawgId: number) {
  try {
    return await lookupGameByRawgId(rawgId)
  } catch (e) {
    logAdapterError('works/game', e)
    return null
  }
}
