import { Skeleton } from './Skeleton'

interface Props {
  count?: number
  cardHeight?: string
}

// 그리드 형태 결과 영역의 공용 skeleton (검색/필터 변경 시 Suspense fallback).
export function CardGridSkeleton({ count = 6, cardHeight = 'h-[160px]' }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${cardHeight} rounded-[var(--radius-toss)]`} />
      ))}
    </div>
  )
}
