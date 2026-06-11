import { notFound } from 'next/navigation'
import { requireOwnBookForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { listTagsForBook } from '@/lib/db/queries'
import { BookForm } from '@/components/BookForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { book } = await requireOwnBookForPage(numId)
  const tags = await listTagsForBook(db, book.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        독후감 수정
      </h1>
      {/* 재진입 시 수정 중이던 입력 잔존 방지 — FreshOnVisible 주석 참고 */}
      <FreshOnVisible>
        <BookForm
          key={`book-edit-${book.id}`}
          mode="edit"
          initial={{
            ...book,
            tags,
            oneLineReview: book.oneLineReview ?? '',
            isPublic: book.isPublic === 1,
            externalSource: book.externalSource as 'naver' | null,
          }}
        />
      </FreshOnVisible>
    </div>
  )
}
