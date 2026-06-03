import { BookForm } from '@/components/BookForm'

export default function NewBookPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 독후감
      </h1>
      {/* key로 네비게이션 시 강제 remount — layout(template 없음) 재조정이 폼 인스턴스를
          재사용해 이전 책의 입력값이 잔존하는 문제 방지 */}
      <BookForm key="book-create" mode="create" />
    </div>
  )
}
