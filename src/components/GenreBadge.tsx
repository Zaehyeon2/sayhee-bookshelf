interface Props {
  genre: string
  active?: boolean
}

export function GenreBadge({ genre, active = false }: Props) {
  const cls = active
    ? 'bg-[var(--color-toss-blue-light)] text-[var(--color-toss-blue)]'
    : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium shrink-0 whitespace-nowrap ${cls}`}
    >
      {genre}
    </span>
  )
}
