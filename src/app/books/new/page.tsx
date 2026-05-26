import { BookForm } from '@/components/BookForm'

export default function NewBookPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 독후감
      </h1>
      <BookForm mode="create" />
    </div>
  )
}
