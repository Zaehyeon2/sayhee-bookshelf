import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { WritingForm } from '@/components/WritingForm'

export const metadata = { title: '새 글' }

export default async function NewWritingPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/writings/new')
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">새 글</h1>
      <WritingForm mode="create" />
    </div>
  )
}
