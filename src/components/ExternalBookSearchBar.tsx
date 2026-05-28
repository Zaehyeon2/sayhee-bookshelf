'use client'

import { useState } from 'react'
import { SearchDropdown } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import { useExternalSearch } from './external/useExternalSearch'
import type { BookSearchItem } from '@/lib/external/types'

export interface BookSelection {
  externalId: string
  title: string
  byline: string
  genre?: string
  coverUrl?: string
}

interface Props {
  initial?: {
    isbn?: string | null
    title?: string
    byline?: string
    coverUrl?: string | null
  }
  onSelect: (sel: BookSelection) => void
  onClear: () => void
}

export function ExternalBookSearchBar({ initial, onSelect, onClear }: Props) {
  const [showChip, setShowChip] = useState(
    Boolean(initial?.isbn) && Boolean(initial?.title),
  )
  const { query, setQuery, state, reset } = useExternalSearch<string>({
    searchUrl: '/api/external/books/search',
    byExternalUrl: '/api/books/by-external',
  })

  if (showChip && initial) {
    return (
      <SelectedChip
        title={initial.title ?? ''}
        byline={initial.byline}
        coverUrl={initial.coverUrl}
        onClear={() => {
          setShowChip(false)
          onClear()
        }}
        onReopen={() => {
          setShowChip(false)
          reset()
        }}
      />
    )
  }

  return (
    <SearchDropdown<BookSearchItem>
      query={query}
      onQueryChange={setQuery}
      placeholder="제목으로 검색 (예: 해리포터)"
      state={state}
      getItemValue={(it) => it.externalId}
      onSelect={(item) => {
        onSelect({
          externalId: item.externalId,
          title: item.title,
          byline: item.byline,
          genre: item.genre,
          coverUrl: item.coverUrl,
        })
        setShowChip(true)
        reset()
      }}
      renderItem={(item, count) => (
        <div className="flex items-center gap-3">
          {item.coverUrl ? (
            // biome-ignore lint/performance/noImgElement: dynamic external URL, not bound to remotePatterns
            // biome-ignore lint/a11y/useAltText: decorative search-result thumbnail
            <img
              src={item.coverUrl}
              alt=""
              width={36}
              height={52}
              className="rounded-sm object-cover flex-shrink-0"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-9 h-[52px] rounded-sm bg-[var(--color-surface-2)] flex items-center justify-center text-base">
              📚
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{item.title}</div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {[item.byline, item.year, item.genre].filter(Boolean).join(' · ') || ' '}
            </div>
            {count > 0 && (
              <div className="text-[11px] text-[var(--color-toss-blue)] mt-0.5">
                ✓ 이미 {count}번 기록했어요
              </div>
            )}
          </div>
        </div>
      )}
    />
  )
}
