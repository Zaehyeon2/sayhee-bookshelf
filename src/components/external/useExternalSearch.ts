'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExternalSearchItem, ExternalSearchResponse } from '@/lib/external/types'

const DEBOUNCE_MS = 300
const MIN_Q = 2

export type SearchState<TId extends string | number> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryAfterSeconds?: number }
  | { kind: 'ok'; items: ExternalSearchItem<TId>[]; counts: Record<string, number> }

interface Options {
  /** Proxy search endpoint, e.g. '/api/external/books/search'. */
  searchUrl: string
  /** Owned-record lookup endpoint, e.g. '/api/books/by-external'. */
  byExternalUrl: string
}

export function useExternalSearch<TId extends string | number>(opts: Options) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState<TId>>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    if (timerRef.current) clearTimeout(timerRef.current)
    setQuery('')
    setState({ kind: 'idle' })
  }, [])

  useEffect(() => {
    // Cancel any pending fetch/timer before starting new one.
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()

    const q = query.trim()
    if (q.length < MIN_Q) {
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'loading' })
    timerRef.current = setTimeout(async () => {
      const ctl = new AbortController()
      abortRef.current = ctl
      try {
        const res = await fetch(`${opts.searchUrl}?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
        })
        if (!res.ok) {
          const body: { error?: unknown } = await res.json().catch(() => ({}))
          const message =
            typeof body.error === 'string' ? body.error : '검색 실패'
          const retryAfterHeader = res.headers.get('retry-after')
          const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
          setState({
            kind: 'error',
            message,
            retryAfterSeconds: Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds
              : undefined,
          })
          return
        }
        const data = (await res.json()) as ExternalSearchResponse<TId>

        // Best-effort by-external lookup. Lookup failure (network/parse/non-OK)
        // must NOT discard the search results — fall through with counts={}.
        let counts: Record<string, number> = {}
        if (data.items.length > 0) {
          const ids = data.items.map((it) => String(it.externalId)).join(',')
          try {
            const lookup = await fetch(
              `${opts.byExternalUrl}?ids=${encodeURIComponent(ids)}`,
              { signal: ctl.signal },
            )
            if (lookup.ok) {
              const lb = (await lookup.json()) as { counts?: Record<string, number> }
              counts = lb.counts ?? {}
            }
          } catch (lookupErr) {
            if ((lookupErr as Error).name === 'AbortError') throw lookupErr
            // network/parse — silent fallback to counts={}.
          }
        }
        setState({ kind: 'ok', items: data.items, counts })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setState({
          kind: 'error',
          message: '검색 서비스가 일시적으로 응답하지 않아요',
        })
      } finally {
        if (abortRef.current === ctl) abortRef.current = null
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [query, opts.searchUrl, opts.byExternalUrl])

  return { query, setQuery, state, reset }
}
