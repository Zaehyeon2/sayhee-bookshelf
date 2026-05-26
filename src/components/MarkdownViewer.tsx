'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
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

// Toast UI는 기본 DOMPurify 기반 sanitizer를 사용해 <script> 등을 제거한다. 그러나
// `[click](javascript:alert(1))` 같은 마크다운 링크의 위험 URL scheme는 라이브러리 버전에
// 따라 통과될 수 있으므로 client-side에서 한 번 더 정제한다 — defense-in-depth.
const SAFE_SCHEMES = /^(https?:|mailto:|tel:|\/|#|\?)/i

function sanitizeRenderedLinks(root: HTMLElement) {
  const anchors = root.querySelectorAll('a[href]')
  anchors.forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    // 상대 경로/앵커는 허용, 위험 scheme는 제거
    if (href && !SAFE_SCHEMES.test(href.trim())) {
      a.removeAttribute('href')
      a.setAttribute('data-blocked-href', href)
    }
    // 외부 링크 안전성 보강
    a.setAttribute('rel', 'noopener noreferrer ugc')
    a.setAttribute('target', '_blank')
  })
}

export function MarkdownViewer({ initialValue }: { initialValue: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(readTheme())
    const obs = new MutationObserver(() => setTheme(readTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // 렌더 후 anchor를 한 번 더 sanitize. ViewerMutationObserver로 재렌더링 시에도 적용.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const apply = () => sanitizeRenderedLinks(root)
    apply()
    const mo = new MutationObserver(apply)
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="prose-toss">
      <Viewer key={theme} initialValue={initialValue} theme={theme} />
    </div>
  )
}
