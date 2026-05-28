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
  /** 글자수 카운터를 표시할 한도. 미지정 시 카운터 표시 안 함. */
  maxLength?: number
}

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({ initialValue, maxLength }, ref) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null)
    // Toast UI Editor v3는 runtime setTheme을 지원하지 않으므로 theme 변경 시 `key`로 강제
    // remount해야 한다. unmount 직전 본문을 캡처해 새 initialValue로 넘기면 사용자 작성 중인
    // 본문이 손실되지 않는다.
    const [theme, setTheme] = useState<'light' | 'dark'>(readTheme)
    const [content, setContent] = useState(initialValue)
    const [length, setLength] = useState(initialValue.length)

    useImperativeHandle(ref, () => ({
      // editorRef가 아직 null이면 null 반환 — 빈 문자열 fallback은 의도치 않게 빈 본문을
      // 저장하므로 위험하다. 호출자는 null을 받으면 사용자에게 안내한다.
      getMarkdown: () => {
        const inst = editorRef.current?.getInstance()
        if (!inst) return null
        return (inst.getMarkdown() as string | undefined) ?? null
      },
    }))

    // 다크모드 토글 감지 — `document.documentElement.dataset.theme` 변화를 MutationObserver로
    // 관찰해 새 theme 반영 전 현재 본문을 캡처한다. MarkdownViewer와 동일한 패턴.
    useEffect(() => {
      const sync = () => {
        const next = readTheme()
        setTheme((prev) => {
          if (prev === next) return prev
          const inst = editorRef.current?.getInstance()
          if (inst) {
            const md = (inst.getMarkdown() as string | undefined) ?? ''
            setContent(md)
          }
          return next
        })
      }
      const obs = new MutationObserver(sync)
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      return () => obs.disconnect()
    }, [])

    const handleChange = () => {
      if (maxLength === undefined) return
      const inst = editorRef.current?.getInstance()
      if (!inst) return
      const md = (inst.getMarkdown() as string | undefined) ?? ''
      setLength(md.length)
    }

    const showCounter = maxLength !== undefined
    const overLimit = showCounter && length > (maxLength as number)
    const nearLimit = showCounter && !overLimit && length > (maxLength as number) * 0.8

    return (
      <div>
        <Editor
          key={theme}
          ref={editorRef}
          initialValue={content || ' '}
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
          onChange={handleChange}
        />
        {showCounter && (
          <div
            className={[
              'mt-2 px-3 text-right text-[12px] font-tabular tabular-nums',
              overLimit
                ? 'text-[var(--color-danger)] font-semibold'
                : nearLimit
                  ? 'text-[var(--color-toss-blue)]'
                  : 'text-[var(--color-text-weak)]',
            ].join(' ')}
            aria-live="polite"
          >
            {length.toLocaleString()} / {(maxLength as number).toLocaleString()}자
          </div>
        )}
      </div>
    )
  },
)
MarkdownEditor.displayName = 'MarkdownEditor'
