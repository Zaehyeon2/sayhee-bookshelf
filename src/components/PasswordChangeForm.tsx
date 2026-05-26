'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

export function PasswordChangeForm({ forced }: { forced: boolean }) {
  const router = useRouter()
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [newPasswordConfirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch =
    newPassword.length > 0 && newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const canSubmit =
    !busy &&
    !mismatch &&
    !tooShort &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPasswordConfirm.length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? '비밀번호 변경에 실패했습니다')
        return
      }
      toast.success('비밀번호가 변경되었습니다')
      // 입력 폼 클리어 — 비밀번호 평문이 메모리에 남지 않도록.
      setCurrent('')
      setNew('')
      setConfirm('')
      router.push('/')
      router.refresh()
    } finally {
      // 어떤 경로든 busy를 풀어 사용자가 다시 시도할 수 있게 한다.
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
      {forced && (
        <p className="rounded-[var(--radius-toss-sm)] bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-[13px] text-yellow-900 dark:text-yellow-200">
          기본 비밀번호를 사용 중입니다. 변경 후 다른 기능을 이용할 수 있어요.
        </p>
      )}
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">
          현재 비밀번호
        </span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
        />
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">새 비밀번호</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
        />
        {tooShort && <p className="mt-1 text-[12px] text-[var(--color-danger)]">최소 8자 이상</p>}
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">
          새 비밀번호 확인
        </span>
        <input
          type="password"
          value={newPasswordConfirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
        />
        {mismatch && (
          <p className="mt-1 text-[12px] text-[var(--color-danger)]">
            비밀번호가 일치하지 않습니다
          </p>
        )}
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium disabled:opacity-50 transition"
      >
        {busy && <Spinner />}
        변경
      </button>
    </form>
  )
}
