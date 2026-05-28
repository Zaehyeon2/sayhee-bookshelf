'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  basePath?: string
  placeholder?: string
}

export function SearchBox({ basePath = '/books', placeholder = '제목·작가·본문 검색' }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(sp.toString())
    const trimmed = q.trim()
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    // 검색어 변경 시 page는 1로 리셋
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath)
    })
  }

  return (
    <form onSubmit={submit} className="relative">
      <span
        aria-hidden
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-text-weak)] pointer-events-none"
      >
        🔍
      </span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 pl-11 pr-24 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 min-w-[64px] rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition disabled:opacity-70 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 inline-flex items-center justify-center gap-1"
      >
        {isPending ? (
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
          />
        ) : (
          '검색'
        )}
      </button>
    </form>
  )
}
