'use client'

import { useRef, useImperativeHandle, useEffect, useState, forwardRef } from 'react'
import dynamic from 'next/dynamic'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

const Editor = dynamic(() => import('@toast-ui/react-editor').then((m) => m.Editor), { ssr: false })

export interface MarkdownEditorHandle {
  /** 인스턴스가 아직 준비되지 않았으면 null. 호출자는 null을 받으면 사용자에게 재시도 안내. */
  getMarkdown: () => string | null
}

interface Props {
  initialValue: string
}

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(({ initialValue }, ref) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)
  // 마운트 시점 테마. key prop으로 사용하지 않는다 — 테마 토글 시 unmount/remount는
  // 사용자가 작성 중인 본문을 잃을 수 있으므로, 한 번 마운트한 인스턴스를 유지.
  // 다음 페이지 진입 시 새 테마가 자연스럽게 반영된다.
  const [theme] = useState<'light' | 'dark'>(readTheme)

  useImperativeHandle(ref, () => ({
    // editorRef가 아직 null이면 null 반환 — 빈 문자열 fallback은 의도치 않게 빈 본문을
    // 저장하므로 위험하다. 호출자는 null을 받으면 사용자에게 안내한다.
    getMarkdown: () => {
      const inst = editorRef.current?.getInstance()
      if (!inst) return null
      return (inst.getMarkdown() as string | undefined) ?? null
    },
  }))

  // mount 후에는 theme이 바뀌어도 시각적 차이만 남으며 데이터는 안전.
  // 향후 Toast UI가 runtime setTheme을 지원하면 여기서 호출하면 됨.
  useEffect(() => {
    /* no-op: 테마 동기화는 page reload/nav에 의존 */
  }, [])

  return (
    <Editor
      ref={editorRef}
      initialValue={initialValue || ' '}
      previewStyle="vertical"
      height="clamp(280px, 50vh, 480px)"
      initialEditType="wysiwyg"
      useCommandShortcut
      theme={theme}
      toolbarItems={[
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'link'],
        ['code', 'codeblock'],
      ]}
    />
  )
})
MarkdownEditor.displayName = 'MarkdownEditor'
