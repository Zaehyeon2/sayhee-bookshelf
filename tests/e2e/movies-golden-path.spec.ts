import { test, expect, type Page } from '@playwright/test'

const ALICE_USER = 'e2e-alice'
const PASSWORD = 'e2etestpass1234'

async function login(page: Page) {
  await page.goto('/login?next=/movies/new')
  await page.fill('input[autocomplete="username"]', ALICE_USER)
  await page.fill('input[type="password"]', PASSWORD)
  await Promise.all([page.waitForURL('**/movies/new'), page.click('button[type="submit"]')])
  // Wait for the Toast UI MarkdownEditor dynamic import to finish mounting
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })
}

test('영화 생성 → 목록 → 수정 → 삭제 golden path', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const uniqueTitle = `E2E 영화 ${Date.now()}`

  // 생성 — inputs: [0]=제목, [1]=감독 (장르는 select, 날짜는 type="date")
  const visibleInputs = page.locator('input:not([type="hidden"]):not([type="date"])')
  await visibleInputs.nth(0).fill(uniqueTitle)
  await visibleInputs.nth(1).fill('테스트 감독')

  await page.click('button:has-text("등록")')
  // Navigate to movie detail page (not /movies/new or /movies/edit/*)
  await page.waitForURL(/\/movies\/(?!new|edit)/, { timeout: 15_000 })

  // 목록 확인
  await page.goto('/movies')
  await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 })

  // 상세 페이지로 이동
  await page.getByText(uniqueTitle).first().click()
  await page.waitForURL(/\/movies\/[^/]+$/, { timeout: 10_000 })

  // 수정 페이지로 이동 (href="/movies/edit/{id}")
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/movies\/edit\/\d+/, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })

  // 제목 수정
  const titleInput = page.locator('input:not([type="hidden"]):not([type="date"])').first()
  await titleInput.fill(`${uniqueTitle} 수정됨`)
  await page.click('button:has-text("수정")')
  // After edit, redirect to movie detail
  await page.waitForURL(/\/movies\/(?!new|edit)/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: `${uniqueTitle} 수정됨` })).toBeVisible({
    timeout: 10_000,
  })

  // 수정 페이지에서 삭제
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/movies\/edit\/\d+/, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })

  // 삭제 버튼 → ConfirmDialog 열림
  await page.click('button:has-text("삭제")')
  await expect(page.getByText('이 영화 기록을 삭제할까요?')).toBeVisible({ timeout: 5_000 })
  // Dialog 내부 확인 버튼
  await page.click('[role="dialog"] button:has-text("삭제")')

  // /movies 목록으로 이동 + 삭제된 제목 없음 확인
  await page.waitForURL(/\/movies(\?.*)?$/, { timeout: 10_000 })
  await expect(page.getByText(`${uniqueTitle} 수정됨`)).toHaveCount(0)
})
