'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

function normalize(s: string): string {
  return s.trim().toLocaleLowerCase()
}

export function TagInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // value를 useEffect의 의존성에 넣지 않기 위해 ref로 stale-safe하게 참조.
  // 모든 add/remove마다 suggestions를 다시 fetch하던 중복 호출을 제거한다.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = input.trim()
    if (!trimmed) {
      setSuggestions([])
      return
    }
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/suggest?q=${encodeURIComponent(trimmed)}`)
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { tags?: unknown }
        const raw = Array.isArray(data.tags) ? (data.tags as string[]) : []
        const taken = new Set(valueRef.current.map(normalize))
        if (!cancelled) setSuggestions(raw.filter((t) => !taken.has(normalize(t))))
      } catch {
        // ignore
      }
    }, 200)
    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input])

  function add(t: string) {
    const trimmed = t.trim()
    if (!trimmed) return
    // 대소문자/공백 차이를 무시하고 중복 검사.
    const existing = new Set(value.map(normalize))
    if (existing.has(normalize(trimmed))) return
    onChange([...value, trimmed])
    setInput('')
    setSuggestions([])
  }
  function remove(t: string) {
    onChange(value.filter((x) => x !== t))
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] pl-3 pr-2 py-1 text-[12px] font-medium"
            >
              #{t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`${t} 제거`}
                className="text-[var(--color-text-weak)] hover:text-[var(--color-text-strong)] inline-flex items-center justify-center w-6 h-6 -mr-1 leading-none text-[16px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        maxLength={30}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(input)
          } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
            remove(value[value.length - 1])
          }
        }}
        placeholder="태그 입력 후 Enter"
        className="w-full h-11 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
      />
      {suggestions.length > 0 && (
        <ul className="mt-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-toss-hover)] overflow-hidden">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => add(s)}
                className="block w-full px-4 py-2 text-left text-[14px] text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)]"
              >
                #{s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
