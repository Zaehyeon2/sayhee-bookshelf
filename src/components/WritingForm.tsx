'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCrudForm } from './useCrudForm'
import { TagInput } from './TagInput'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { FormActionBar } from './FormActionBar'
import { getEditorMarkdownOrToast, saveJsonOrToast } from './form-helpers'
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
  'w-full h-12 px-4 rounded-[var(--radius-field)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 outline-none transition'

const labelCls = 'block text-[13px] font-semibold text-[var(--color-text-muted)] mb-2'

export function WritingForm({ initial, mode }: Props) {
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

  const crud = useCrudForm({
    onSubmit: async () => {
      const body = getEditorMarkdownOrToast(editorRef)
      if (body == null) return
      // cover 결정: 새 파일 → 업로드 후 URL / 제거 버튼 → null / 변경 없음 → 키 생략
      let coverUrl: string | null | undefined
      // 이번 submit에서 새로 업로드한 URL — 저장 실패 시 보상 삭제에 사용.
      let uploadedUrl: string | null = null
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
        uploadedUrl = coverUrl
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
      const data = await saveJsonOrToast(url, mode === 'create' ? 'POST' : 'PATCH', payload)
      if (!data) {
        // 이번 submit에서 업로드한 blob이 있으면 고아가 되지 않도록 best-effort 삭제.
        if (uploadedUrl) {
          await fetch('/api/uploads', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: uploadedUrl }),
          }).catch(() => {})
        }
        return
      }
      toast.success(mode === 'create' ? '글이 등록되었습니다' : '글이 수정되었습니다')
      router.push(`/writings/${encodeURIComponent(data.slug)}`)
      router.refresh()
    },
    deleteAction: initial?.id
      ? { url: `/api/writings/${initial.id}`, redirectTo: '/writings' }
      : undefined,
  })
  const { handleFormSubmit, router } = crud

  return (
    <form onSubmit={handleFormSubmit} onKeyDown={focusNextOnEnter} className="space-y-6">
      <section className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-6 space-y-5">
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
                className="h-32 w-auto rounded-[var(--radius-field)] border border-[var(--color-border)] object-cover"
              />
              <button
                type="button"
                onClick={onRemoveCover}
                className="h-9 px-3 rounded-[var(--radius-field)] text-[13px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition"
              >
                이미지 제거
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="h-12 px-5 rounded-[var(--radius-field)] border border-dashed border-[var(--color-border)] text-[14px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition"
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

      <section className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-2 overflow-hidden">
        <MarkdownEditor ref={editorRef} initialValue={initial?.body ?? ''} maxLength={50_000} />
      </section>

      <FormActionBar
        mode={mode}
        canDelete={!!initial?.id}
        deleteConfirmTitle="이 글을 삭제할까요?"
        deleteConfirmDescription={`'${title || '제목 없음'}' 글이 영구적으로 사라집니다. 되돌릴 수 없어요.`}
        submitDisabled={title.trim().length === 0}
        form={crud}
      />
    </form>
  )
}
