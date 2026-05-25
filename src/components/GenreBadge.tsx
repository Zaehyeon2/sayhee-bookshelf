import type { Genre } from '@/lib/genres'

export function GenreBadge({ genre }: { genre: Genre | string }) {
  return (
    <span className="inline-block rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
      {genre}
    </span>
  )
}
