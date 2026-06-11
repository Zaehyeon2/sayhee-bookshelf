'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCrudForm } from './useCrudForm'
import { BOOK_GENRES } from '@/lib/genres'
import { MAX_CONTENT_LEN } from '@/lib/validations'
import { RatingStars } from './RatingStars'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { FormActionBar } from './FormActionBar'
import { deleteOrToast, getEditorMarkdownOrToast, saveJsonOrToast } from './form-helpers'
import { Toggle } from './Toggle'
import { ExternalBookSearchBar, type BookSelection } from './ExternalBookSearchBar'
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
  // New external metadata (all nullable):
  isbn: string | null
  coverUrl: string | null
  externalSource: 'naver' | null
}

interface Props {
  initial?: Partial<BookFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function BookForm({ initial, mode }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? BOOK_GENRES[0])
  const [readDate, setReadDate] = useState(
    initial?.readDate ?? new Date().toISOString().slice(0, 10),
  )
  const [rating, setRating] = useState(initial?.rating ?? 6)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [oneLineReview, setOneLineReview] = useState(initial?.oneLineReview ?? '')
  const [isPublic, setIsPublic] = useState(
    initial?.isPublic !== undefined ? initial.isPublic : mode === 'create',
  )
  const [isbn, setIsbn] = useState<string | null>(initial?.isbn ?? null)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null)
  const [externalSource, setExternalSource] = useState<'naver' | null>(
    initial?.externalSource ?? null,
  )
  const editorRef = useRef<MarkdownEditorHandle>(null)

  const crud = useCrudForm({
    onSubmit: async () => {
      const content = getEditorMarkdownOrToast(editorRef, MAX_CONTENT_LEN)
      if (content == null) return
      const payload = {
        title,
        author,
        genre,
        readDate,
        rating,
        content,
        tags,
        oneLineReview,
        isPublic,
        isbn,
        coverUrl,
        externalSource,
      }
      const url = mode === 'create' ? '/api/books' : `/api/books/${initial?.id}`
      const data = await saveJsonOrToast(url, mode === 'create' ? 'POST' : 'PATCH', payload)
      if (!data) return
      toast.success(mode === 'create' ? '등록되었습니다' : '수정되었습니다')
      router.push(`/books/${data.slug}`)
      router.refresh()
    },
    onDelete: !initial?.id
      ? undefined
      : async () => {
          if (!(await deleteOrToast(`/api/books/${initial.id}`))) return
          toast.success('삭제되었습니다')
          router.push('/books')
          router.refresh()
        },
  })
  const { handleFormSubmit, router } = crud

  return (
    <form onSubmit={handleFormSubmit} onKeyDown={focusNextOnEnter} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>
            작품 검색 <span className="text-[var(--color-text-weak)] font-normal">(선택)</span>
          </label>
          <ExternalBookSearchBar
            initial={{
              isbn,
              title,
              byline: author,
              coverUrl,
            }}
            onSelect={(sel: BookSelection) => {
              setTitle(sel.title)
              if (sel.byline) setAuthor(sel.byline)
              if (sel.genre) setGenre(sel.genre)
              setIsbn(sel.externalId)
              setCoverUrl(sel.coverUrl ?? null)
              setExternalSource('naver')
            }}
            onClear={() => {
              setIsbn(null)
              setCoverUrl(null)
              setExternalSource(null)
            }}
          />
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
          <label className={labelCls}>작가</label>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
            maxLength={100}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>장르</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
              {BOOK_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>읽은 날짜</label>
            <input
              type="date"
              value={readDate}
              onChange={(e) => setReadDate(e.target.value)}
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
              placeholder="이 책을 한 줄로 표현한다면?"
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
            label="모두의 서재에 공개"
            description="이 책의 한줄평·별점·제목·저자를 모두의 서재에서 다른 사람도 볼 수 있어요"
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
        deleteConfirmTitle="이 독후감을 삭제할까요?"
        deleteConfirmDescription={`'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`}
        form={crud}
      />
    </form>
  )
}
