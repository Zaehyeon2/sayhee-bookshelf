import { notFound } from 'next/navigation'
import { requireOwnMovieForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { attachMovieTags } from '@/lib/db/queries'
import { MovieForm } from '@/components/MovieForm'

export default async function EditMoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { movie } = await requireOwnMovieForPage(numId)
  const tags = await attachMovieTags(db, movie.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        영화 기록 수정
      </h1>
      <MovieForm
        mode="edit"
        initial={{
          ...movie,
          tags,
          oneLineReview: movie.oneLineReview ?? '',
          isPublic: movie.isPublic === 1,
          externalSource: movie.externalSource as 'tmdb' | null,
        }}
      />
    </div>
  )
}
