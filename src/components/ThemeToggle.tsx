'use client'

import { type ReactNode, useEffect, useState } from 'react'

type Preference = 'system' | 'light' | 'dark'

const ORDER: Preference[] = ['system', 'light', 'dark']
const LABEL: Record<Preference, string> = {
  system: '시스템 테마',
  light: '라이트 모드',
  dark: '다크 모드',
}

const svg = (children: ReactNode) => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

const ICON: Record<Preference, ReactNode> = {
  // monitor — follows OS preference
  system: svg(
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>,
  ),
  // sun
  light: svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>,
  ),
  // crescent moon
  dark: svg(<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />),
}

function readPreference(): Preference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'system'
}

function applyPreference(pref: Preference) {
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = pref === 'system' ? (osDark ? 'dark' : 'light') : pref
  document.documentElement.dataset.theme = resolved
  if (pref === 'system') window.localStorage.removeItem('theme')
  else window.localStorage.setItem('theme', pref)
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Preference>('system')
  // mount되기 전까지는 아이콘을 invisible로 둬서 'system → 실제값' 깜빡임을 막는다.
  // SSR HTML과 mount 직후 client HTML이 동일하게 'system' 아이콘이라 hydration도 안전.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPref(readPreference())
    setMounted(true)

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onOsChange = () => {
      if (readPreference() === 'system') {
        applyPreference('system')
        setPref('system')
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') setPref(readPreference())
    }
    mql.addEventListener('change', onOsChange)
    window.addEventListener('storage', onStorage)
    return () => {
      mql.removeEventListener('change', onOsChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]

  function cycle() {
    setPref(next)
    applyPreference(next)
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`현재 ${LABEL[pref]}. 누르면 ${LABEL[next]}로 전환됩니다.`}
      title={LABEL[pref]}
      suppressHydrationWarning
      className="inline-flex w-11 h-11 items-center justify-center rounded-[var(--radius-field)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <span aria-hidden style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {ICON[pref]}
      </span>
    </button>
  )
}
