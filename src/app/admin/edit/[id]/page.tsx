import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getBookById } from '@/lib/db/queries'
import { BookForm } from '@/components/BookForm'

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const book = await getBookById(db, numId)
  if (!book) notFound()
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">독후감 수정</h1>
      <BookForm mode="edit" initial={book} />
    </div>
  )
}
