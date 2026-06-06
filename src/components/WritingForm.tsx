'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { ConfirmDialog } from './ConfirmDialog'
import { Spinner } from './Spinner'
import { focusNextOnEnter } from '@/lib/focus-next-on-enter'
import { MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME } from '@/lib/image-constraints'

export interface WritingFormValues {
  title: string
  body: string
  tags: string[]
  coverUrl: string | null
}

interface Props {
  initial?: Partial<WritingFormValues> & { id?: number }
  mode: 'create' | 'edit'
}

const inputCls =
  'w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function WritingForm({ initial, mode }: Props) {
  const router = useRouter()
  // BookForm과 동일한 사유로 useTransition 대신 명시적 boolean state 사용 — async 콜백이
  // await되지 않는 transition 동작으로 인한 중복 제출 방지.
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const editorRef = useRef<MarkdownEditorHandle>(null)

  const existingCover = initial?.coverUrl ?? null
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(existingCover)
  const coverInputRef = useRef<HTMLInputElement>(null)

  function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      toast.error('이미지 파일(jpg/png/webp/gif)만 첨부할 수 있어요')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('이미지는 최대 5MB까지 첨부할 수 있어요')
      return
    }
    setCoverFile(file)
    setCoverRemoved(false)
    setCoverPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function onRemoveCover() {
    setCoverFile(null)
    setCoverRemoved(true)
    setCoverPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const editor = editorRef.current
      const body = editor?.getMarkdown()
      if (body == null) {
        toast.error('에디터가 준비되지 않았습니다. 다시 시도해주세요.')
        return
      }
      // cover 결정: 새 파일 → 업로드 후 URL / 제거 버튼 → null / 변경 없음 → 키 생략
      let coverUrl: string | null | undefined
      if (coverFile) {
        const fd = new FormData()
        fd.append('file', coverFile)
        const up = await fetch('/api/uploads', { method: 'POST', body: fd })
        if (!up.ok) {
          const d = await up.json().catch(() => ({}))
          toast.error(d.error || '이미지 업로드 실패')
          return
        }
        coverUrl = (await up.json()).url as string
      } else if (coverRemoved) {
        coverUrl = null
      }

      const payload = {
        title: title.trim(),
        body,
        tags,
        ...(coverUrl !== undefined && { coverUrl }),
      }
      const url = mode === 'create' ? '/api/writings' : `/api/writings/${initial?.id}`
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
      toast.success(mode === 'create' ? '글이 등록되었습니다' : '글이 수정되었습니다')
      router.push(`/writings/${encodeURIComponent(data.slug)}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!initial?.id || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/writings/${initial.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || '삭제 실패')
        return
      }
      toast.success('삭제되었습니다')
      router.push('/writings')
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={focusNextOnEnter} className="space-y-6">
      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss)] space-y-5">
        <div>
          <label className={labelCls}>제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="제목을 입력하세요"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>태그</label>
          <TagInput value={tags} onChange={setTags} />
        </div>
        <div>
          <label className={labelCls}>대표 이미지 (선택)</label>
          {coverPreview ? (
            <div className="flex items-start gap-3">
              {/* biome-ignore lint/performance/noImgElement: 미리보기는 blob/objectURL이라 next/image 부적합 */}
              <img
                src={coverPreview}
                alt="대표 이미지 미리보기"
                className="h-32 w-auto rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] object-cover"
              />
              <button
                type="button"
                onClick={onRemoveCover}
                className="h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition"
              >
                이미지 제거
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="h-12 px-5 rounded-[var(--radius-toss-sm)] border border-dashed border-[var(--color-border)] text-[14px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-toss-blue)] hover:text-[var(--color-toss-blue)] transition"
            >
              + 이미지 첨부
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept={ALLOWED_IMAGE_MIME.join(',')}
            onChange={onPickCover}
            className="hidden"
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-toss)] overflow-hidden">
        <MarkdownEditor ref={editorRef} initialValue={initial?.body ?? ''} maxLength={50_000} />
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
              title="이 글을 삭제할까요?"
              description={`'${title || '제목 없음'}' 글이 영구적으로 사라집니다. 되돌릴 수 없어요.`}
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
          disabled={submitting || title.trim().length === 0}
          className="inline-flex items-center gap-2 h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          {submitting && <Spinner />}
          {submitting ? '저장 중' : mode === 'create' ? '등록' : '수정'}
        </button>
      </div>
    </form>
  )
}
