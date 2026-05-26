'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export function TagInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!input.trim()) {
      setSuggestions([])
      return
    }
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/suggest?q=${encodeURIComponent(input.trim())}`)
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { tags?: unknown }
        const raw = Array.isArray(data.tags) ? (data.tags as string[]) : []
        if (!cancelled) setSuggestions(raw.filter((t) => !value.includes(t)))
      } catch {
        // ignore
      }
    }, 200)
    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input, value])

  function add(t: string) {
    const trimmed = t.trim()
    if (!trimmed || value.includes(trimmed)) return
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
