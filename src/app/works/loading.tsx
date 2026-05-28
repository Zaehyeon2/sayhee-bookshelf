import { Skeleton } from '@/components/Skeleton'

export default function WorksLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-40" />

      <div className="flex gap-2">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-[var(--radius-toss)]" />
        <Skeleton className="h-11 w-20 rounded-[var(--radius-toss)]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-[var(--radius-toss)]" />
        ))}
      </div>
    </div>
  )
}
