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

test('works detail with no site reviews shows empty state', async ({ page }) => {
  test.setTimeout(30_000)
  await login(page)

  // 사이트 한줄평이 존재하지 않는 ISBN deep link.
  // e2e seed (scripts/seed-e2e.ts)는 books 테이블에 데이터를 주입하지 않으므로
  // 임의의 13자리 ISBN 값으로 빈 상태가 보장됨.
  await page.goto('/works/book/9999999999999')
  await expect(page.getByText('아직 평가가 없어요')).toBeVisible({ timeout: 10_000 })
})
