'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Props {
  displayName: string
  role: 'admin' | 'member'
}

export function MobileMenu({ displayName, role }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer h-11 w-11 inline-flex items-center justify-center rounded-[var(--radius-toss-sm)] text-[20px] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px] z-50">
          <Link
            href="/books"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            📚 내 책장
          </Link>
          <Link
            href="/movies"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            🎬 내 영화관
          </Link>
          <Link
            href="/works"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            🔍 작품 검색
          </Link>
          <Link
            href="/writings"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            ✏️ 글방
          </Link>
          <div className="border-t border-[var(--color-border-subtle)] my-1" />
          <div className="px-4 py-2 text-[12px] text-[var(--color-text-muted)]">{displayName}</div>
          <Link
            href="/settings/profile"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            프로필 변경
          </Link>
          <Link
            href="/settings/password"
            onClick={close}
            className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
          >
            비밀번호 변경
          </Link>
          {role === 'admin' && (
            <Link
              href="/admin/users"
              onClick={close}
              className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
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
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-2)]"
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
