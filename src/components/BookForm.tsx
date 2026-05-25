'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GENRES } from '@/lib/genres'
import { RatingStars } from './RatingStars'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'

export interface BookFormValues {
  title: string
  author: string
  genre: string
  readDate: string
  rating: number
  content: string
  tags: string[]
}

interface Props {
  initial?: Partial<BookFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function BookForm({ initial, mode }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? GENRES[0])
  const [readDate, setReadDate] = useState(initial?.readDate ?? new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(initial?.rating ?? 3)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const editorRef = useRef<MarkdownEditorHandle>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const editor = editorRef.current
      if (!editor) {
        setError('에디터가 준비되지 않았습니다. 다시 시도해주세요.')
        return
      }
      const content = editor.getMarkdown()
      const payload = { title, author, genre, readDate, rating, content, tags }
      const url = mode === 'create' ? '/api/books' : `/api/books/${initial?.id}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '저장 실패')
        return
      }
      const data = await res.json()
      router.push(`/books/${data.slug}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>작가</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} required className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>장르</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>읽은 날짜</label>
            <input type="date" value={readDate} onChange={(e) => setReadDate(e.target.value)} required className={inputCls} />
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
      </section>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)]">
        <label className={labelCls}>본문</label>
        <div className="rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] overflow-hidden">
          <MarkdownEditor ref={editorRef} initialValue={initial?.content ?? ''} />
        </div>
      </section>

      {error && (
        <p className="text-[14px] text-[var(--color-danger)] font-medium">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-12 px-5 rounded-[var(--radius-toss-sm)] text-[15px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition"
        >
          {pending ? '저장 중…' : mode === 'create' ? '등록' : '수정'}
        </button>
      </div>
    </form>
  )
}
