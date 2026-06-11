'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SubItem {
  href: string
  label: string
}

interface Props {
  href: string
  label: string
  subItems: SubItem[]
}

/**
 * 데스크톱 네비 항목 + hover/focus 드롭다운.
 * 본 링크 클릭은 기존처럼 목록으로 이동, 마우스 올리거나 키보드 포커스가 들어오면
 * 서브 메뉴(통계 보기 등) 노출.
 *
 * CSS group-hover만으로는 클릭 후 마우스가 영역 위에 남아 드롭다운이 안 닫히는
 * 문제가 있어 상태 기반으로 제어 — 링크 클릭·라우트 변경 시 즉시 닫는다.
 */
export function NavDropdown({ href, label, subItems }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // soft navigation 후에도 layout은 유지되므로 라우트 변경을 감지해 닫음
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 변경을 트리거로 쓰는 의도적 의존성
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const close = () => setOpen(false)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus 감지용 래퍼 — 실제 인터랙션 타겟은 내부 Link들
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // 포커스가 드롭다운 바깥으로 나갈 때만 닫음 (focus-within 동등)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) close()
      }}
    >
      <Link
        href={href}
        onClick={close}
        className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        {label}
        <span
          aria-hidden
          className={`ml-1 text-[10px] text-[var(--color-text-weak)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </Link>
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="w-44 rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
            {subItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block px-4 py-2.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-toss-blue)]/50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
