import type { RatingDistribution as RatingDistType } from '@/lib/db/queries'

interface Props {
  distribution: RatingDistType
}

export function RatingDistribution({ distribution }: Props) {
  if (distribution.cnt === 0) return null
  const maxBucket = Math.max(...Object.values(distribution.buckets))
  return (
    <div
      className="space-y-1.5 max-w-md mx-auto"
      role="img"
      aria-label={`별점 분포: 평균 ${distribution.avg.toFixed(1)}점, 총 ${distribution.cnt}명`}
    >
      {Array.from({ length: 10 }, (_, i) => 10 - i).map((rating) => {
        const count = distribution.buckets[rating] ?? 0
        const ratio = maxBucket === 0 ? 0 : (count / maxBucket) * 100
        return (
          <div key={rating} className="flex items-center gap-3 text-[12px] font-tabular">
            <span className="w-6 text-right text-[var(--color-text-muted)]">{rating}</span>
            <div className="flex-1 h-3 rounded-sm bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-toss-blue)]"
                style={{ width: `${ratio}%` }}
              />
            </div>
            <span className="w-8 text-right text-[var(--color-text-weak)] tabular-nums">
              {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}
