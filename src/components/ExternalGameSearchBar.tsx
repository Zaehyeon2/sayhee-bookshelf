'use client'

import { ExternalMediaSearchBar } from './ExternalMediaSearchBar'

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
  return (
    <ExternalMediaSearchBar<number>
      searchUrl="/api/external/games/search"
      byExternalUrl="/api/games/by-external"
      placeholder="제목으로 검색 (예: 엘든 링)"
      display={{ inlineSubtitle: true, secondaryFields: ['year', 'genre'] }}
      initial={
        initial
          ? {
              externalId: initial.rawgId,
              title: initial.title,
              byline: initial.byline,
              coverUrl: initial.coverUrl,
            }
          : undefined
      }
      onSelect={(sel) =>
        onSelect({
          externalId: sel.externalId,
          title: sel.title,
          byline: sel.byline,
          genre: sel.genre,
          coverUrl: sel.coverUrl,
        })
      }
      onClear={onClear}
    />
  )
}
