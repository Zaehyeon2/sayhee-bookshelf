import { BookForm } from '@/components/BookForm'

export default function NewBookPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">새 독후감</h1>
      <BookForm mode="create" />
    </div>
  )
}
