import { test, expect, type Page } from '@playwright/test'
import { login } from './helpers'

// 폼/에디터 상태가 클라이언트 네비게이션(Link) 후 잔존하던 버그의 회귀 가드.
// page.goto는 하드 내비라 무조건 리셋되므로, 실제 사용자 흐름(Link 클릭)만 사용한다.
//
// 주의: Next 16 라우터는 떠난 세그먼트 DOM을 hidden으로 보존(React Activity)하므로
// 셀렉터는 반드시 :visible로 한정 — 안 그러면 hidden 사본(이전 페이지 폼)을 잡는다.

const titleInput = (page: Page) => page.locator('input[maxlength="200"]:visible')
const editor = (page: Page) =>
  page.locator('.toastui-editor-ww-container:visible .ProseMirror').first()

test('시나리오 A: 글 작성 중 새 책으로 이동해도 입력 잔존 없음', async ({ page }) => {
  test.setTimeout(60_000) // cold dev 서버 첫 컴파일 대비
  await login(page, '/writings/new')

  await titleInput(page).fill('잔존테스트-글제목')
  await editor(page).waitFor({ state: 'visible', timeout: 10_000 })
  await editor(page).click()
  await page.keyboard.type('이것은 글 본문 내용 ABC')

  // 책 작성 화면으로 클라이언트 네비 (nav → 목록 → 새 책)
  await page
    .getByRole('link', { name: /내 책장/ })
    .first()
    .click()
  await page.waitForURL('**/books')
  await page
    .getByRole('link', { name: /새 책|새 독후감/ })
    .first()
    .click()
  await page.waitForURL('**/books/new')

  await expect(titleInput(page)).toHaveValue('')
  await expect(editor(page)).toHaveText('')
})

test('시나리오 B: 새 책 작성 중 목록 갔다가 복귀해도 입력 잔존 없음', async ({ page }) => {
  test.setTimeout(60_000) // cold dev 서버 첫 컴파일 대비
  await login(page, '/books/new')

  await titleInput(page).fill('잔존테스트-책제목')
  await editor(page).waitFor({ state: 'visible', timeout: 10_000 })
  await editor(page).click()
  await page.keyboard.type('책 본문 내용 XYZ')

  // 목록으로 갔다가 다시 새 책 (동일 타입 재진입)
  await page
    .getByRole('link', { name: /내 책장/ })
    .first()
    .click()
  await page.waitForURL('**/books')
  await page
    .getByRole('link', { name: /새 책|새 독후감/ })
    .first()
    .click()
  await page.waitForURL('**/books/new')

  await expect(titleInput(page)).toHaveValue('')
  await expect(editor(page)).toHaveText('')
})
