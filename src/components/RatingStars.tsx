'use client'

interface Props {
  /** 1-10 정수. 짝수=full star, 홀수=half star로 렌더링됨 (10=★5, 9=★4.5, ...). */
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[16px] gap-0.5',
  md: 'text-[20px] gap-1',
  lg: 'text-[28px] gap-1',
}

function formatHalfStars(v: number): string {
  // 1-10 → "0.5", "1", "1.5", ..., "5"
  return (v / 2).toString()
}

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const editable = !!onChange
  // 1-10 정수가 prop 계약이지만 외부에서 비정수/범위초과를 넘기더라도 시각적으로 깨지지 않도록
  // 0-10 정수로 clamp + round. (Math.round(1.3)=1, Math.round(7.5)=8 → 4 full stars)
  const v = Math.max(0, Math.min(10, Math.round(value)))
  return (
    <div
      className={`inline-flex font-tabular ${SIZE[size]}`}
      aria-label={`별점 ${formatHalfStars(v)}/5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        // 이 별 슬롯의 채움 정도: 0 (empty), 1 (half), 2 (full)
        const fill = Math.max(0, Math.min(2, v - (n - 1) * 2))
        const fillPct = fill === 2 ? 100 : fill === 1 ? 50 : 0

        const starVisual = (
          <span className="relative inline-block leading-none">
            <span className="text-[var(--color-border)]">★</span>
            {fillPct > 0 && (
              <span
                className="absolute inset-0 overflow-hidden text-[var(--color-toss-yellow)]"
                style={{ width: `${fillPct}%` }}
                aria-hidden
              >
                ★
              </span>
            )}
          </span>
        )

        if (!editable) return <span key={n}>{starVisual}</span>

        // editable: 각 별을 두 클릭존(왼쪽=2n-1=half, 오른쪽=2n=full)으로 덮어 반점 선택 가능.
        const halfValue = n * 2 - 1
        const fullValue = n * 2
        return (
          <span
            key={n}
            className="group relative inline-flex items-center"
            style={{ minHeight: '44px' }}
          >
            <span className="inline-flex items-center transition-transform group-hover:scale-110">
              {starVisual}
            </span>
            <button
              type="button"
              onClick={() => onChange?.(halfValue)}
              aria-label={`${formatHalfStars(halfValue)}점`}
              className="absolute left-0 top-0 w-1/2 h-full bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 rounded-l"
            />
            <button
              type="button"
              onClick={() => onChange?.(fullValue)}
              aria-label={`${formatHalfStars(fullValue)}점`}
              className="absolute right-0 top-0 w-1/2 h-full bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50 rounded-r"
            />
          </span>
        )
      })}
    </div>
  )
}
