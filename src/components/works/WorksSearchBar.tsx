'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  type: 'book' | 'movie'
  initialQuery: string
}

export function WorksSearchBar({ type, initialQuery }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    const params = new URLSearchParams({ type, q: trimmed })
    router.push(`/works?${params.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="search"
        aria-label={type === 'book' ? '책 검색' : '영화 검색'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
        placeholder={type === 'book' ? '책 제목·저자 검색' : '영화 제목 검색'}
        className="flex-1 h-11 px-4 rounded-[var(--radius-toss)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      />
      <button
        type="submit"
        className="h-11 px-5 rounded-[var(--radius-toss)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        검색
      </button>
    </form>
  )
}
