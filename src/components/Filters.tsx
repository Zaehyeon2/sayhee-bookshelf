'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { GENRES } from '@/lib/genres'

export function Filters() {
  const router = useRouter()
  const sp = useSearchParams()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/books?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={sp.get('genre') ?? ''}
        onChange={(e) => setParam('genre', e.target.value || null)}
        className="rounded border px-3 py-2 text-sm"
      >
        <option value="">전체 장르</option>
        {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <select
        value={sp.get('sort') ?? 'date'}
        onChange={(e) => setParam('sort', e.target.value === 'date' ? null : e.target.value)}
        className="rounded border px-3 py-2 text-sm"
      >
        <option value="date">최근 읽은 순</option>
        <option value="rating">별점 높은 순</option>
      </select>
    </div>
  )
}
