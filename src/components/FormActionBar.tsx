'use client'

import { ConfirmDialog } from './ConfirmDialog'
import { Spinner } from './Spinner'
import type { UseCrudFormReturn } from './useCrudForm'

interface Props {
  mode: 'create' | 'edit'
  /** edit 모드에서 삭제 버튼 노출 여부 — 보통 `mode === 'edit' && !!initial?.id` */
  canDelete: boolean
  deleteConfirmTitle: string
  deleteConfirmDescription: string
  /** submitting 외 추가 비활성 조건 (예: 제목 미입력) */
  submitDisabled?: boolean
  form: Pick<
    UseCrudFormReturn,
    | 'submitting'
    | 'confirmingDelete'
    | 'deleting'
    | 'openDeleteConfirm'
    | 'onConfirmDialogOpenChange'
    | 'handleDeleteConfirmed'
    | 'router'
  >
}

/** BookForm/MovieForm/WritingForm 공통 하단 액션 바 — 삭제(+확인 다이얼로그)·취소·제출 */
export function FormActionBar({
  mode,
  canDelete,
  deleteConfirmTitle,
  deleteConfirmDescription,
  submitDisabled = false,
  form,
}: Props) {
  const {
    submitting,
    confirmingDelete,
    deleting,
    openDeleteConfirm,
    onConfirmDialogOpenChange,
    handleDeleteConfirmed,
    router,
  } = form

  return (
    <div className="flex flex-wrap items-center gap-3">
      {mode === 'edit' && canDelete && (
        <>
          <button
            type="button"
            onClick={openDeleteConfirm}
            className="mr-auto h-12 px-5 rounded-[var(--radius-toss-sm)] text-[14px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/50"
          >
            삭제
          </button>
          <ConfirmDialog
            open={confirmingDelete}
            onOpenChange={onConfirmDialogOpenChange}
            title={deleteConfirmTitle}
            description={deleteConfirmDescription}
            confirmLabel="삭제"
            onConfirm={handleDeleteConfirmed}
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
        disabled={submitting || submitDisabled}
        className="inline-flex items-center gap-2 h-12 px-6 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        {submitting && <Spinner />}
        {submitting ? '저장 중' : mode === 'create' ? '등록' : '수정'}
      </button>
    </div>
  )
}
