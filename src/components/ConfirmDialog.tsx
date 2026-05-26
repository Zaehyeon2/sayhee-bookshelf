'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Spinner } from './Spinner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  danger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '취소',
  onConfirm,
  danger = false,
  loading = false,
}: Props) {
  const confirmBg = danger
    ? 'bg-[var(--color-danger)] hover:opacity-90'
    : 'bg-[var(--color-toss-blue)] hover:bg-[var(--color-toss-blue-hover)]'
  const confirmRing = danger
    ? 'focus-visible:ring-[var(--color-danger)]/50'
    : 'focus-visible:ring-[var(--color-toss-blue)]/50'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms_ease-out] data-[state=closed]:animate-[fade-out_120ms_ease-in]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-toss-hover)] data-[state=open]:animate-[scale-in_180ms_cubic-bezier(0.2,0.8,0.2,1)] data-[state=closed]:animate-[scale-out_120ms_ease-in] focus:outline-none">
          <Dialog.Title className="text-[17px] font-bold text-[var(--color-text-strong)]">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-[14px] text-[var(--color-text-muted)] leading-relaxed">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-6 flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={loading}
                className="h-11 px-4 rounded-[var(--radius-toss-sm)] text-[14px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`inline-flex items-center gap-2 h-11 px-5 rounded-[var(--radius-toss-sm)] text-[14px] font-semibold text-white ${confirmBg} active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 ${confirmRing}`}
            >
              {loading && <Spinner />}
              {loading ? '처리 중' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
