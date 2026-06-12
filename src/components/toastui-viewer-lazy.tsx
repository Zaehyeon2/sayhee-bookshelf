'use client'

// 뷰어 전용 빌드(~433KB JS + 13.6KB CSS)를 직접 사용 — @toast-ui/react-editor index를 거치면
// 풀 에디터 번들(~940KB JS + 169KB CSS)이 통째로 딸려온다. 상세(읽기) 페이지가 에디터를
// 내려받지 않도록 vanilla Viewer를 얇게 감싼다. 에디터 CSS는 toastui-editor-lazy가 폼에서 로드.
import '@toast-ui/editor/dist/toastui-editor-viewer.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'
import { useEffect, useRef } from 'react'
import ToastViewer from '@toast-ui/editor/dist/toastui-editor-viewer'

interface Props {
  initialValue: string
  theme: 'light' | 'dark'
}

export default function ToastuiViewerLazy({ initialValue, theme }: Props) {
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!elRef.current) return
    const viewer = new ToastViewer({ el: elRef.current, initialValue, theme })
    return () => viewer.destroy()
  }, [initialValue, theme])

  return <div ref={elRef} />
}
