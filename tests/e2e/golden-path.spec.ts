import { test, expect } from '@playwright/test'

test('로그인 → 새 글 작성 → 목록에 노출', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="password"]', 'changeme')  // .env.local의 평문
  await page.click('button[type="submit"]')

  await page.goto('/admin/new')
  const inputs = page.locator('input')
  await inputs.nth(0).fill('E2E 책 제목')   // 제목
  await inputs.nth(1).fill('테스트 작가')   // 작가
  // 장르·날짜는 기본값 사용
  await page.click('button:has-text("등록")')

  await expect(page).toHaveURL(/\/books\//)
  await expect(page.getByRole('heading', { name: 'E2E 책 제목' })).toBeVisible()

  await page.goto('/books')
  await expect(page.getByText('E2E 책 제목')).toBeVisible()
})
