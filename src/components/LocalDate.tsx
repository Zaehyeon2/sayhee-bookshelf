'use client'

import { useEffect, useState } from 'react'

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatUTC(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function formatLocal(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 타임스탬프를 YYYY-MM-DD로 표시. SSR 시점에는 UTC로 렌더링해 hydration 충돌을 막고,
 * client mount 후에는 사용자 로컬 타임존으로 교체한다. 한국 사용자가 KST 자정 직전에
 * 작성한 글이 UTC 기준 전일로 표시되던 버그 수정.
 */
export function LocalDate({ ts }: { ts: number }) {
  const [text, setText] = useState(() => formatUTC(ts))
  useEffect(() => {
    setText(formatLocal(ts))
  }, [ts])
  return <>{text}</>
}
