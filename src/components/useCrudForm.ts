'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface UseCrudFormOptions {
  /**
   * 제출 로직 전체 (fetch, toast, router.push/refresh 포함).
   * 훅은 submitting 가드와 setSubmitting(true/false) 만 담당한다.
   */
  onSubmit: () => Promise<void>
  /**
   * 삭제 로직 전체 (fetch, toast, router.push/refresh 포함).
   * 제공하지 않으면 삭제 관련 핸들러는 no-op.
   */
  onDelete?: () => Promise<void>
}

export interface UseCrudFormReturn {
  submitting: boolean
  confirmingDelete: boolean
  deleting: boolean
  /** form onSubmit에 직접 연결 — e.preventDefault() + submitting 가드 포함 */
  handleFormSubmit: (e: React.FormEvent) => void
  /** 삭제 버튼 onClick */
  openDeleteConfirm: () => void
  /** ConfirmDialog onOpenChange */
  onConfirmDialogOpenChange: (open: boolean) => void
  /** ConfirmDialog onConfirm */
  handleDeleteConfirmed: () => void
  router: ReturnType<typeof useRouter>
}

/**
 * BookForm / MovieForm / WritingForm 공통 CRUD 상태 머신.
 *
 * 제출·삭제 fetch+toast+navigate 로직은 콜백으로 위임받고,
 * 훅은 in-flight 플래그와 삭제 확인 흐름만 소유한다.
 *
 * useTransition 대신 명시적 boolean state를 사용하는 이유:
 * useTransition은 async 콜백을 await하지 않아 pending이 fetch 도중 false로
 * 돌아가 중복 제출이 가능하다. 명시적 플래그로 in-flight 상태를 정확히 추적한다.
 */
export function useCrudForm({ onSubmit, onDelete }: UseCrudFormOptions): UseCrudFormReturn {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    onSubmit().finally(() => setSubmitting(false))
  }

  function openDeleteConfirm() {
    setConfirmingDelete(true)
  }

  function onConfirmDialogOpenChange(open: boolean) {
    if (!deleting) setConfirmingDelete(open)
  }

  function handleDeleteConfirmed() {
    if (!onDelete) return
    setDeleting(true)
    onDelete().finally(() => setDeleting(false))
  }

  return {
    submitting,
    confirmingDelete,
    deleting,
    handleFormSubmit,
    openDeleteConfirm,
    onConfirmDialogOpenChange,
    handleDeleteConfirmed,
    router,
  }
}
