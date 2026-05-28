import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/books/new')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/books/new'), page.click('button[type="submit"]')])
  // Wait for the Toast UI MarkdownEditor dynamic import to finish mounting.
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })
}

// Stub the external metadata APIs so we don't hit the real upstream
// (NL-KR Open API) during e2e runs. Returns a deterministic single-item
// result keyed on the test's title.
async function stubExternalApis(
  page: Page,
  item: {
    externalId: string
    title: string
    byline: string
    year?: number
    genre?: string
    coverUrl?: string
  },
) {
  await page.route('**/api/external/books/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'naver',
        items: [item],
      }),
    })
  })
  await page.route('**/api/books/by-external**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ counts: {} }),
    })
  })
}

test.describe('External book search → autofill → save', () => {
  test('new book flow with stubbed external API', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)

    const uniqueTitle = `해리 포터와 마법사의 돌 ${Date.now()}`
    await stubExternalApis(page, {
      externalId: `9788983920775-${Date.now()}`,
      title: uniqueTitle,
      byline: '조앤 K. 롤링',
      year: 1999,
      genre: '소설',
      // Cover URL points at a stable test image; image load failure is
      // gracefully hidden by the onError handler in SearchDropdown / SelectedChip,
      // but the detail page renders next/image which we don't gate on rendering
      // completion (we only check the <img> exists in the DOM).
      coverUrl: 'https://image.nl.go.kr/test.jpg',
    })

    // The search bar lives at the top of the form. Type the query to trigger
    // the debounced fetch → SearchDropdown opens with stubbed results.
    const searchInput = page.getByPlaceholder(/제목으로 검색/)
    await searchInput.fill('해리포터')

    // Wait for the dropdown to render the stubbed result.
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 })

    // Click the result → SelectedChip swaps in, BookForm onSelect autofills.
    await page.getByText(uniqueTitle).first().click()

    // Verify chip rendered (다시 검색 button visible, × button has aria-label).
    await expect(page.getByRole('button', { name: '다시 검색' })).toBeVisible()
    await expect(page.getByRole('button', { name: '외부 정보 초기화' })).toBeVisible()

    // Verify the title field was autofilled. BookForm doesn't associate the
    // <label> with the <input>, so getByLabel won't work — use maxlength
    // attribute as a stable selector (title=200, author=100, oneLine=150).
    const titleInput = page.locator('input[maxlength="200"]')
    const authorInput = page.locator('input[maxlength="100"]')
    await expect(titleInput).toHaveValue(uniqueTitle)
    await expect(authorInput).toHaveValue('조앤 K. 롤링')

    // Submit — content can stay empty (BookForm reads from MarkdownEditor ref
    // which returns '' when untouched, which is valid). Click the 등록 button.
    await page.click('button:has-text("등록")')

    // After submit, redirect to /books/{slug}.
    await page.waitForURL(/\/books\/(?!new|edit)[^/]+$/, { timeout: 15_000 })

    // Verify the detail page renders the cover image (alt="{title} 표지").
    // next/image renders <img> with the alt prop preserved.
    await expect(page.locator(`img[alt*="해리 포터"]`).first()).toBeVisible({ timeout: 10_000 })
  })

  test('chip × clears external metadata but keeps title field value', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)

    const uniqueTitle = `TestBook ${Date.now()}`
    await stubExternalApis(page, {
      externalId: `9999-${Date.now()}`,
      title: uniqueTitle,
      byline: 'TestAuthor',
      year: 2024,
      genre: '소설',
    })

    await page.getByPlaceholder(/제목으로 검색/).fill('TestBook')
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 })
    await page.getByText(uniqueTitle).first().click()

    // Chip rendered, title autofilled
    await expect(page.getByRole('button', { name: '다시 검색' })).toBeVisible()
    const titleInput = page.locator('input[maxlength="200"]')
    await expect(titleInput).toHaveValue(uniqueTitle)

    // Click × — BookForm.onClear nulls isbn/coverUrl/externalSource but does
    // NOT reset title/author, so the user's editable fields are preserved.
    await page.getByRole('button', { name: '외부 정보 초기화' }).click()

    // Title still preserved on the form.
    await expect(titleInput).toHaveValue(uniqueTitle)

    // Chip is gone, search input visible again.
    await expect(page.getByRole('button', { name: '다시 검색' })).toBeHidden()
    await expect(page.getByPlaceholder(/제목으로 검색/)).toBeVisible()
  })
})
