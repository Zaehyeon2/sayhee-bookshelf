'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold">문제가 발생했어요</h1>
      <button onClick={() => reset()} className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white">
        다시 시도
      </button>
    </div>
  )
}
