import { Skeleton } from '@/components/Skeleton'

export default function WorksBookDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        <Skeleton className="h-[180px] w-[120px] rounded-[var(--radius-toss-sm)]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      <section className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="max-w-md mx-auto space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-[var(--radius-toss)]" />
          ))}
        </div>
      </section>
    </div>
  )
}
