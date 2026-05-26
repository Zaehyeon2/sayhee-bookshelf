'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

const Viewer = dynamic(() => import('@toast-ui/react-editor').then((m) => m.Viewer), {
  ssr: false,
  loading: () => <div className="text-[var(--color-text-weak)] text-[14px]">불러오는 중…</div>,
})

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function MarkdownViewer({ initialValue }: { initialValue: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    setTheme(readTheme())
    const obs = new MutationObserver(() => setTheme(readTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="prose-toss">
      <Viewer key={theme} initialValue={initialValue} theme={theme} />
    </div>
  )
}
