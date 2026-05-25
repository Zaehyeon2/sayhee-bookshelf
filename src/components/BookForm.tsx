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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">작가</label>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">장르</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="mt-1 w-full rounded border px-3 py-2">
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">읽은 날짜</label>
          <input type="date" value={readDate} onChange={(e) => setReadDate(e.target.value)} required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">별점</label>
        <RatingStars value={rating} onChange={setRating} size="lg" />
      </div>
      <div>
        <label className="block text-sm font-medium">태그</label>
        <TagInput value={tags} onChange={setTags} />
      </div>
      <div>
        <label className="block text-sm font-medium">본문</label>
        <div className="mt-1">
          <MarkdownEditor ref={editorRef} initialValue={initial?.content ?? ''} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
        {pending ? '저장 중…' : mode === 'create' ? '등록' : '수정'}
      </button>
    </form>
  )
}
