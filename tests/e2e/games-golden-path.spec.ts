import { test, expect, type Page } from '@playwright/test'
import { login as helperLogin } from './helpers'

async function login(page: Page) {
  await helperLogin(page, '/games/new')
  // Wait for the Toast UI MarkdownEditor dynamic import to finish mounting
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })
}

test('게임 생성 → 목록 → 수정 → 삭제 golden path', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const uniqueTitle = `E2E 게임 ${Date.now()}`

  // 생성 — title(maxlength=200), developer(maxlength=100) — search bar is nth(0) so use maxlength selectors
  await page.locator('input[maxlength="200"]').fill(uniqueTitle)
  await page.locator('input[maxlength="100"]').fill('테스트 개발사')

  await page.click('button:has-text("등록")')
  // Navigate to game detail page (not /games/new or /games/edit/*)
  await page.waitForURL(/\/games\/(?!new|edit)/, { timeout: 15_000 })

  // 목록 확인
  await page.goto('/games')
  await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10_000 })

  // 상세 페이지로 이동
  await page.getByText(uniqueTitle).first().click()
  await page.waitForURL(/\/games\/[^/]+$/, { timeout: 10_000 })

  // 수정 페이지로 이동 (href="/games/edit/{id}")
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/games\/edit\/\d+/, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })

  // 제목 수정
  const titleInput = page.locator('input[maxlength="200"]')
  await titleInput.fill(`${uniqueTitle} 수정됨`)
  await page.click('button:has-text("수정")')
  // After edit, redirect to game detail
  await page.waitForURL(/\/games\/(?!new|edit)/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: `${uniqueTitle} 수정됨` })).toBeVisible({
    timeout: 10_000,
  })

  // 수정 페이지에서 삭제
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/games\/edit\/\d+/, { timeout: 10_000 })
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 15_000 })

  // 삭제 버튼 → ConfirmDialog 열림
  await page.click('button:has-text("삭제")')
  await expect(page.getByText('이 게임 기록을 삭제할까요?')).toBeVisible({ timeout: 5_000 })
  // Dialog 내부 확인 버튼
  await page.click('[role="dialog"] button:has-text("삭제")')

  // /games 목록으로 이동 + 삭제된 제목 없음 확인
  await page.waitForURL(/\/games(\?.*)?$/, { timeout: 10_000 })
  await page.reload()
  await expect(page.getByText(`${uniqueTitle} 수정됨`)).toHaveCount(0, { timeout: 10_000 })
})
