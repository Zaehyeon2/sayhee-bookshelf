'use client'

import { BOOK_GENRES } from '@/lib/genres'
import { MediaForm, type MediaFormConfig } from './MediaForm'
import { ExternalBookSearchBar } from './ExternalBookSearchBar'
import { focusNextOnEnter } from '@/lib/focus-next-on-enter'

export interface BookFormValues {
  title: string
  author: string
  genre: string
  readDate: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  isbn: string | null
  coverUrl: string | null
  externalSource: 'naver' | null
}

const BOOK_FORM_CONFIG: MediaFormConfig<string> = {
  apiBase: '/api/books',
  listPath: '/books',
  genres: BOOK_GENRES,
  personLabel: '작가',
  dateLabel: '읽은 날짜',
  oneLinePlaceholder: '이 책을 한 줄로 표현한다면?',
  publicToggleLabel: '모두의 서재에 공개',
  publicToggleDescription:
    '이 책의 한줄평·별점·제목·저자를 모두의 서재에서 다른 사람도 볼 수 있어요',
  deleteConfirmTitle: '이 독후감을 삭제할까요?',
  deleteConfirmDescription: (title) =>
    `'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`,
  externalSource: 'naver',
  fieldKeys: { person: 'author', date: 'readDate', externalId: 'isbn' },
  onFormKeyDown: focusNextOnEnter,
  renderSearchBar: (p) => (
    <ExternalBookSearchBar
      initial={{ isbn: p.externalId, title: p.title, byline: p.person, coverUrl: p.coverUrl }}
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
  initial?: Partial<BookFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

export function BookForm({ initial, mode }: Props) {
  return (
    <MediaForm
      config={BOOK_FORM_CONFIG}
      mode={mode}
      initial={
        initial && {
          id: initial.id,
          title: initial.title,
          person: initial.author,
          genre: initial.genre,
          date: initial.readDate,
          rating: initial.rating,
          content: initial.content,
          tags: initial.tags,
          oneLineReview: initial.oneLineReview,
          isPublic: initial.isPublic,
          externalId: initial.isbn,
          coverUrl: initial.coverUrl,
        }
      }
    />
  )
}
