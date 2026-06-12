'use client'

import { GAME_GENRES } from '@/lib/genres'
import { MediaForm, type MediaFormConfig } from './MediaForm'
import { ExternalGameSearchBar } from './ExternalGameSearchBar'

export interface GameFormValues {
  title: string
  developer: string
  genre: string
  playedDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  rawgId: number | null
  coverUrl: string | null
  externalSource: 'rawg' | null
}

const GAME_FORM_CONFIG: MediaFormConfig<number> = {
  apiBase: '/api/games',
  listPath: '/games',
  genres: GAME_GENRES,
  personLabel: '개발사',
  dateLabel: '플레이한 날짜',
  oneLinePlaceholder: '이 게임을 한 줄로 표현한다면?',
  publicToggleLabel: '모두의 게임관에 공개',
  publicToggleDescription:
    '이 게임의 한줄평·별점·제목·개발사를 모두의 게임관에서 다른 사람도 볼 수 있어요',
  deleteConfirmTitle: '이 게임 기록을 삭제할까요?',
  deleteConfirmDescription: (title) =>
    `'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`,
  externalSource: 'rawg',
  fieldKeys: { person: 'developer', date: 'playedDate', externalId: 'rawgId' },
  renderSearchBar: (p) => (
    <ExternalGameSearchBar
      initial={{ rawgId: p.externalId, title: p.title, byline: p.person, coverUrl: p.coverUrl }}
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
  initial?: Partial<GameFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

export function GameForm({ initial, mode }: Props) {
  return (
    <MediaForm
      config={GAME_FORM_CONFIG}
      mode={mode}
      initial={
        initial && {
          id: initial.id,
          title: initial.title,
          person: initial.developer,
          genre: initial.genre,
          date: initial.playedDate,
          rating: initial.rating,
          content: initial.content,
          tags: initial.tags,
          oneLineReview: initial.oneLineReview,
          isPublic: initial.isPublic,
          externalId: initial.rawgId,
          coverUrl: initial.coverUrl,
          externalSource: initial.externalSource,
        }
      }
    />
  )
}
