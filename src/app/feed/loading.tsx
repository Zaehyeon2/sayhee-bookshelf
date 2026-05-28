import { Skeleton } from '@/components/Skeleton'

export default function FeedLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-40" />

      <div className="flex gap-2">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>

      <Skeleton className="h-4 w-12" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[220px] rounded-[var(--radius-toss)]" />
        ))}
      </div>
    </div>
  )
}
