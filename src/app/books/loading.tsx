import { Skeleton } from '@/components/Skeleton'

export default function BooksLoading() {
  return (
    <div className="space-y-6">
      {/* Search input */}
      <Skeleton className="h-12 w-full rounded-[var(--radius-toss-sm)]" />

      {/* Chip filters */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-16" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-14" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-16" />
      </div>

      {/* Title + count row */}
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-10" />
      </div>

      {/* Book card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[160px] rounded-[var(--radius-toss)]" />
        ))}
      </div>
    </div>
  )
}
