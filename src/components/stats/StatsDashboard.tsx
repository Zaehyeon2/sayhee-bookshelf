'use client'

import dynamic from 'next/dynamic'
import type { BookDashboard, MovieDashboard, WritingDashboard } from '@/lib/stats-types'
import { formatRating } from '@/lib/rating'
import { Skeleton } from '@/components/Skeleton'
import { SummaryCards } from './SummaryCards'

// chart.js는 펼칠 때만 로드 — 리스트 LCP 영향 0 (SSR 비호환이라 ssr: false).
// loading fallback이 없으면 청크 로드 동안 빈 박스만 보임.
const CountBarChart = dynamic(() => import('./charts').then((m) => m.CountBarChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full" />,
})
const CountDoughnutChart = dynamic(() => import('./charts').then((m) => m.CountDoughnutChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full" />,
})

export type StatsData =
  | { domain: 'books'; data: BookDashboard }
  | { domain: 'movies'; data: MovieDashboard }
  | { domain: 'writings'; data: WritingDashboard }

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)]">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-weak)]">{title}</h3>
      <div className="h-52">{children}</div>
    </div>
  )
}

export function StatsDashboard(props: StatsData) {
  if (props.domain === 'writings') {
    const d = props.data
    return (
      <div className="space-y-4">
        <SummaryCards
          items={[
            { label: '전체 글', value: String(d.summary.total) },
            { label: '올해', value: String(d.summary.thisYear) },
            { label: '총 글자수', value: d.charStats.totalChars.toLocaleString() },
            { label: '평균 길이', value: `${Math.round(d.charStats.avgChars).toLocaleString()}자` },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Widget title="월별 작성 (최근 12개월)">
            <CountBarChart items={d.monthlyTimeline} />
          </Widget>
          <Widget title="태그 Top 5">
            <CountBarChart items={d.topTags} horizontal color="#1fc7c1" />
          </Widget>
        </div>
      </div>
    )
  }

  // books/movies는 동형 — 도메인별 차이는 타이틀 2개와 person 필드뿐
  const person =
    props.domain === 'books'
      ? { title: '저자 Top 5', items: props.data.topAuthors }
      : { title: '감독 Top 5', items: props.data.topDirectors }
  const timelineTitle = props.domain === 'books' ? '연도별 읽은 수' : '연도별 본 수'
  const d = props.data

  return (
    <div className="space-y-4">
      <SummaryCards
        items={[
          { label: '전체 기록', value: String(d.summary.total) },
          { label: '올해', value: String(d.summary.thisYear) },
          { label: '평균 별점', value: formatRating(d.summary.avgRating) },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Widget title="별점 분포 (0.5~5)">
          <CountBarChart items={d.ratingDist} />
        </Widget>
        <Widget title="장르 분포">
          <CountDoughnutChart items={d.genreDist} />
        </Widget>
        <Widget title={timelineTitle}>
          <CountBarChart items={d.yearTimeline} color="#9061f9" />
        </Widget>
        <Widget title="태그 Top 5">
          <CountBarChart items={d.topTags} horizontal color="#1fc7c1" />
        </Widget>
        <Widget title={person.title}>
          <CountBarChart items={person.items} horizontal color="#ffb331" />
        </Widget>
      </div>
    </div>
  )
}
