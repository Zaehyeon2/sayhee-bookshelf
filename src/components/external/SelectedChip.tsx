'use client'

interface Props {
  title: string
  byline?: string
  coverUrl?: string | null
  onClear: () => void
  onReopen: () => void
}

export function SelectedChip({ title, byline, coverUrl, onClear, onReopen }: Props) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
      {coverUrl ? (
        // biome-ignore lint/performance/noImgElement: dynamic external URL, not bound to remotePatterns yet
        <img
          src={coverUrl}
          alt=""
          width={36}
          height={52}
          className="rounded-sm object-cover flex-shrink-0"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="w-9 h-[52px] rounded-sm bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] text-lg">
          📚
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-[var(--color-text-strong)] truncate">
          {title}
        </div>
        {byline && (
          <div className="text-[12px] text-[var(--color-text-muted)] truncate">{byline}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onReopen}
        className="text-[12px] font-medium text-[var(--color-toss-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 rounded px-1"
      >
        다시 검색
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="외부 정보 초기화"
        className="w-7 h-7 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/50"
      >
        ×
      </button>
    </div>
  )
}
