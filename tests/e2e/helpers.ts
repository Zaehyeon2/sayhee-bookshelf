import type { Page } from '@playwright/test'

/** global-setup이 시드하는 표준 e2e 계정 (scripts/seed-e2e.ts) */
export const E2E_ALICE = { username: 'e2e-alice', password: 'e2etestpass1234' }
export const E2E_BOB = { username: 'e2e-bob', password: 'e2etestpass1234' }

/**
 * 공용 로그인 헬퍼 — 각 spec에 복제된 login 함수의 단일 소스.
 * next 경로 도착은 정규식이 아닌 pathname 일치로 판정 (escape 누락/부분 일치 함정 회피).
 */
export async function login(
  page: Page,
  next: string,
  { username, password }: { username: string; password: string } = E2E_ALICE,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[autocomplete="username"]', username)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  // 30s: dev 서버가 next 경로를 첫 방문에서 컴파일하는 시간이 워커 경합 시 10s를 넘을 수 있음 (WSL2)
  await page.waitForURL((url) => url.pathname === next, { timeout: 30_000 })
}
