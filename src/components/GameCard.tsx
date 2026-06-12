import type { GameWithTags } from '@/lib/db/queries'
import { MediaCard } from './MediaCard'

interface Props {
  game: GameWithTags
  snippet?: string
  query?: string
}

export function GameCard({ game, snippet, query }: Props) {
  return (
    <MediaCard
      item={{
        slug: game.slug,
        title: game.title,
        person: game.developer,
        genre: game.genre,
        rating: game.rating,
        date: game.playedDate,
        isPublic: game.isPublic,
        coverUrl: game.coverUrl,
        tags: game.tags,
      }}
      basePath="/games"
      publicBadgeTitle="모두의 게임관에 공개됨"
      snippet={snippet}
      query={query}
    />
  )
}
