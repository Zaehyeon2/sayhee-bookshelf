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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setPref(readPreference())
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (readPreference() === 'system') applyPreference('system')
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]
    setPref(next)
    applyPreference(next)
  }

  if (!mounted) {
    return <span className="inline-block w-11 h-11" aria-hidden />
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`테마: ${LABEL[pref]}. 탭하면 변경됩니다.`}
      title={LABEL[pref]}
      className="inline-flex w-11 h-11 items-center justify-center rounded-[var(--radius-toss-sm)] text-[18px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/30"
    >
      <span aria-hidden>{ICON[pref]}</span>
    </button>
  )
}
