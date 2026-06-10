/**
 * 통계 대시보드 공유 타입 — 서버(쿼리)와 클라이언트(차트)가 함께 쓰는 계약.
 *
 * 의도적으로 DB 쿼리 모듈(src/lib/db/queries/stats.ts) 밖에 둔다:
 * 클라이언트 컴포넌트가 쿼리 모듈을 import하면 실수 한 번(`import type` → `import`)에
 * drizzle/libsql이 클라이언트 번들로 끌려간다. 타입은 여기서만 가져갈 것.
 */

/** 대시보드 위젯 공용 항목 — chart.js 카테고리 축에 그대로 매핑 */
export interface CountItem {
  label: string
  count: number
}

export interface BookDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[] // 10칸 고정(빈 칸 0), label은 표시 스케일(0.5~5)
  genreDist: CountItem[] // count DESC
  yearTimeline: CountItem[] // 연도 ASC, 기록 있는 연도만
  topTags: CountItem[] // 최대 5
  topAuthors: CountItem[] // 최대 5
}

export interface MovieDashboard {
  summary: { total: number; thisYear: number; avgRating: number | null }
  ratingDist: CountItem[]
  genreDist: CountItem[]
  yearTimeline: CountItem[]
  topTags: CountItem[]
  topDirectors: CountItem[]
}

export interface WritingDashboard {
  summary: { total: number; thisYear: number }
  monthlyTimeline: CountItem[] // 최근 12개월, label='YYYY-MM', 빈 달 0
  topTags: CountItem[]
  charStats: { totalChars: number; avgChars: number }
}
