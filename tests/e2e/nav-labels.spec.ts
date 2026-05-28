import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

test('데스크톱 nav에 "내 책장", "내 영화관" 라벨 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await expect(page.getByRole('link', { name: /📚 내 책장/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /🎬 내 영화관/ })).toBeVisible()
})
