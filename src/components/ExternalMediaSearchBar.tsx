'use client'

import { useEffect, useState } from 'react'
import { SearchDropdown } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import { useExternalSearch } from './external/useExternalSearch'
import type { ExternalSearchItem } from '@/lib/external/types'

/**
 * 제네릭 외부 검색바.
 * - variant='book': 제목 줄은 title만, 보조 줄은 [byline, year, genre].
 * - variant='media': 제목 줄에 subtitle 인라인 렌더링, 보조 줄은 [year, genre].
 */
export interface ExternalMediaSearchBarProps<TId extends string | number> {
  searchUrl: string
  byExternalUrl: string
  placeholder: string
  fallbackIcon: string
  /** book vs movie/game의 renderItem 차이를 제어 */
  variant: 'book' | 'media'
  initial?: {
    externalId?: TId | null
    title?: string
    byline?: string
    coverUrl?: string | null
  }
  onSelect: (sel: { externalId: TId; title: string; byline: string; genre?: string; coverUrl?: string }) => void
  onClear: () => void
}

export function ExternalMediaSearchBar<TId extends string | number>({
  searchUrl,
  byExternalUrl,
  placeholder,
  fallbackIcon,
  variant,
  initial,
  onSelect,
  onClear,
}: ExternalMediaSearchBarProps<TId>) {
  const [showChip, setShowChip] = useState(
    initial?.externalId != null && Boolean(initial?.title),
  )

  // Sync chip visibility with prop changes (e.g. after router.refresh()).
  useEffect(() => {
    setShowChip(initial?.externalId != null && Boolean(initial?.title))
  }, [initial?.externalId, initial?.title])

  const { query, setQuery, state, reset } = useExternalSearch<TId>({
    searchUrl,
    byExternalUrl,
  })

  if (showChip && initial) {
    return (
      <SelectedChip
        title={initial.title ?? ''}
        byline={initial.byline}
        coverUrl={initial.coverUrl}
        fallbackIcon={fallbackIcon}
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
    <SearchDropdown<ExternalSearchItem<TId>>
      query={query}
      onQueryChange={setQuery}
      placeholder={placeholder}
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
              {fallbackIcon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">
              {item.title}
              {variant === 'media' && item.subtitle && (
                <span className="text-[var(--color-text-muted)] font-normal">
                  {' '}
                  · {item.subtitle}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {variant === 'book'
                ? [item.byline, item.year, item.genre].filter(Boolean).join(' · ') || ' '
                : [item.year, item.genre].filter(Boolean).join(' · ') || ' '}
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
