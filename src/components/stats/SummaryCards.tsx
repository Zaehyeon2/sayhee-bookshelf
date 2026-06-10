export function SummaryCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-[var(--shadow-toss)]"
        >
          <div className="text-xs text-[var(--color-text-weak)]">{it.label}</div>
          <div className="mt-1 text-xl font-bold text-[var(--color-text-strong)]">{it.value}</div>
        </div>
      ))}
    </div>
  )
}
