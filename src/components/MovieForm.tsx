'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MOVIE_GENRES } from '@/lib/genres'
import { MAX_CONTENT_LEN } from '@/lib/validations'
import { RatingStars } from './RatingStars'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { ConfirmDialog } from './ConfirmDialog'
import { Spinner } from './Spinner'
import { Toggle } from './Toggle'
import { ExternalMovieSearchBar, type MovieSelection } from './ExternalMovieSearchBar'

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
  // New external metadata (all nullable):
  tmdbId: number | null
  coverUrl: string | null
  externalSource: 'tmdb' | null
}

interface Props {
  initial?: Partial<MovieFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function MovieForm({ initial, mode }: Props) {
  const router = useRouter()
  // useTransition은 async 콜백을 await하지 않아 pending이 fetch 도중에 false로 돌아가서
  // 중복 제출이 가능했다. 명시적 boolean state로 in-flight 상태를 정확히 추적한다.
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [director, setDirector] = useState(initial?.director ?? '')
  const [genre, setGenre] = useState(initial?.genre ?? MOVIE_GENRES[0])
  const [watchedDate, setWatchedDate] = useState(
    initial?.watchedDate ?? new Date().toISOString().slice(0, 10),
  )
  const [rating, setRating] = useState(initial?.rating ?? 6)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [oneLineReview, setOneLineReview] = useState(initial?.oneLineReview ?? '')
  const [isPublic, setIsPublic] = useState(
    initial?.isPublic !== undefined ? initial.isPublic : mode === 'create',
  )
  const [tmdbId, setTmdbId] = useState<number | null>(initial?.tmdbId ?? null)
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null)
  const [externalSource, setExternalSource] = useState<'tmdb' | null>(
    initial?.externalSource ?? null,
  )
  const editorRef = useRef<MarkdownEditorHandle>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const editor = editorRef.current
      const content = editor?.getMarkdown()
      if (content == null) {
        toast.error('에디터가 준비되지 않았습니다. 다시 시도해주세요.')
        return
      }
      if (content.length > MAX_CONTENT_LEN) {
        toast.error(`본문이 너무 깁니다 (${content.length.toLocaleString()} / ${MAX_CONTENT_LEN.toLocaleString()}자)`)
        return
      }
      const payload = {
        title,
        director,
        genre,
        watchedDate,
        rating,
        content,
        tags,
        oneLineReview,
        isPublic,
        tmdbId,
        coverUrl,
        externalSource,
      }
      const url = mode === 'create' ? '/api/movies' : `/api/movies/${initial?.id}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || '저장 실패')
        return
      }
      const data = await res.json()
      toast.success(mode === 'create' ? '등록되었습니다' : '수정되었습니다')
      router.push(`/movies/${data.slug}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!initial?.id || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/movies/${initial.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || '삭제 실패')
        return
      }
      toast.success('삭제되었습니다')
      router.push('/movies')
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>
            작품 검색{' '}
            <span className="text-[var(--color-text-weak)] font-normal">(선택)</span>
          </label>
          <ExternalMovieSearchBar
            initial={{
              tmdbId,
              title,
              byline: director,
              coverUrl,
            }}
            onSelect={(sel: MovieSelection) => {
              setTitle(sel.title)
              if (sel.byline) setDirector(sel.byline)
              if (sel.genre) setGenre(sel.genre)
              setTmdbId(sel.externalId)
              setCoverUrl(sel.coverUrl ?? null)
              setExternalSource('tmdb')
            }}
            onClear={() => {
              setTmdbId(null)
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
          <label className={labelCls}>감독</label>
          <input
            value={director}
            onChange={(e) => setDirector(e.target.value)}
            required
            maxLength={100}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>장르</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
              {MOVIE_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>본 날짜</label>
            <input
              type="date"
              value={watchedDate}
              onChange={(e) => setWatchedDate(e.target.value)}
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
              placeholder="이 영화를 한 줄로 표현한다면?"
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
            label="모두의 영화관에 공개"
            description="이 영화의 한줄평·별점·제목·감독을 모두의 영화관에서 다른 사람도 볼 수 있어요"
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

      <div className="flex flex-wrap items-center gap-3">
        {mode === 'edit' && initial?.id && (
          <>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mr-auto h-12 px-5 rounded-[var(--radius-toss-sm)] text-[14px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/50"
            >
              삭제
            </button>
            <ConfirmDialog
              open={confirmingDelete}
              onOpenChange={(open) => !deleting && setConfirmingDelete(open)}
              title="이 영화 기록을 삭제할까요?"
              description={`'${title || '제목 없음'}' 기록이 영구적으로 사라집니다. 되돌릴 수 없어요.`}
              confirmLabel="삭제"
              onConfirm={handleDelete}
              danger
              loading={deleting}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="h-12 px-5 rounded-[var(--radius-toss-sm)] text-[15px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          {submitting && <Spinner />}
          {submitting ? '저장 중' : mode === 'create' ? '등록' : '수정'}
        </button>
      </div>
    </form>
  )
}
