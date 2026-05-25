import { Skeleton } from '@/components/Skeleton'

export default function HomeLoading() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64" />
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-[var(--radius-toss)]" />
        ))}
      </section>

      {/* Genre section heading */}
      <section>
        <Skeleton className="mb-4 h-7 w-16" />
        {/* Genre grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-[var(--radius-toss)]" />
          ))}
        </div>
      </section>

      {/* Recent books section heading */}
      <section>
        <Skeleton className="mb-4 h-7 w-32" />
        {/* Book card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-[var(--radius-toss)]" />
          ))}
        </div>
      </section>
    </div>
  )
}
