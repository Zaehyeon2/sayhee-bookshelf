'use client'

import { toast } from 'sonner'
import type { RefObject } from 'react'
import type { MarkdownEditorHandle } from './MarkdownEditor'

/**
 * 에디터에서 마크다운을 꺼낸다. 에디터 미준비·길이 초과 시 toast 후 null —
 * 호출부는 null이면 그대로 return.
 */
export function getEditorMarkdownOrToast(
  editorRef: RefObject<MarkdownEditorHandle | null>,
  maxLength?: number,
): string | null {
  const content = editorRef.current?.getMarkdown()
  if (content == null) {
    toast.error('에디터가 준비되지 않았습니다. 다시 시도해주세요.')
    return null
  }
  if (maxLength !== undefined && content.length > maxLength) {
    toast.error(
      `본문이 너무 깁니다 (${content.length.toLocaleString()} / ${maxLength.toLocaleString()}자)`,
    )
    return null
  }
  return content
}

/**
 * JSON body POST/PATCH. 실패 시 서버 error 메시지(없으면 '저장 실패') toast 후 null,
 * 성공 시 응답 JSON 반환.
 */
export async function saveJsonOrToast<T = { slug: string }>(
  url: string,
  method: 'POST' | 'PATCH',
  payload: unknown,
): Promise<T | null> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    toast.error(data.error || '저장 실패')
    return null
  }
  return res.json() as Promise<T>
}

/** DELETE 요청. 실패 시 toast 후 false. */
export async function deleteOrToast(url: string): Promise<boolean> {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    toast.error(data.error || '삭제 실패')
    return false
  }
  return true
}
