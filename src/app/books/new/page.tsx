import { BookForm } from '@/components/BookForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export default function NewBookPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 독후감
      </h1>
      {/* 재진입 시 폼 입력 잔존 방지 — FreshOnVisible 주석 참고 (key 방식은 Next 16
          세그먼트 보존(Activity)에서 무력) */}
      <FreshOnVisible>
        <BookForm key="book-create" mode="create" />
      </FreshOnVisible>
    </div>
  )
}
