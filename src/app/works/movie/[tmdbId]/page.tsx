import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getCurrentUser } from '@/lib/auth'
import { TmdbIdParamSchema, PageParamSchema } from '@/lib/validations'
import { lookupMovieByTmdbId } from '@/lib/external/movie-lookup'
import { logAdapterError } from '@/lib/external/log-error'
import { getPublicMovieFallbackByTmdbId } from '@/lib/db/queries'
import {
  getMovieReviewsCached,
  getMovieReviewsCountCached,
  getMovieDistributionCached,
} from '@/lib/works-detail-cache'
import { WorksDetailHeader } from '@/components/works/WorksDetailHeader'
import { RatingDistribution } from '@/components/works/RatingDistribution'
import { ReviewListItem } from '@/components/works/ReviewListItem'
import { Pagination } from '@/components/Pagination'
import { EmptyState } from '@/components/EmptyState'

const PAGE_SIZE = 24

type SP = {
  params: Promise<{ tmdbId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function WorksMovieDetailPage({ params, searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const { tmdbId: rawTmdbId } = await params
  const parsedTmdb = TmdbIdParamSchema.safeParse(rawTmdbId)
  if (!parsedTmdb.success) notFound()
  const tmdbId = parsedTmdb.data

  const sp = await searchParams
  const page = PageParamSchema.parse(sp.page ?? '1')
  const offset = (page - 1) * PAGE_SIZE

  const [meta, items, total, distribution] = await Promise.all([
    safeMovieLookup(tmdbId),
    getMovieReviewsCached(tmdbId, PAGE_SIZE, offset),
    getMovieReviewsCountCached(tmdbId),
    getMovieDistributionCached(tmdbId),
  ])
  // 외부 lookup 실패 시에만 DB fallback 조회 — 정상 케이스의 불필요한 DB hit 회피.
  const fallback = meta ? null : await getPublicMovieFallbackByTmdbId(db, tmdbId)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <WorksDetailHeader
        title={meta?.title ?? fallback?.title ?? `TMDB ${tmdbId}`}
        subtitle={meta?.originalTitle}
        director={fallback?.director}
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
            description="이 영화를 보고 별점·한줄평을 남겨보세요"
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
                basePath={`/works/movie/${tmdbId}`}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}

async function safeMovieLookup(tmdbId: number) {
  try {
    return await lookupMovieByTmdbId(tmdbId)
  } catch (e) {
    logAdapterError('works/movie', e)
    return null
  }
}
