import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { WritingForm } from '@/components/WritingForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export const metadata = { title: '새 글' }

export default async function NewWritingPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings/new')
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 글
      </h1>
      {/* 재진입 시 폼 입력 잔존 방지 — FreshOnVisible 주석 참고 */}
      <FreshOnVisible>
        <WritingForm key="writing-create" mode="create" />
      </FreshOnVisible>
    </div>
  )
}
