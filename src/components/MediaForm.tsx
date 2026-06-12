'use client'

import { useRef, useState } from 'react'
import type React from 'react'
import { toast } from 'sonner'
import { useCrudForm } from './useCrudForm'
import { MAX_CONTENT_LEN } from '@/lib/validations'
import { RatingStars } from './RatingStars'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { FormActionBar } from './FormActionBar'
import { getEditorMarkdownOrToast, saveJsonOrToast } from './form-helpers'
import { Toggle } from './Toggle'

export interface MediaFormConfig<TId extends string | number> {
  apiBase: string // '/api/games'
  listPath: string // '/games'
  genres: readonly string[]
  personLabel: string // '개발사'
  dateLabel: string // '플레이한 날짜'
  oneLinePlaceholder: string
  publicToggleLabel: string
  publicToggleDescription: string
  deleteConfirmTitle: string
  deleteConfirmDescription: (title: string) => string
  externalSource: string // 'rawg'
  /** payload에서 도메인 필드 키 — { person: 'developer', date: 'playedDate', externalId: 'rawgId' } */
  fieldKeys: { person: string; date: string; externalId: string }
  /** form에 onKeyDown 핸들러 주입 (BookForm의 focusNextOnEnter 보존용) */
  onFormKeyDown?: React.KeyboardEventHandler<HTMLFormElement>
  /** 도메인 외부 검색바 렌더 — MediaForm이 정규화 콜백 제공 */
  renderSearchBar: (props: {
    externalId: TId | null
    title: string
    person: string
    coverUrl: string | null
    onSelect: (sel: {
      externalId: TId
      title: string
      byline: string
      genre?: string
      coverUrl?: string
    }) => void
    onClear: () => void
  }) => React.ReactNode
}

export interface MediaFormValues<TId extends string | number> {
  title: string
  person: string
  genre: string
  date: string
  rating: number
  content: string
  tags: string[]
  oneLineReview: string
  isPublic: boolean
  externalId: TId | null
  coverUrl: string | null
}

interface Props<TId extends string | number> {
  config: MediaFormConfig<TId>
  initial?: Partial<MediaFormValues<TId>> & { id?: number }
  mode: 'create' | 'edit'
}

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function MediaForm<TId extends string | number>({ config, initial, mode }: Props<TId>) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [person, setPerson] = useState(initial?.person ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? config.genres[0])
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(initial?.rating ?? 6)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [oneLineReview, setOneLineReview] = useState(initial?.oneLineReview ?? '')
  const [isPublic, setIsPublic] = useState(
    initial?.isPublic !== undefined ? initial.isPublic : mode === 'create',
  )
  const [externalId, setExternalId] = useState<TId | null>(initial?.externalId ?? null)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null)
  const editorRef = useRef<MarkdownEditorHandle>(null)

  const crud = useCrudForm({
    onSubmit: async () => {
      const content = getEditorMarkdownOrToast(editorRef, MAX_CONTENT_LEN)
      if (content == null) return
      const payload = {
        title,
        [config.fieldKeys.person]: person,
        genre,
        [config.fieldKeys.date]: date,
        rating,
        content,
        tags,
        oneLineReview,
        isPublic,
        [config.fieldKeys.externalId]: externalId,
        coverUrl,
        externalSource: externalId != null ? config.externalSource : null,
      }
      const url = mode === 'create' ? config.apiBase : `${config.apiBase}/${initial?.id}`
      const data = await saveJsonOrToast(url, mode === 'create' ? 'POST' : 'PATCH', payload)
      if (!data) return
      toast.success(mode === 'create' ? '등록되었습니다' : '수정되었습니다')
      router.push(`${config.listPath}/${data.slug}`)
      router.refresh()
    },
    deleteAction: initial?.id
      ? { url: `${config.apiBase}/${initial.id}`, redirectTo: config.listPath }
      : undefined,
  })
  const { handleFormSubmit, router } = crud

  return (
    <form onSubmit={handleFormSubmit} onKeyDown={config.onFormKeyDown} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>
            작품 검색 <span className="text-[var(--color-text-weak)] font-normal">(선택)</span>
          </label>
          {config.renderSearchBar({
            externalId,
            title,
            person,
            coverUrl,
            onSelect: (sel) => {
              setTitle(sel.title)
              if (sel.byline) setPerson(sel.byline)
              if (sel.genre) setGenre(sel.genre)
              setExternalId(sel.externalId)
              setCoverUrl(sel.coverUrl ?? null)
            },
            onClear: () => {
              setExternalId(null)
              setCoverUrl(null)
            },
          })}
        </div>
        <div>
          <label className={labelCls}>제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{config.personLabel}</label>
          <input
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            required
            maxLength={100}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>장르</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
              {config.genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{config.dateLabel}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>별점</label>
          <RatingStars value={rating} onChange={setRating} size="lg" />
        </div>
        <div>
          <label className={labelCls}>태그</label>
          <TagInput value={tags} onChange={setTags} />
        </div>
        <div>
          <label className={labelCls}>
            한줄평{' '}
            <span className="text-[var(--color-text-weak)] font-normal">(선택, 150자 이내)</span>
          </label>
          <div className="relative">
            <input
              value={oneLineReview}
              onChange={(e) => setOneLineReview(e.target.value.slice(0, 150))}
              maxLength={150}
              placeholder={config.oneLinePlaceholder}
              className={inputCls}
            />
            <span
              className={[
                'absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-tabular tabular-nums',
                oneLineReview.length > 120
                  ? 'text-[var(--color-toss-blue)]'
                  : 'text-[var(--color-text-weak)]',
              ].join(' ')}
              aria-hidden
            >
              {oneLineReview.length}/150
            </span>
          </div>
        </div>
        <div className="pt-2 border-t border-[var(--color-border)]">
          <Toggle
            checked={isPublic}
            onChange={setIsPublic}
            label={config.publicToggleLabel}
            description={config.publicToggleDescription}
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-toss)] overflow-hidden">
        <MarkdownEditor
          ref={editorRef}
          initialValue={initial?.content ?? ''}
          maxLength={MAX_CONTENT_LEN}
        />
      </section>

      <FormActionBar
        mode={mode}
        canDelete={!!initial?.id}
        deleteConfirmTitle={config.deleteConfirmTitle}
        deleteConfirmDescription={config.deleteConfirmDescription(title)}
        form={crud}
      />
    </form>
  )
}
