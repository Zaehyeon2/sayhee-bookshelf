import { test, expect, type Page } from '@playwright/test'
import { E2E_ALICE } from './helpers'

async function login(page: Page, next = '/feed') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[autocomplete="username"]', E2E_ALICE.username)
  await page.fill('input[type="password"]', E2E_ALICE.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/feed/, { timeout: 10_000 })
}

test('/feed 기본은 책 탭 — 모두의 서재 heading 표시', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/feed/)
  await expect(page.getByRole('heading', { name: '모두의 서재' })).toBeVisible({ timeout: 10_000 })
})

test('/feed?type=movie 영화 탭 활성화 — 모두의 영화관 heading + 시드 영화 표시', async ({
  page,
}) => {
  await login(page, '/feed?type=movie')
  await page.waitForURL(/type=movie/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 영화관' })).toBeVisible({
    timeout: 10_000,
  })
  // Seeded movies for alice are titled "앨리스 movie N"
  await expect(page.getByText(/앨리스 movie/i).first()).toBeVisible({ timeout: 10_000 })
})

test('탭 클릭으로 영화 ↔ 책 전환', async ({ page }) => {
  await login(page)

  // Click movie tab — use href selector to avoid matching nav "영화관" link
  await page.click('a[href="/feed?type=movie"]')
  await expect(page).toHaveURL(/type=movie/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 영화관' })).toBeVisible({
    timeout: 10_000,
  })

  // Click book tab — use href selector to avoid ambiguity
  await page.click('a[href="/feed?type=book"]')
  await expect(page).toHaveURL(/type=book/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 서재' })).toBeVisible({
    timeout: 10_000,
  })
})

test('/feed?type=game 게임 탭 활성화 — 모두의 게임방 heading + 시드 게임 표시', async ({
  page,
}) => {
  await login(page, '/feed?type=game')
  await page.waitForURL(/type=game/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 게임방' })).toBeVisible({
    timeout: 10_000,
  })
  // Seeded games for alice are titled "앨리스 game N"
  await expect(page.getByText(/앨리스 game/i).first()).toBeVisible({ timeout: 10_000 })
})

test('탭 클릭으로 게임 ↔ 책 전환', async ({ page }) => {
  await login(page)

  // Click game tab — use href selector to avoid matching nav "게임" link
  await page.click('a[href="/feed?type=game"]')
  await expect(page).toHaveURL(/type=game/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 게임방' })).toBeVisible({
    timeout: 10_000,
  })

  // Click book tab — use href selector to avoid ambiguity
  await page.click('a[href="/feed?type=book"]')
  await expect(page).toHaveURL(/type=book/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '모두의 서재' })).toBeVisible({
    timeout: 10_000,
  })
})
