# 리스트 페이지 통계 대시보드 설계

날짜: 2026-06-10
상태: 설계 승인됨

## 목표

내 책장(`/books`)·내 영화관(`/movies`)·글방(`/writings`) 각 리스트 페이지에 접이식 통계 대시보드를 추가한다. 전 기간 누적 기준, 펼칠 때만 데이터를 가져온다.

## 확정된 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| 깊이 | C — 대시보드급 (분포·히스토그램·타임라인·Top N) | 사용자 선택 |
| 배치 | B — 리스트 상단 접이식 패널, 기본 접힘 | 리스트 UX 보존 |
| 연도 범위 | A — 전 기간 누적, 연도 선택기 없음 | 타임라인 위젯이 시간축을 이미 표현 |
| 데이터 fetch | API route + 펼침 시 client fetch 1회 | 기본 접힘이므로 lazy 필수, 기존 `/api/*` 패턴 일치 |
| 차트 | chart.js + react-chartjs-2, `next/dynamic` lazy load | 패널이 이미 lazy라 번들 비용 상쇄, 툴팁·도넛 무료 |

## 메트릭

**책장 / 내 영화관** (대칭 구조):
1. 요약 카드 — 총 개수 · 올해 개수 · 평균 별점
2. 별점 분포 — 1~5★ 히스토그램 (막대)
3. 장르 분포 — 장르별 개수 (도넛)
4. 연도별 타임라인 — 연도당 읽은/본 개수 (막대)
5. 최다 태그 Top 5 (막대)
6. 저자(책) / 감독(영화) Top 5 (막대)

**글방** (rating·genre 없음):
1. 요약 카드 — 총 개수 · 올해 개수
2. 월별 작성 타임라인 — 최근 12개월 (막대)
3. 최다 태그 Top 5 (막대)
4. 글자수 — 총 글자수 · 평균 길이

## 아키텍처

### 1. 데이터 레이어 — `src/lib/db/queries/stats.ts` 확장

도메인당 대시보드 함수 1개. 위젯 데이터를 병렬 쿼리로 수집:

```ts
getBookDashboard(db, userId)    // { summary, ratingDist, genreDist, yearTimeline, topTags, topAuthors }
getMovieDashboard(db, userId)   // 동형 — genre / watchedDate / director
getWritingDashboard(db, userId) // { summary, monthlyTimeline, topTags, charStats }
```

- 전부 인덱스 위 `GROUP BY` / `COUNT` / `AVG` — 본문 row 미조회.
- 연도 버킷 규칙 (기존 stats.ts 컨벤션 유지):
  - `books.readDate` / `movies.watchedDate` = user-typed `YYYY-MM-DD` 텍스트 → `substr(col, 1, 4)` 그룹핑.
  - `writings.createdAt` = ms epoch → UTC 경계(`Date.UTC`) 범위 비교. 월별 버킷은 UTC 기준 `strftime('%Y-%m', created_at / 1000, 'unixepoch')`.
- **모든 WHERE에 `author_user_id = userId`** — 멀티테넌트 invariant.
- 글자수는 `SUM(LENGTH(body))` / `AVG(LENGTH(body))` — row 미반환, DB에서 집계.
- 기존 `getUserStats` / `getUserMovieStats`(홈 전용)는 변경하지 않음.

### 2. API 레이어

GET 라우트 3개, 동일 패턴:

```
GET /api/books/stats     → requireUser() → getBookDashboard → Response.json()
GET /api/movies/stats    → requireUser() → getMovieDashboard → Response.json()
GET /api/writings/stats  → requireUser() → getWritingDashboard → Response.json()
```

- `HttpError` catch 기존 핸들러 패턴 동일.
- GET이므로 CSRF 게이트 무관. 미들웨어 세션 체크 통과 필요.
- 캐시 없음 — user-scoped cache는 보류 결정 유지(Turso 부하 증가 시 재검토).
- `/api/books/[slug]` 동적 라우트와 충돌 없음 — Next.js는 정적 세그먼트(`stats`)를 동적보다 우선 매칭.

### 3. UI 컴포넌트

```
src/components/stats/
├ StatsPanel.tsx        'use client' — 접이식 셸 (도메인 공용)
├ StatsDashboard.tsx    위젯 그리드 배치 (도메인별 구성 props)
├ SummaryCards.tsx      숫자 카드
├ GenreDoughnut.tsx     장르 분포 (chart.js doughnut)
├ RatingHistogram.tsx   1~5★ (chart.js bar)
├ TimelineChart.tsx     연도별/월별 (chart.js bar)
└ TopList.tsx           태그/저자/감독 Top 5 (chart.js horizontal bar)
```

**동작:**
- `StatsPanel` — `▸ 통계` 토글 버튼. 첫 펼침에 `fetch('/api/{domain}/stats')` 1회 → state 보관. 재접기/재펼침에 refetch 없음. 로딩 중 Skeleton.
- chart.js 차트 컴포넌트는 `next/dynamic`(`ssr: false`)으로 감싸 펼치기 전엔 로드하지 않음 — 리스트 LCP 영향 0. (Toast UI Editor와 동일한 SSR 비호환 처리.)
- chart.js 색·폰트는 canvas라 CSS 상속 불가 — 테마 색상을 옵션으로 주입.
- 각 리스트 페이지 SearchBox 위에 `<StatsPanel domain="..." />` 삽입.
- 항목 0개면 EmptyState 재사용("아직 기록이 없어요").

### 4. 테스트

- **integration** — `tests/integration/stats-dashboard.test.ts`: 3개 dashboard 함수.
  - 분포·타임라인·Top N 정확성 (factory로 시드 후 기대값 비교).
  - **cross-user 격리** — user A 데이터가 B 대시보드에 안 섞임 (invariant 회귀 가드, 도메인당 1케이스).
  - 빈 데이터 → 0 / null / 빈 배열 처리.
  - API route 핸들러 직접 호출 커버 (기존 uploads route 테스트 패턴).
- **unit** — 차트 데이터 변환 로직만 검증. jsdom은 canvas 미지원이므로 chart.js 렌더 검증은 e2e에 위임.
- **e2e** — 리스트 페이지에서 패널 펼침 → 위젯 표시 확인 1 시나리오.

## 의존성 추가

- `chart.js`
- `react-chartjs-2`

## 범위 밖 (YAGNI)

- 연도 선택기 / 기간 필터
- 통계 캐싱 (보류 결정 유지)
- 홈 stats(`getUserStats`) 개편
- 공개 피드/works 페이지 통계
