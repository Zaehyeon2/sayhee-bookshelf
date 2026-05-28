import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'
const MOBILE_VIEWPORT = { width: 375, height: 667 } as const

async function login(page: Page) {
  await page.goto('/login?next=/')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

test('모바일 viewport에서 햄버거 버튼 표시, 데스크톱 nav 링크 숨김', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT)
  await login(page)
  await expect(page.getByLabel('메뉴 열기')).toBeVisible()
  await expect(
    page.getByTestId('desktop-nav').getByRole('link', { name: /📚 내 책장/ }),
  ).toBeHidden()
})

test('햄버거 클릭 → 패널 열림 → 내 책장 클릭 → /books 이동', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT)
  await login(page)
  await page.getByLabel('메뉴 열기').click()
  const panelLink = page.getByTestId('mobile-nav').getByRole('link', { name: /📚 내 책장/ })
  await expect(panelLink).toBeVisible()
  await panelLink.click()
  await expect(page).toHaveURL('/books', { timeout: 10_000 })
})

test('데스크톱 viewport에서는 햄버거 숨김, nav 링크 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await expect(page.getByLabel('메뉴 열기')).toBeHidden()
  await expect(
    page.getByTestId('desktop-nav').getByRole('link', { name: /📚 내 책장/ }),
  ).toBeVisible()
})
