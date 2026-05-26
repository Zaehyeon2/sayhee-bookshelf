import { test, expect } from '@playwright/test'

test('등록 → 상세 → 수정 → 삭제 모달 → 목록에서 사라짐', async ({ page }) => {
  // 로그인
  await page.goto('/login')
  await page.fill('input[type="password"]', 'changeme')
  await Promise.all([
    page.waitForURL('**/books/new'),
    page.click('button[type="submit"]'),
  ])

  // 등록
  const inputs = page.locator('input')
  const uniqueTitle = `E2E 삭제 테스트 ${Date.now()}`
  await inputs.nth(0).fill(uniqueTitle)
  await inputs.nth(1).fill('삭제 작가')
  await page.click('button:has-text("등록")')
  await page.waitForURL(/\/books\//, { timeout: 15_000 })

  // 상세에서 "수정" 클릭 → 편집 페이지로
  await page.click('a:has-text("수정")')
  await page.waitForURL(/\/admin\/edit\//, { timeout: 10_000 })

  // 폼 하단 "삭제" → 모달 → "삭제" 확정
  await page.click('button:has-text("삭제")') // 폼의 빨간 삭제 (모달 열기)
  await expect(page.getByText('이 독후감을 삭제할까요?')).toBeVisible({ timeout: 5_000 })
  // 모달 안의 두 번째 "삭제" 버튼 (confirm)
  await page.click('[role="dialog"] button:has-text("삭제")')

  // /books로 이동 + 사라짐 확인
  await page.waitForURL(/\/books(\?.*)?$/, { timeout: 10_000 })
  await expect(page.getByText(uniqueTitle)).toHaveCount(0)
})
