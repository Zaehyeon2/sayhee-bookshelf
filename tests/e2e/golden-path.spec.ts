import { test, expect } from '@playwright/test'

test('로그인 → 새 글 작성 → 목록에 노출', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="password"]', 'changeme')  // .env.local의 평문
  await Promise.all([
    page.waitForURL('**/admin/new'),
    page.click('button[type="submit"]'),
  ])

  const inputs = page.locator('input')
  await inputs.nth(0).fill('E2E 책 제목')   // 제목
  await inputs.nth(1).fill('테스트 작가')   // 작가
  // 장르·날짜는 기본값 사용
  await page.click('button:has-text("등록")')

  // submit 후 책 상세 URL로 이동 (한글 slug segment의 dev 서버 encoding 변동이 있어
  // detail 페이지 heading은 직접 검증하지 않고 URL 도달 + 목록 노출로 검증)
  await page.waitForURL(/\/books\//, { timeout: 15_000 })

  await page.goto('/books')
  await expect(page.getByText('E2E 책 제목')).toBeVisible({ timeout: 10_000 })
})
