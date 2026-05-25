'use client'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const sizeClass = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size]
  const editable = !!onChange
  return (
    <div className={`inline-flex gap-0.5 ${sizeClass}`} aria-label={`별점 ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        const Star = (
          <span data-filled={filled} className={filled ? 'text-amber-500' : 'text-neutral-300'}>
            ★
          </span>
        )
        if (!editable) return <span key={n}>{Star}</span>
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            aria-label={`${n}점`}
            className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            {Star}
          </button>
        )
      })}
    </div>
  )
}
