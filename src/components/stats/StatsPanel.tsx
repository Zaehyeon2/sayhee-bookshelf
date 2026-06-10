'use client'

import { useState } from 'react'
import { StatsDashboard, type StatsData } from './StatsDashboard'

const ENDPOINT: Record<StatsData['domain'], string> = {
  books: '/api/books/stats',
  movies: '/api/movies/stats',
  writings: '/api/writings/stats',
}

export function StatsPanel({ domain }: { domain: StatsData['domain'] }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<StatsData['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function fetchStats() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(ENDPOINT[domain])
      if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`)
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && data === null && !loading) void fetchStats()
  }

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-medium text-[var(--color-text-weak)] hover:text-[var(--color-text-strong)] transition"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span> 통계
      </button>
      {open && (
        <div className="mt-3">
          {loading && (
            <div className="h-32 animate-pulse rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)]" />
          )}
          {error && (
            <div className="text-sm text-[var(--color-text-muted)]">
              통계를 불러오지 못했어요.{' '}
              <button type="button" onClick={fetchStats} className="underline">
                다시 시도
              </button>
            </div>
          )}
          {data && <StatsDashboard {...({ domain, data } as StatsData)} />}
        </div>
      )}
    </section>
  )
}
