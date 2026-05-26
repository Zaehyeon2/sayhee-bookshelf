'use client'

import { useRef, useImperativeHandle, useEffect, useState, forwardRef } from 'react'
import dynamic from 'next/dynamic'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

const Editor = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Editor),
  { ssr: false },
)

export interface MarkdownEditorHandle {
  getMarkdown: () => string
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useImperativeHandle(ref, () => ({
    getMarkdown: () => editorRef.current?.getInstance().getMarkdown() ?? '',
  }))

  useEffect(() => {
    setTheme(readTheme())
    const obs = new MutationObserver(() => setTheme(readTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <Editor
      // re-mount on theme switch so Toast UI applies the new skin cleanly
      key={theme}
      ref={editorRef}
      initialValue={initialValue || ' '}
      previewStyle="vertical"
      height="clamp(280px, 50vh, 480px)"
      initialEditType="wysiwyg"
      useCommandShortcut
      theme={theme}
    />
  )
})
MarkdownEditor.displayName = 'MarkdownEditor'
