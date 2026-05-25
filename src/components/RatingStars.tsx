'use client'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[16px] gap-0.5',
  md: 'text-[20px] gap-1',
  lg: 'text-[28px] gap-1',
}

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const editable = !!onChange
  return (
    <div
      className={`inline-flex font-tabular ${SIZE[size]}`}
      aria-label={`별점 ${value}/5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        const color = filled ? 'text-[var(--color-toss-yellow)]' : 'text-[var(--color-border)]'
        const star = <span data-filled={filled} className={color}>★</span>
        if (!editable) return <span key={n}>{star}</span>
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            aria-label={`${n}점`}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] leading-none hover:scale-110 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/30 rounded-sm"
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
