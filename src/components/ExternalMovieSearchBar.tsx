'use client'

import { ExternalMediaSearchBar } from './ExternalMediaSearchBar'

export interface MovieSelection {
  externalId: number
  title: string
  byline: string
  genre?: string
  coverUrl?: string
}

interface Props {
  initial?: {
    tmdbId?: number | null
    title?: string
    byline?: string
    coverUrl?: string | null
  }
  onSelect: (sel: MovieSelection) => void
  onClear: () => void
}

export function ExternalMovieSearchBar({ initial, onSelect, onClear }: Props) {
  return (
    <ExternalMediaSearchBar<number>
      searchUrl="/api/external/movies/search"
      byExternalUrl="/api/movies/by-external"
      placeholder="제목으로 검색 (예: 파이트 클럽)"
      display={{ inlineSubtitle: true, secondaryFields: ['year', 'genre'] }}
      initial={
        initial
          ? {
              externalId: initial.tmdbId,
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
