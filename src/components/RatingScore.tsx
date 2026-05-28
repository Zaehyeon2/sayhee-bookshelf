interface Props {
  // 0-10 정수 (half-star × 2). 표시는 5점 만점으로 정규화.
  value: number
}

// 카드 컴팩트 표기: "★ 4.5" 형태. 별 다섯 개 렌더링하는 RatingStars의 좁은-공간 대안.
export function RatingScore({ value }: Props) {
  const score = (value / 2).toFixed(1)
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-[var(--color-text-strong)] font-tabular tabular-nums"
      aria-label={`별점 ${score}점 / 5점`}
    >
      <span aria-hidden="true">★</span>
      <span>{score}</span>
    </span>
  )
}
