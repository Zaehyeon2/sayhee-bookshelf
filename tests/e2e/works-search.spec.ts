import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/books/new')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/books/new'), page.click('button[type="submit"]')])
  // Wait for the Toast UI MarkdownEditor dynamic import to finish mounting —
  // ensures the post-login navigation has fully settled before we navigate away.
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })
}

test('works search → detail navigation', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page)

  await page.goto('/works?type=book')
  await page.getByPlaceholder('책 제목·저자 검색').fill('어린왕자')
  await page.getByRole('button', { name: '검색' }).click()

  // 외부 API 결과 도착 대기 — first matching heading on the results grid
  await expect(page.getByRole('heading', { name: /어린왕자/i }).first()).toBeVisible({
    timeout: 15_000,
  })

  // 첫 카드 클릭 → /works/book/{isbn} 로 이동
  await page.locator('a[href^="/works/book/"]').first().click()
  await expect(page).toHaveURL(/\/works\/book\/\d{10,13}/)
  await expect(page.getByRole('heading', { name: /한줄평/i })).toBeVisible()
})
