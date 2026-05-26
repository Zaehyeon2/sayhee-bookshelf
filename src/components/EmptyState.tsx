import Link from 'next/link'

interface Props {
  emoji: string
  title: string
  description?: string
  action?: { href: string; label: string }
}

export function EmptyState({ emoji, title, description, action }: Props) {
  return (
    <div className="rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-10 sm:p-12 text-center shadow-[var(--shadow-toss)]">
      <div className="text-[40px] leading-none" aria-hidden>
        {emoji}
      </div>
      <p className="mt-4 text-[16px] font-semibold text-[var(--color-text-strong)]">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex h-11 items-center px-5 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[14px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
