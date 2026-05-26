import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md text-center py-20">
      <div className="rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-10 shadow-[var(--shadow-toss)]">
        <div className="text-[56px] font-bold text-[var(--color-toss-blue)] font-tabular leading-none">404</div>
        <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">그런 책이 없어요.</p>
        <Link
          href="/books"
          className="mt-6 inline-flex h-11 items-center px-5 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] hover:bg-[var(--color-border-subtle)] text-[14px] font-semibold text-[var(--color-text-strong)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          목록으로
        </Link>
      </div>
    </div>
  )
}
