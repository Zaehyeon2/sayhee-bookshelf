/**
 * KST 달력 기준 현재 연도.
 *
 * 사용자는 날짜를 KST 달력으로 입력/인지하므로 "올해" 집계의 연도는
 * 서버 TZ(Vercel=UTC)가 아니라 KST로 계산해야 한다 — 안 그러면 KST 새해
 * 첫 ~9시간 동안 작년으로 집계됨. (홈 통계와 대시보드 통계의 단일 연도 소스.)
 */
export function currentKstYear(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(
      new Date(),
    ),
  )
}
