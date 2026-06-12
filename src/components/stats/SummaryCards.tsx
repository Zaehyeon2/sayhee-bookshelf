export function SummaryCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-[var(--radius-field)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center md:p-4"
        >
          <div className="text-[11px] text-[var(--color-text-weak)] md:text-xs">{it.label}</div>
          <div className="mt-1 text-base font-bold text-[var(--color-text-strong)] md:text-xl">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  )
}
