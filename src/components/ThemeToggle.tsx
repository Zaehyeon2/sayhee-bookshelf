'use client'

import { useEffect, useState } from 'react'

type Preference = 'system' | 'light' | 'dark'

const ORDER: Preference[] = ['system', 'light', 'dark']
const LABEL: Record<Preference, string> = {
  system: '시스템 테마',
  light: '라이트 모드',
  dark: '다크 모드',
}
const ICON: Record<Preference, string> = {
  system: '💻',
  light: '☀️',
  dark: '🌙',
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
      className="inline-flex w-11 h-11 items-center justify-center rounded-[var(--radius-toss-sm)] text-[18px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <span aria-hidden style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {ICON[pref]}
      </span>
    </button>
  )
}
