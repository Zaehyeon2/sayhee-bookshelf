'use client'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-md text-center py-20">
      <div className="rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-toss)]">
        <div className="text-[40px] leading-none">⚠️</div>
        <h1 className="mt-4 text-[22px] font-bold text-[var(--color-text-strong)]">
          문제가 발생했어요
        </h1>
        {error.digest && (
          <p className="mt-2 text-[12px] text-[var(--color-text-weak)] font-tabular">
            참조 코드: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          className="mt-6 h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
