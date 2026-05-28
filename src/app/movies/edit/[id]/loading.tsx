import { Skeleton } from '@/components/Skeleton'

export default function MovieEditLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-12 w-full rounded-[var(--radius-toss-sm)]" />
      <Skeleton className="h-12 w-full rounded-[var(--radius-toss-sm)]" />
      <Skeleton className="h-12 w-full rounded-[var(--radius-toss-sm)]" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-toss-sm)]" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24 rounded-[var(--radius-toss-sm)]" />
        <Skeleton className="h-11 w-24 rounded-[var(--radius-toss-sm)]" />
      </div>
    </div>
  )
}
