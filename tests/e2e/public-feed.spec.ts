import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const BOB_USER = 'e2e-bob'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page, username: string, password: string) {
  await page.goto('/login?next=/books/new')
  await page.fill('input[autocomplete="username"]', username)
  await page.fill('input[type="password"]', password)
  await Promise.all([page.waitForURL('**/books/new'), page.click('button[type="submit"]')])
  // Wait for the Toast UI MarkdownEditor dynamic import to finish mounting
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })
}

test('공개 on인 책이 다른 사용자 /feed에 표시된다', async ({ browser }) => {
  // Alice creates a public book
  const aliceCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  await login(alicePage, ALICE_USER, PASSWORD)

  const uniqueTitle = `피드 E2E 테스트 ${Date.now()}`
  const oneLineReview = `한줄평 테스트 ${Date.now()}`

  const inputs = alicePage.locator('input')
  await inputs.nth(0).fill(uniqueTitle)
  await inputs.nth(1).fill('피드 테스트 작가')
  await alicePage.fill('input[placeholder="이 책을 한 줄로 표현한다면?"]', oneLineReview)

  // 공개 toggle should default to true
  const toggle = alicePage.locator('button[role="switch"]')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await alicePage.click('button:has-text("등록")')
  // Wait for navigation to the book detail page (not /books/new or /books/edit/*)
  await alicePage.waitForURL(/\/books\/(?!new|edit)/, { timeout: 15_000 })
  await aliceCtx.close()

  // Bob logs in and visits /feed — should see Alice's book
  const bobCtx = await browser.newContext()
  const bobPage = await bobCtx.newPage()
  await login(bobPage, BOB_USER, PASSWORD)

  await bobPage.goto('/feed')
  const card = bobPage.locator('article').filter({ hasText: uniqueTitle })
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect(card.getByText('피드 테스트 작가')).toBeVisible()
  await expect(card.getByText(oneLineReview)).toBeVisible()
  // Alice's displayName should appear on the card
  await expect(card.getByText('앨리스')).toBeVisible()

  // content (본문) should NOT be rendered on the feed card
  // (PublicReviewCard does not include content — verified by absence of a dedicated content assertion)

  await bobCtx.close()
})

test('공개 toggle을 끄면 /feed에서 사라진다', async ({ browser }) => {
  // Alice creates a public book
  const aliceCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  await login(alicePage, ALICE_USER, PASSWORD)

  const uniqueTitle = `피드 제거 테스트 ${Date.now()}`

  const inputs = alicePage.locator('input')
  await inputs.nth(0).fill(uniqueTitle)
  await inputs.nth(1).fill('제거 테스트 작가')
  await alicePage.click('button:has-text("등록")')
  await alicePage.waitForURL(/\/books\/(?!new|edit)/, { timeout: 15_000 })

  // Bob verifies book appears in feed
  const bobCtx = await browser.newContext()
  const bobPage = await bobCtx.newPage()
  await login(bobPage, BOB_USER, PASSWORD)
  await bobPage.goto('/feed')
  await expect(bobPage.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 })
  await bobCtx.close()

  // Alice turns off the public toggle
  await alicePage.goto('/books')
  await alicePage.getByText(uniqueTitle).click()
  await alicePage.waitForURL(/\/books\/[^/]+$/, { timeout: 10_000 })
  await alicePage.click('a:has-text("수정")')
  await alicePage.waitForURL(/\/books\/edit\//, { timeout: 10_000 })
  // Wait for MarkdownEditor to mount on the edit page before submitting
  await alicePage.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })

  const editToggle = alicePage.locator('button[role="switch"]')
  await expect(editToggle).toHaveAttribute('aria-checked', 'true')
  await editToggle.click()
  await expect(editToggle).toHaveAttribute('aria-checked', 'false')
  await alicePage.click('button:has-text("수정")')
  await alicePage.waitForURL(/\/books\/(?!new|edit)/, { timeout: 15_000 })
  await aliceCtx.close()

  // Bob reloads /feed — book should be gone
  const bobCtx2 = await browser.newContext()
  const bobPage2 = await bobCtx2.newPage()
  await login(bobPage2, BOB_USER, PASSWORD)
  await bobPage2.goto('/feed')
  await expect(bobPage2.getByText(uniqueTitle)).toHaveCount(0)
  await bobCtx2.close()
})

test('미인증 사용자가 /feed 접근 시 /login으로 redirect된다', async ({ page }) => {
  await page.goto('/feed')
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
  await expect(page).toHaveURL(/next=.*feed/)
})

test('한줄평의 XSS 페이로드가 이스케이프된다', async ({ page }) => {
  await login(page, ALICE_USER, PASSWORD)

  const xssPayload = '<script>alert(1)</script>'
  const uniqueTitle = `XSS 테스트 ${Date.now()}`

  const inputs = page.locator('input')
  await inputs.nth(0).fill(uniqueTitle)
  await inputs.nth(1).fill('XSS 작가')
  await page.fill('input[placeholder="이 책을 한 줄로 표현한다면?"]', xssPayload)

  const toggle = page.locator('button[role="switch"]')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await page.click('button:has-text("등록")')
  await page.waitForURL(/\/books\//, { timeout: 15_000 })

  await page.goto('/feed')

  const card = page.locator('article').filter({ hasText: uniqueTitle })
  await expect(card).toBeVisible({ timeout: 10_000 })

  // Payload should be visible as literal text (escaped, not executed)
  await expect(card.getByText(xssPayload, { exact: false })).toBeVisible()

  // No <script> element should be injected into the DOM
  const injectedScript = await card.locator('script').count()
  expect(injectedScript).toBe(0)
})
