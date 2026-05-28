'use client'

import { Command } from 'cmdk'
import type { ReactNode } from 'react'
import { Spinner } from '@/components/Spinner'

export interface SearchDropdownProps<T> {
  query: string
  onQueryChange: (q: string) => void
  placeholder: string
  state:
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; items: T[]; counts: Record<string, number> }
  onSelect: (item: T) => void
  renderItem: (item: T, count: number) => ReactNode
  /** Unique stable key per item (e.g., String(externalId)). */
  getItemValue: (item: T) => string
}

export function SearchDropdown<T>({
  query,
  onQueryChange,
  placeholder,
  state,
  onSelect,
  renderItem,
  getItemValue,
}: SearchDropdownProps<T>) {
  const isOpen = state.kind !== 'idle'

  return (
    <Command
      shouldFilter={false}
      className="rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden"
    >
      <Command.Input
        value={query}
        onValueChange={onQueryChange}
        placeholder={placeholder}
        className="w-full h-12 px-4 bg-transparent text-[15px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none border-b border-[var(--color-border)]"
      />
      {isOpen && (
        <Command.List className="max-h-80 overflow-y-auto py-1">
          {state.kind === 'loading' && (
            <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
              <Spinner /> 검색 중…
            </div>
          )}
          {state.kind === 'error' && (
            <div className="px-4 py-3 text-[13px] text-[var(--color-danger)]">{state.message}</div>
          )}
          {state.kind === 'ok' && state.items.length === 0 && (
            <Command.Empty className="px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
              검색 결과가 없어요. 아래에 직접 입력해도 됩니다.
            </Command.Empty>
          )}
          {state.kind === 'ok' &&
            state.items.map((item) => {
              const key = getItemValue(item)
              const count = state.counts[key] ?? 0
              return (
                <Command.Item
                  key={key}
                  value={key}
                  onSelect={() => onSelect(item)}
                  className="px-4 py-2.5 text-[14px] text-[var(--color-text-strong)] cursor-pointer data-[selected=true]:bg-[var(--color-surface-2)] aria-selected:bg-[var(--color-surface-2)]"
                >
                  {renderItem(item, count)}
                </Command.Item>
              )
            })}
        </Command.List>
      )}
    </Command>
  )
}
