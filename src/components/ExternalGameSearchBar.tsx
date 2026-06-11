'use client'

import { useEffect, useState } from 'react'
import { SearchDropdown } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import { useExternalSearch } from './external/useExternalSearch'
import type { GameSearchItem } from '@/lib/external/types'

export interface GameSelection {
  externalId: number
  title: string
  byline: string
  genre?: string
  coverUrl?: string
}

interface Props {
  initial?: {
    rawgId?: number | null
    title?: string
    byline?: string
    coverUrl?: string | null
  }
  onSelect: (sel: GameSelection) => void
  onClear: () => void
}

export function ExternalGameSearchBar({ initial, onSelect, onClear }: Props) {
  const [showChip, setShowChip] = useState(
    initial?.rawgId != null && Boolean(initial?.title),
  )
  // Sync chip visibility with prop changes (e.g. after router.refresh()).
  useEffect(() => {
    setShowChip(initial?.rawgId != null && Boolean(initial?.title))
  }, [initial?.rawgId, initial?.title])
  const { query, setQuery, state, reset } = useExternalSearch<number>({
    searchUrl: '/api/external/games/search',
    byExternalUrl: '/api/games/by-external',
  })

  if (showChip && initial) {
    return (
      <SelectedChip
        title={initial.title ?? ''}
        byline={initial.byline}
        coverUrl={initial.coverUrl}
        fallbackIcon="🎮"
        onClear={() => {
          setShowChip(false)
          onClear()
        }}
        onReopen={() => {
          onClear()
          setShowChip(false)
          reset()
        }}
      />
    )
  }

  return (
    <SearchDropdown<GameSearchItem>
      query={query}
      onQueryChange={setQuery}
      placeholder="제목으로 검색 (예: 엘든 링)"
      state={state}
      getItemValue={(it) => String(it.externalId)}
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
              🎮
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">
              {item.title}
              {item.subtitle && (
                <span className="text-[var(--color-text-muted)] font-normal">
                  {' '}
                  · {item.subtitle}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {[item.year, item.genre].filter(Boolean).join(' · ') || ' '}
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
