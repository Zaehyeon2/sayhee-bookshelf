'use client'

import { Component, type ReactNode, useState } from 'react'
import { Skeleton } from '@/components/Skeleton'
import { StatsDashboard, type StatsData } from './StatsDashboard'

const ENDPOINT: Record<StatsData['domain'], string> = {
  books: '/api/books/stats',
  movies: '/api/movies/stats',
  writings: '/api/writings/stats',
}

// 차트 렌더/청크 로드 실패가 페이지 전체 error boundary까지 번지지 않게 패널 안에서 격리.
class PanelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return <div className="text-sm text-[var(--color-text-muted)]">통계를 표시하지 못했어요.</div>
    }
    return this.props.children
  }
}

export function StatsPanel({ domain }: { domain: StatsData['domain'] }) {
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function fetchStats() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(ENDPOINT[domain])
      if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`)
      // 런타임 JSON을 union으로 승격하는 유일한 지점 — domain↔data 결합을 여기서 고정.
      // shape 불일치(배포 skew 등)는 PanelErrorBoundary가 렌더 단계에서 격리.
      setStats({ domain, data: await res.json() } as StatsData)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && stats === null && !loading) void fetchStats()
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
          {loading && <Skeleton className="h-32" />}
          {error && (
            <div className="text-sm text-[var(--color-text-muted)]">
              통계를 불러오지 못했어요.{' '}
              <button type="button" onClick={fetchStats} className="underline">
                다시 시도
              </button>
            </div>
          )}
          {stats && (
            <PanelErrorBoundary>
              <StatsDashboard {...stats} />
            </PanelErrorBoundary>
          )}
        </div>
      )}
    </section>
  )
}
