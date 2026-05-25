'use client'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import dynamic from 'next/dynamic'
import '@toast-ui/editor/dist/toastui-editor.css'

const Editor = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Editor),
  { ssr: false }
)

export interface MarkdownEditorHandle {
  getMarkdown: () => string
}

interface Props {
  initialValue: string
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(({ initialValue }, ref) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)
  useImperativeHandle(ref, () => ({
    getMarkdown: () => editorRef.current?.getInstance().getMarkdown() ?? '',
  }))
  return (
    <Editor
      ref={editorRef}
      initialValue={initialValue || ' '}
      previewStyle="vertical"
      height="400px"
      initialEditType="wysiwyg"
      useCommandShortcut
    />
  )
})
MarkdownEditor.displayName = 'MarkdownEditor'
