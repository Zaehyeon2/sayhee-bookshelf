import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('네비 드롭다운 → 영화관 통계 페이지', async ({ page }) => {
  // cold dev 서버에서 stats 페이지 첫 컴파일이 느릴 수 있음 (WSL2) — 여유 타임아웃
  test.setTimeout(60_000)
  await login(page, '/movies')

  // 리스트 페이지에 옛 접이식 패널 없음 (회귀 가드)
  await expect(page.getByRole('button', { name: /^통계$/ })).toHaveCount(0)

  // 데스크톱 네비 "내 영화관"에 hover → 드롭다운의 통계 링크 노출
  const navLink = page.locator('[data-testid="desktop-nav"]').getByRole('link', {
    name: /내 영화관/,
  })
  await navLink.hover()
  const statsLink = page.locator('[data-testid="desktop-nav"] a[href="/movies/stats"]')
  await expect(statsLink).toBeVisible()

  // 클릭 → 전용 통계 페이지
  await statsLink.click()
  await page.waitForURL('**/movies/stats', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /영화관 통계/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('전체 기록')).toBeVisible()
  await expect(page.getByText('감독 Top 5')).toBeVisible()
})
