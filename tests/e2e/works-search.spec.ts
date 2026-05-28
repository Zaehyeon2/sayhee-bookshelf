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

test('works tab switches with empty query', async ({ page }) => {
  // 회귀 가드: 빈 q로 영화 탭 진입 시 type=book으로 폴백되던 버그 방지.
  // WorksSearchQuerySchema는 q.min(1) 요구하지만 type은 q와 독립 파싱돼야 함.
  test.setTimeout(60_000)
  await login(page)

  await page.goto('/works?type=movie')
  await expect(page.getByPlaceholder('영화 제목 검색')).toBeVisible()
  await expect(page).toHaveURL(/type=movie/)

  // 책 탭으로 전환 (q 없는 상태) → placeholder 책용으로 바뀜
  await page.getByRole('link', { name: /📚 책/ }).click()
  await expect(page.getByPlaceholder('책 제목·저자 검색')).toBeVisible()
})
