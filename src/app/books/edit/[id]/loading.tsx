import { Skeleton } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-11 w-full" />
      </section>
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-toss)]">
        <Skeleton className="h-[320px] w-full" />
      </section>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-12 w-20" />
        <Skeleton className="h-12 w-20" />
      </div>
    </div>
  )
}
