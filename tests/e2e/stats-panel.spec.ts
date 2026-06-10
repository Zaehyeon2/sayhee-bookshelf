import { test, expect, type Page } from '@playwright/test'

// global-setup이 시드하는 표준 e2e 계정 — alice는 영화 5편 보유 (feed-tab.spec 패턴)
const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(new RegExp(next.replace('/', '\\/')), { timeout: 10_000 })
}

test('영화관 통계 패널 펼침 → 요약 카드·위젯 표시', async ({ page }) => {
  // cold dev 서버에서 /api/movies/stats 첫 컴파일이 느릴 수 있음 (WSL2) — 여유 타임아웃
  test.setTimeout(60_000)
  await login(page, '/movies')

  // 통계 버튼이 렌더될 때까지 대기
  await expect(page.getByRole('button', { name: /통계/ })).toBeVisible()

  // 접힌 상태 — 요약 카드 없음 (lazy: 펼치기 전 fetch 없음)
  await expect(page.getByText('전체 기록')).not.toBeVisible()

  // 패널 펼치기
  await page.click('button:has-text("통계")')

  // 요약 카드 + 위젯 타이틀 표시 (alice는 시드 영화 5편 보유)
  await expect(page.getByText('전체 기록')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('평균 별점')).toBeVisible()
  await expect(page.getByText('별점 분포 (0.5~5)')).toBeVisible()
  await expect(page.getByText('감독 Top 5')).toBeVisible()
})
