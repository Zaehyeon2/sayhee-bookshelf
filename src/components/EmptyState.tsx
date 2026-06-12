import Link from 'next/link'

interface Props {
  emoji?: string
  title: string
  description?: string
  action?: { href: string; label: string }
}

export function EmptyState({ emoji, title, description, action }: Props) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-10 sm:p-12 text-center">
      {emoji && (
        <div className="text-[40px] leading-none" aria-hidden>
          {emoji}
        </div>
      )}
      <p className="mt-4 text-[16px] font-semibold text-[var(--color-text-strong)]">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex h-11 items-center px-5 rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-[17px] font-normal hover:bg-[var(--color-accent-hover)] active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
