// Suspense key용 정규화 — URL param 입력 순서에 무관하게 같은 logical query는
// 같은 문자열이 되도록 키 정렬. JSON.stringify(sp)는 insertion order 의존이라
// 동일 query의 다른 순서가 가짜 unmount + skeleton flash를 일으킨다.
export function spKey(sp: Record<string, string | undefined>): string {
  return Object.entries(sp)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}
