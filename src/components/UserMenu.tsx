'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  displayName: string
  role: 'admin' | 'member'
}

/**
 * 데스크톱 우측 사용자 메뉴.
 * 이전 <details> 구현은 soft navigation 후에도 열린 채 남는 문제가 있어
 * 상태 기반으로 전환 — 항목 클릭·라우트 변경·바깥 클릭·Esc에서 닫는다.
 * (MobileMenu와 동일 패턴.)
 */
export function UserMenu({ displayName, role }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 변경을 트리거로 쓰는 의도적 의존성
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeydown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeydown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-strong)] rounded-[var(--radius-field)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        {displayName} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[var(--shadow-float)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
          <Link
            href="/settings/profile"
            onClick={close}
            className="block mx-1 px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--color-surface-2)]"
          >
            프로필 변경
          </Link>
          <Link
            href="/settings/password"
            onClick={close}
            className="block mx-1 px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--color-surface-2)]"
          >
            비밀번호 변경
          </Link>
          {role === 'admin' && (
            <Link
              href="/admin/users"
              onClick={close}
              className="block mx-1 px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--color-surface-2)]"
            >
              사용자 관리
            </Link>
          )}
          <form
            action="/api/logout"
            method="POST"
            className="border-t border-[var(--color-border-subtle)] mt-1 pt-1"
          >
            <button
              type="submit"
              className="mx-1 w-[calc(100%-8px)] text-left px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--color-surface-2)]"
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
