'use client'

import { MOVIE_GENRES } from '@/lib/genres'
import { MediaForm, type MediaFormConfig } from './MediaForm'
import { ExternalMovieSearchBar } from './ExternalMovieSearchBar'

export interface MovieFormValues {
  title: string
  director: string
  genre: string
  watchedDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  tmdbId: number | null
  coverUrl: string | null
  externalSource: 'tmdb' | null
}

const MOVIE_FORM_CONFIG: MediaFormConfig<number> = {
  apiBase: '/api/movies',
  listPath: '/movies',
  genres: MOVIE_GENRES,
  personLabel: '감독',
  dateLabel: '본 날짜',
  oneLinePlaceholder: '이 영화를 한 줄로 표현한다면?',
  publicToggleLabel: '모두의 영화관에 공개',
  publicToggleDescription:
    '이 영화의 한줄평·별점·제목·감독을 모두의 영화관에서 다른 사람도 볼 수 있어요',
  deleteConfirmTitle: '이 영화 기록을 삭제할까요?',
  deleteConfirmDescription: (title) =>
    `'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`,
  externalSource: 'tmdb',
  fieldKeys: { person: 'director', date: 'watchedDate', externalId: 'tmdbId' },
  renderSearchBar: (p) => (
    <ExternalMovieSearchBar
      initial={{ tmdbId: p.externalId, title: p.title, byline: p.person, coverUrl: p.coverUrl }}
      onSelect={(sel) =>
        p.onSelect({
          externalId: sel.externalId,
          title: sel.title,
          byline: sel.byline,
          genre: sel.genre,
          coverUrl: sel.coverUrl,
        })
      }
      onClear={p.onClear}
    />
  ),
}

interface Props {
  initial?: Partial<MovieFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

export function MovieForm({ initial, mode }: Props) {
  return (
    <MediaForm
      config={MOVIE_FORM_CONFIG}
      mode={mode}
      initial={
        initial && {
          id: initial.id,
          title: initial.title,
          person: initial.director,
          genre: initial.genre,
          date: initial.watchedDate,
          rating: initial.rating,
          content: initial.content,
          tags: initial.tags,
          oneLineReview: initial.oneLineReview,
          isPublic: initial.isPublic,
          externalId: initial.tmdbId,
          coverUrl: initial.coverUrl,
        }
      }
    />
  )
}
