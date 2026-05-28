import { notFound } from 'next/navigation'
import { requireOwnBookForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { listTagsForBook } from '@/lib/db/queries'
import { BookForm } from '@/components/BookForm'

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
      <BookForm
        mode="edit"
        initial={{
          ...book,
          tags,
          oneLineReview: book.oneLineReview ?? '',
          isPublic: book.isPublic === 1,
          externalSource: book.externalSource === 'nl-kr' ? 'nl-kr' : null,
        }}
      />
    </div>
  )
}
