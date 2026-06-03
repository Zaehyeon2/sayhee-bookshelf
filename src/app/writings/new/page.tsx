import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { WritingForm } from '@/components/WritingForm'

export const metadata = { title: '새 글' }

export default async function NewWritingPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings/new')
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 글
      </h1>
      {/* key로 네비게이션 시 강제 remount — 이전 글 입력값 잔존 방지 (BookForm과 동일 사유) */}
      <WritingForm key="writing-create" mode="create" />
    </div>
  )
}
