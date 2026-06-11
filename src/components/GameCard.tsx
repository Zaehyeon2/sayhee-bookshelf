import Link from 'next/link'
import Image from 'next/image'
import { GenreBadge } from './GenreBadge'
import { RatingScore } from './RatingScore'
import { highlightMatch } from '@/lib/highlight'
import type { GameWithTags } from '@/lib/db/queries'

interface Props {
  game: GameWithTags
  snippet?: string
  query?: string
}

export function GameCard({ game, snippet, query }: Props) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <div className="flex gap-3">
        {game.coverUrl && (
          <Image
            src={game.coverUrl}
            alt=""
            width={80}
            height={120}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
              {game.title}
            </h3>
            <GenreBadge genre={game.genre} />
          </div>
          <p className="mt-1 text-[14px] text-[var(--color-text-muted)] line-clamp-1">
            {game.developer}
          </p>
          {snippet && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
              {query ? highlightMatch(snippet, query) : snippet}
            </p>
          )}
          {game.tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {game.tags.slice(0, 3).map((t) => (
                <li key={t} className="text-[12px] text-[var(--color-text-weak)]">
                  #{t}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <RatingScore value={game.rating} />
            <div className="flex items-center gap-2">
              {game.isPublic === 1 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-toss-blue)]"
                  title="모두의 게임관에 공개됨"
                >
                  🌐 공개
                </span>
              )}
              <time className="text-[12px] text-[var(--color-text-weak)] font-tabular">
                {game.playedDate}
              </time>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
