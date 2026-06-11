import { notFound } from 'next/navigation'
import { requireOwnGameForPage } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import { attachGameTags } from '@/lib/db/queries'
import { GameForm } from '@/components/GameForm'
import { FreshOnVisible } from '@/components/FreshOnVisible'

export default async function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isSafeInteger(numId) || numId <= 0) notFound()
  const { game } = await requireOwnGameForPage(numId)
  const tags = await attachGameTags(db, game.id)
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-strong)]">
        게임 기록 수정
      </h1>
      {/* 재진입 시 수정 중이던 입력 잔존 방지 — FreshOnVisible 주석 참고 */}
      <FreshOnVisible>
        <GameForm
          mode="edit"
          initial={{
            ...game,
            tags,
            oneLineReview: game.oneLineReview ?? '',
            isPublic: game.isPublic === 1,
            externalSource: game.externalSource as 'rawg' | null,
          }}
        />
      </FreshOnVisible>
    </div>
  )
}
