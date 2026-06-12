'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

export function ProfileForm({ initialDisplayName }: { initialDisplayName: string }) {
  const router = useRouter()
  const [displayName, setName] = useState(initialDisplayName)
  const [busy, setBusy] = useState(false)
  const trimmed = displayName.trim()
  const canSubmit =
    !busy && trimmed.length > 0 && trimmed.length <= 30 && trimmed !== initialDisplayName

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    const res = await fetch('/api/users/me/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: trimmed }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '저장에 실패했습니다')
      setBusy(false)
      return
    }
    toast.success('프로필이 변경되었습니다')
    setBusy(false)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
      <label className="block">
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">표시 이름</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          maxLength={30}
          className="mt-1 w-full h-11 px-3 rounded-[var(--radius-field)] bg-[var(--color-surface-2)] text-[15px] focus:ring-2 focus:ring-[var(--color-accent)] outline-none transition"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-[17px] font-normal hover:bg-[var(--color-accent-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
      >
        {busy && <Spinner />}
        저장
      </button>
    </form>
  )
}
