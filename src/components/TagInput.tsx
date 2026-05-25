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
        const data = await res.json() as { tags?: unknown }
        const raw = Array.isArray(data.tags) ? (data.tags as string[]) : []
        if (!cancelled) {
          setSuggestions(raw.filter((t) => !value.includes(t)))
        }
      } catch {
        // network errors are silently ignored — suggestions stay empty
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
      <ul className="mb-2 flex flex-wrap gap-2">
        {value.map((t) => (
          <li key={t} className="inline-flex items-center gap-1 rounded bg-neutral-200 px-2 py-1 text-sm">
            #{t}
            <button type="button" onClick={() => remove(t)} aria-label={`${t} 제거`} className="text-neutral-500 hover:text-neutral-900">
              ×
            </button>
          </li>
        ))}
      </ul>
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
        className="w-full rounded border px-3 py-2"
      />
      {suggestions.length > 0 && (
        <ul className="mt-1 rounded border bg-white shadow">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s)} className="block w-full px-3 py-1 text-left hover:bg-neutral-100">
                #{s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
