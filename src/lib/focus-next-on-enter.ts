import type { KeyboardEvent } from 'react'

// 포커스 순회 대상: 숨김 input 제외, tabindex=-1 제외.
const FOCUSABLE =
  'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])'

/**
 * 폼 내 single-line input에서 Enter = 암묵적 제출(implicit submission)을 막고
 * 대신 DOM 순서상 다음 focusable 요소로 포커스를 옮긴다.
 *
 * - textarea/마크다운 에디터·버튼·체크박스는 기본 동작 유지 (Enter가 의미를 가짐).
 * - 자식이 이미 Enter를 가로챘으면(TagInput 태그 추가, cmdk 검색 항목 선택)
 *   defaultPrevented가 true이므로 건너뛴다.
 *
 * `<form onKeyDown={focusNextOnEnter}>`로 연결해 사용.
 */
export function focusNextOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented) return

  const target = e.target as HTMLElement
  if (target.tagName !== 'INPUT') return
  const type = (target as HTMLInputElement).type
  if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') return

  e.preventDefault()

  const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
  )
  const idx = focusable.indexOf(target)
  if (idx === -1) return
  focusable[idx + 1]?.focus()
}
