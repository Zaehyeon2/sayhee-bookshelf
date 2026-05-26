'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { ConfirmDialog } from './ConfirmDialog'
import { Spinner } from './Spinner'

export interface WritingFormValues {
  title: string
  body: string
  tags: string[]
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
      const payload = { title: title.trim(), body, tags }
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
    <form onSubmit={submit} className="space-y-6">
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
      </section>

      <section className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-toss)] overflow-hidden">
        <MarkdownEditor ref={editorRef} initialValue={initial?.body ?? ''} />
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
