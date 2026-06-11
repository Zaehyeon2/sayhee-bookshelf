'use client'

import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * 라우트 재진입 시 children을 새 인스턴스로 만드는 래퍼.
 *
 * Next 16 라우터는 떠난 세그먼트를 unmount하지 않고 보존(React Activity)하므로
 * new/edit 폼의 입력 상태가 재진입 후에도 남는다 — key/template.tsx로는 못 막음
 * (hidden 보존이라 reconcile 자체가 안 일어남). Activity는 hidden 전환 시 effects를
 * cleanup하고 다시 보일 때 재실행하므로, 그 재실행을 신호로 children key를 올려
 * 강제 remount한다. 첫 마운트는 ref로 건너뛰어 이중 마운트 비용 없음.
 */
export function FreshOnVisible({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0)
  const mountedOnce = useRef(false)

  useEffect(() => {
    if (mountedOnce.current) {
      setEpoch((e) => e + 1)
    } else {
      mountedOnce.current = true
    }
  }, [])

  return <Fragment key={epoch}>{children}</Fragment>
}
