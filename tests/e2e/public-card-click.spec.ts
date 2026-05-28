import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/feed/, { timeout: 10_000 })
}

test('모두의 서재 카드 클릭 → /works?type=book 검색 이동', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page, '/feed?type=book')
  await expect(page.getByRole('heading', { name: '모두의 서재' })).toBeVisible({ timeout: 10_000 })

  const firstCard = page.locator('a[href^="/works?type=book"]').first()
  await firstCard.click()
  await expect(page).toHaveURL(/\/works\?type=book&q=/)
})

test('모두의 영화관 카드 클릭 → /works?type=movie 검색 이동', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page, '/feed?type=movie')
  await expect(page.getByRole('heading', { name: '모두의 영화관' })).toBeVisible({
    timeout: 10_000,
  })

  const firstCard = page.locator('a[href^="/works?type=movie"]').first()
  await firstCard.click()
  await expect(page).toHaveURL(/\/works\?type=movie&q=/)
})
