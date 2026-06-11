import { MovieForm } from '@/components/MovieForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export default function NewMoviePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 영화 기록
      </h1>
      {/* 재진입 시 폼 입력 잔존 방지 — FreshOnVisible 주석 참고 */}
      <FreshOnVisible>
        <MovieForm mode="create" />
      </FreshOnVisible>
    </div>
  )
}
