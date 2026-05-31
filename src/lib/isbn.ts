/**
 * ISBN canonical-form helpers.
 *
 * dedup invariant: works 집계(getBookAggregatesByIsbns)와 by-external 배지는
 * `books.isbn`을 GROUP BY 키로 쓴다. 같은 책이 ISBN-10과 ISBN-13으로 섞여 저장되면
 * 버킷이 갈려 평점 집계가 쪼개진다. 모든 write 경로는 저장 전 canonicalIsbn으로 통과시켜
 * 13자리 형태로 통일한다. (검색→기록 경로는 이미 pickIsbn13로 13자리만 다루지만,
 * 수동 입력 경로는 포맷 검증이 없어 10자리가 그대로 들어올 수 있다.)
 */

/** ISBN-10 → ISBN-13 변환 (Bookland EAN, 978 prefix). 입력은 10자리 숫자열 가정. */
export function isbn10to13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return body + check
}

/**
 * 저장/조회용 canonical 형태로 정규화.
 * - 10자리 숫자열 → ISBN-13으로 변환
 * - 그 외(13자리, 자유 입력 문자열)는 그대로 보존(trim만)
 */
export function canonicalIsbn(raw: string): string {
  const s = raw.trim()
  return /^\d{10}$/.test(s) ? isbn10to13(s) : s
}
