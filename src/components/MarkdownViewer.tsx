'use client'

import dynamic from 'next/dynamic'

const Viewer = dynamic(
  () => import('@toast-ui/react-editor').then((m) => m.Viewer),
  { ssr: false, loading: () => <div className="text-neutral-400">불러오는 중…</div> }
)

export function MarkdownViewer({ initialValue }: { initialValue: string }) {
  return <Viewer initialValue={initialValue} />
}
