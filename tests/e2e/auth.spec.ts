import { test, expect } from '@playwright/test'

test('잘못된 비밀번호는 차단된다', async ({ page }) => {
  await page.goto('/books/new')
  await expect(page).toHaveURL(/\/login/)
  await page.fill('input[type="password"]', 'wrong-password')
  await page.click('button[type="submit"]')
  await expect(page.getByText('로그인 실패')).toBeVisible({ timeout: 3000 })
})
