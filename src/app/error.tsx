'use client'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold">문제가 발생했어요</h1>
      {error.digest && (
        <p className="mt-1 text-xs text-neutral-400">참조 코드: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white"
      >
        다시 시도
      </button>
    </div>
  )
}
