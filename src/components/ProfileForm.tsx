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
  const canSubmit = !busy && trimmed.length > 0 && trimmed.length <= 30 && trimmed !== initialDisplayName

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
          className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-medium disabled:opacity-50 transition"
      >
        {busy && <Spinner />}
        저장
      </button>
    </form>
  )
}
