import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('리스트 헤딩의 통계 버튼 → 전용 통계 페이지', async ({ page }) => {
  // cold dev 서버에서 stats 페이지 첫 컴파일이 느릴 수 있음 (WSL2) — 여유 타임아웃
  test.setTimeout(60_000)
  await login(page, '/movies')

  // 옛 접이식 패널 없음 (회귀 가드)
  await expect(page.getByRole('button', { name: /^통계$/ })).toHaveCount(0)

  // 결과 헤딩 줄의 통계 버튼 → 전용 페이지
  const statsLink = page.locator('a[href="/movies/stats"]:visible').first()
  await expect(statsLink).toBeVisible({ timeout: 15_000 })
  await statsLink.click()
  await page.waitForURL('**/movies/stats', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /영화관 통계/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('전체 기록')).toBeVisible()
  await expect(page.getByText('감독 Top 5')).toBeVisible()
})
