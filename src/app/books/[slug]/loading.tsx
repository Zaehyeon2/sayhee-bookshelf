import { Skeleton } from '@/components/Skeleton'

export default function BookDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] p-6 sm:p-8">
        {/* Badge + date */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-5 w-24" />
        </div>
        {/* Title */}
        <Skeleton className="mt-3 h-9 w-3/4" />
        {/* Author */}
        <Skeleton className="mt-2 h-5 w-1/2" />
        {/* Stars */}
        <Skeleton className="mt-4 h-7 w-40" />
      </div>

      {/* Body card */}
      <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] p-6 sm:p-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}
