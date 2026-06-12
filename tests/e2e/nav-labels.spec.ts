import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('데스크톱 nav에 "내 책장", "내 영화관" 라벨 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '/')
  const desktopNav = page.getByTestId('desktop-nav')
  await expect(desktopNav.getByRole('link', { name: /내 책장/ })).toBeVisible()
  await expect(desktopNav.getByRole('link', { name: /내 영화관/ })).toBeVisible()
})

test('데스크톱 nav에 "내 게임" 라벨 노출', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, '/')
  const desktopNav = page.getByTestId('desktop-nav')
  await expect(desktopNav.getByRole('link', { name: /내 게임/ })).toBeVisible()
})
