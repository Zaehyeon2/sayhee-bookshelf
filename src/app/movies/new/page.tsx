import { MovieForm } from '@/components/MovieForm'

export default function NewMoviePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        새 영화 기록
      </h1>
      <MovieForm mode="create" />
    </div>
  )
}
