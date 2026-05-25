'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function SearchBox() {
  const router = useRouter()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(sp.toString())
    const trimmed = q.trim()
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
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
        placeholder="제목·작가 검색"
        className="w-full h-12 pl-11 pr-24 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition"
      >
        검색
      </button>
    </form>
  )
}
