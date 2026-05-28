import { Skeleton } from '@/components/Skeleton'

export default function WritingsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-full rounded-[var(--radius-toss-sm)]" />

      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-10" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-[var(--radius-toss)]" />
        ))}
      </div>
    </div>
  )
}
