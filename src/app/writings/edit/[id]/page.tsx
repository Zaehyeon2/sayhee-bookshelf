import { notFound } from 'next/navigation'
import { requireOwnWritingForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { listTagsForWriting } from '@/lib/db/queries'
import { WritingForm } from '@/components/WritingForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export const metadata = { title: '글 수정' }

export default async function EditWritingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { writing } = await requireOwnWritingForPage(numId)
  const tags = await listTagsForWriting(db, writing.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        글 수정
      </h1>
      {/* 재진입 시 수정 중이던 입력 잔존 방지 — FreshOnVisible 주석 참고 */}
      <FreshOnVisible>
        <WritingForm
          key={`writing-edit-${writing.id}`}
          mode="edit"
          initial={{
            id: writing.id,
            title: writing.title,
            body: writing.body,
            tags,
            coverUrl: writing.coverUrl,
          }}
        />
      </FreshOnVisible>
    </div>
  )
}
