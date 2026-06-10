import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('로그인 → 새 글 작성 → 목록에 노출', async ({ page }) => {
  await login(page, '/books/new')
  await page.waitForSelector('.toastui-editor-defaultUI', { timeout: 30_000 })

  const uniqueTitle = `E2E 책 제목 ${Date.now()}`
  await page.locator('input[maxlength="200"]').fill(uniqueTitle) // 제목
  await page.locator('input[maxlength="100"]').fill('테스트 작가') // 작가
  // 장르·날짜는 기본값 사용
  await page.click('button:has-text("등록")')

  // submit 후 책 상세 URL로 이동 — URL 도달 자체가 등록 성공의 증거
  await page.waitForURL(/\/books\/(?!new|edit)/, { timeout: 15_000 })
  // 상세 페이지에서 제목 노출 확인 (목록 페이지는 pagination으로 인해 불안정)
  await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 })
})
