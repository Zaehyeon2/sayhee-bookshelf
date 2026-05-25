interface Props {
  className?: string
}

export function Skeleton({ className = '' }: Props) {
  return (
    <div
      aria-hidden
      className={`bg-[var(--color-surface-2)] animate-pulse rounded-[var(--radius-toss-sm)] ${className}`}
    />
  )
}
