/**
 * 별점 스케일 단일 변환 지점.
 *
 * DB 저장값은 1~10 정수(half-star × 2, CHECK BETWEEN 1 AND 10).
 * 사용자에게 보이는 모든 별점은 ÷2 = 0.5~5 스케일.
 * 이 변환을 인라인 `/2`로 흩뿌리지 말고 반드시 여기를 거칠 것 —
 * 스케일 정책 변경 시 단일 수정 지점 유지.
 */

/** 저장값(1~10) → 표시값(0.5~5) 숫자. */
export function ratingToDisplay(raw: number): number {
  return raw / 2
}

/** "★ 4.5" 류 고정 소수 1자리 표기. null(기록 없음)은 '-'. */
export function formatRating(raw: number | null): string {
  return raw === null ? '-' : (raw / 2).toFixed(1)
}

/** 자연 표기("0.5", "1", "1.5", … "5") — 차트 축 라벨·half-star aria용. */
export function formatRatingCompact(raw: number): string {
  return String(raw / 2)
}
