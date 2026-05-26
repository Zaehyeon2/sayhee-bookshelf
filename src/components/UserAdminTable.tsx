'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'

type UserRow = {
  id: number
  username: string
  displayName: string
  role: string
  mustChangePassword: number
  createdAt: number
  bookCount: number
}

export function UserAdminTable({
  users,
  currentAdminId,
}: {
  users: UserRow[]
  currentAdminId: number
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: newUsername, displayName: newDisplayName || undefined }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '생성 실패')
      setBusy(false)
      return
    }
    toast.success('사용자가 생성되었습니다. 기본 비밀번호로 안내해주세요.')
    setCreating(false)
    setNewUsername('')
    setNewDisplayName('')
    setBusy(false)
    router.refresh()
  }

  async function onReset(id: number, username: string) {
    if (!confirm(`${username}의 비밀번호를 초기화하시겠습니까?`)) return
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    if (!res.ok) {
      toast.error('초기화 실패')
      return
    }
    toast.success('초기화되었습니다. 사용자에게 기본 비밀번호로 로그인하라고 안내하세요.')
    router.refresh()
  }

  async function onDelete(id: number, username: string) {
    if (!confirm(`${username}을(를) 삭제하시겠습니까? 이 사용자의 모든 책도 함께 삭제됩니다.`))
      return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '삭제 실패')
      return
    }
    toast.success('삭제되었습니다')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center px-4 h-9 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] font-medium"
        >
          신규 사용자
        </button>
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-[12px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
            <th className="text-left py-2">아이디</th>
            <th className="text-left">이름</th>
            <th className="text-left">권한</th>
            <th className="text-right">책</th>
            <th className="text-right">상태</th>
            <th className="text-right">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[var(--color-border-subtle)]/30">
              <td className="py-2 font-tabular">{u.username}</td>
              <td>{u.displayName}</td>
              <td>{u.role === 'admin' ? '관리자' : '멤버'}</td>
              <td className="text-right font-tabular">{u.bookCount}</td>
              <td className="text-right text-[12px] text-[var(--color-text-muted)]">
                {u.mustChangePassword ? '기본 비번' : '정상'}
              </td>
              <td className="text-right space-x-3">
                <button
                  onClick={() => onReset(u.id, u.username)}
                  className="text-[12px] text-[var(--color-toss-blue)] hover:underline"
                >
                  비번 reset
                </button>
                <button
                  onClick={() => onDelete(u.id, u.username)}
                  disabled={u.id === currentAdminId}
                  className="text-[12px] text-[var(--color-danger)] hover:underline disabled:text-[var(--color-text-weak)] disabled:no-underline disabled:cursor-not-allowed"
                  title={u.id === currentAdminId ? '본인은 삭제할 수 없습니다' : ''}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30 z-20" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-[var(--color-surface)] rounded-[var(--radius-toss)] p-6 w-[360px] shadow-xl">
            <Dialog.Title className="text-[18px] font-bold text-[var(--color-text-strong)] mb-4">
              신규 사용자
            </Dialog.Title>
            <form onSubmit={onCreate} className="space-y-3">
              <label className="block">
                <span className="text-[13px] font-medium text-[var(--color-text-muted)]">
                  아이디 (2~20자, 한글 OK)
                </span>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-[var(--color-text-muted)]">
                  표시 이름 (선택)
                </span>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="mt-1 w-full h-11 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[15px] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
                />
              </label>
              <p className="text-[12px] text-[var(--color-text-muted)]">
                초기 비밀번호는 환경변수 <code>DEFAULT_USER_PASSWORD</code> 값입니다. 사용자에게
                따로 안내해주세요.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close className="px-4 h-9 rounded-[var(--radius-toss-sm)] text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition">
                  취소
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center px-4 h-9 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] gap-2 disabled:opacity-50 transition"
                >
                  {busy && <Spinner />}
                  생성
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
