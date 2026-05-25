'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function SearchBox() {
  const router = useRouter()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // Preserve other filters (genre/tag/sort) when searching; only swap q.
    const params = new URLSearchParams(sp.toString())
    const trimmed = q.trim()
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·작가 검색"
        className="flex-1 rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">검색</button>
    </form>
  )
}
