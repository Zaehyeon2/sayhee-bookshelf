'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { SearchDropdown as SearchDropdownComponent } from './external/SearchDropdown'
import { SelectedChip } from './external/SelectedChip'
import { useExternalSearch } from './external/useExternalSearch'
import type { ExternalSearchItem } from '@/lib/external/types'

// cmdk(~15KB)가 정적 import면 공용 번들에 들어감 — 폼 페이지에서만 쓰이므로 lazy 로드.
// 제네릭 시그니처는 dynamic이 지워버리므로 원본 타입으로 다시 캐스트.
const SearchDropdown = dynamic(
  () => import('./external/SearchDropdown').then((m) => m.SearchDropdown),
  {
    ssr: false,
    // 로딩 중 레이아웃 시프트 방지용 입력창 자리 표시자
    loading: () => (
      <div className="h-12 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)]" />
    ),
  },
) as typeof SearchDropdownComponent

/** 검색 결과 항목의 도메인별 표시 설정 — renderItem이 분기 없이 해석하는 선언적 명세 */
export interface SearchItemDisplay {
  /** 제목 줄에 subtitle을 ' · subtitle'로 인라인 표시 */
  inlineSubtitle: boolean
  /** 보조 줄에 합칠 필드 순서 */
  secondaryFields: readonly ('byline' | 'year' | 'genre')[]
}

export interface ExternalMediaSearchBarProps<TId extends string | number> {
  searchUrl: string
  byExternalUrl: string
  placeholder: string
  fallbackIcon: string
  display: SearchItemDisplay
  initial?: {
    externalId?: TId | null
    title?: string
    byline?: string
    coverUrl?: string | null
  }
  onSelect: (sel: {
    externalId: TId
    title: string
    byline: string
    genre?: string
    coverUrl?: string
  }) => void
  onClear: () => void
}

export function ExternalMediaSearchBar<TId extends string | number>({
  searchUrl,
  byExternalUrl,
  placeholder,
  fallbackIcon,
  display,
  initial,
  onSelect,
  onClear,
}: ExternalMediaSearchBarProps<TId>) {
  const [showChip, setShowChip] = useState(initial?.externalId != null && Boolean(initial?.title))

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
              {display.inlineSubtitle && item.subtitle && (
                <span className="text-[var(--color-text-muted)] font-normal">
                  {' '}
                  · {item.subtitle}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[var(--color-text-muted)] truncate">
              {display.secondaryFields
                .map((f) => item[f])
                .filter(Boolean)
                .join(' · ') || ' '}
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
