'use client'

import { ExternalMediaSearchBar } from './ExternalMediaSearchBar'

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
  return (
    <ExternalMediaSearchBar<string>
      searchUrl="/api/external/books/search"
      byExternalUrl="/api/books/by-external"
      placeholder="제목으로 검색 (예: 해리포터)"
      fallbackIcon=""
      display={{ inlineSubtitle: false, secondaryFields: ['byline', 'year', 'genre'] }}
      initial={
        initial
          ? {
              externalId: initial.isbn,
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
